import { describe, expect, it } from "vitest";
import fixture from "./fixtures/or-bench-sample.json";
import { aggregateRows, isEligible, type BenchRow, type UsageStat } from "../value";
import { joinValueModels, scoreBalanced, toSnapshotRow, type CatalogRef } from "../valueRows";
import { buildVerdict, costRatioPhrase, verdictSide } from "../compareVerdict";
import { frontierPairs, popularComparisons, similarPricePairs } from "../popularPairs";

const bench = aggregateRows(fixture.rows as BenchRow[]).filter(isEligible);
const catalog = new Map<string, CatalogRef>(
  bench.map((m) => [
    m.id,
    { id: m.id, slug: m.id.replace(/[^a-z0-9]+/g, "-"), name: `Cat ${m.name}`, vendor: m.vendor, vendor_slug: m.vendorSlug },
  ])
);
const usage = new Map<string, UsageStat>([
  ["z-ai/glm-5.3-flash", { rank: 3, tokens: 9e11 }],
  ["anthropic/claude-opus-4.5", { rank: 1, tokens: 2e12 }],
]);
const result = scoreBalanced(joinValueModels(bench, catalog, usage));
const byId = new Map(result.models.map((r) => [r.model.id, r]));

describe("joinValueModels", () => {
  it("uses catalog names, slugs and usage", () => {
    const glm = byId.get("z-ai/glm-5.3-flash")!;
    expect(glm.model.name.startsWith("Cat ")).toBe(true);
    expect(glm.model.slug).toBe("z-ai-glm-5-3-flash");
    expect(glm.model.usage).toEqual({ rank: 3, tokens: 9e11 });
    expect(byId.get("google/gemini-4-argon")!.model.usage).toBeNull();
  });
  it("leaves models missing from the catalog unlinked", () => {
    const r = scoreBalanced(joinValueModels(bench, new Map(), null));
    expect(r.models.every((m) => m.model.slug === null && m.model.usage === null)).toBe(true);
    expect(r.models.every((m) => m.model.openWeights === null)).toBe(true);
  });
  it("reads open weights from the catalog license, null when unknown", () => {
    const [first, second] = bench;
    const withLicense = new Map<string, CatalogRef>([
      [first.id, { ...catalog.get(first.id)!, license: "open-weights" }],
      [second.id, { ...catalog.get(second.id)!, license: "proprietary" }],
    ]);
    const joined = new Map(joinValueModels(bench, withLicense, null).map((m) => [m.id, m]));
    expect(joined.get(first.id)!.openWeights).toBe(true);
    expect(joined.get(second.id)!.openWeights).toBe(false);
    // in the catalog without a license field: unknown
    expect(joinValueModels(bench, catalog, null).every((m) => m.openWeights === null)).toBe(true);
  });
});

describe("toSnapshotRow", () => {
  it("maps a scored row to value_snapshots columns", () => {
    const glm = byId.get("z-ai/glm-5.3-flash")!;
    const row = toSnapshotRow(glm, "2026-10-28");
    expect(Object.keys(row).sort()).toEqual(
      ["cost_per_task", "day", "gpqa", "model_id", "q", "tau", "tier", "time_per_task_s", "usage_rank", "value_score"].sort()
    );
    expect(row.day).toBe("2026-10-28");
    expect(row.model_id).toBe("z-ai/glm-5.3-flash");
    expect(row.q).toBeCloseTo(glm.quality, 2);
    expect(row.value_score).toBeCloseTo(glm.score, 2);
    expect(row.tier).toBe(glm.tier);
    expect(row.gpqa).toBeCloseTo(glm.model.metrics.gpqa_diamond!.accuracy, 4);
    expect(row.tau).toBeCloseTo(glm.model.metrics.tau_bench_verified_airline!.accuracy, 4);
    expect(row.cost_per_task! / glm.cost!).toBeCloseTo(1, 3);
    expect(row.time_per_task_s! / glm.timeS!).toBeCloseTo(1, 3);
    expect(row.usage_rank).toBe(3);
  });
  it("writes nulls for missing cost, time and usage", () => {
    const g = byId.get("google/gemini-4-argon")!;
    const row = toSnapshotRow({ ...g, cost: null, timeS: null }, "2026-10-28");
    expect([row.cost_per_task, row.time_per_task_s, row.usage_rank]).toEqual([null, null, null]);
  });
});

describe("costRatioPhrase", () => {
  it("names common fractions and falls back to percent", () => {
    expect(costRatioPhrase(0.97)).toBe("at about the same cost per task");
    expect(costRatioPhrase(0.5)).toBe("at half the cost per task");
    expect(costRatioPhrase(0.34)).toBe("at a third of the cost per task");
    expect(costRatioPhrase(0.25)).toBe("at a quarter of the cost per task");
    expect(costRatioPhrase(0.62)).toBe("at 62% of the cost per task");
    expect(costRatioPhrase(0.04)).toBe("at 1/25 of the cost per task");
  });
});

describe("buildVerdict", () => {
  it("leads with the cheaper model and states the whole-point quality gap", () => {
    expect(
      buildVerdict({ name: "Big", quality: 80.2, cost: 0.03 }, { name: "Small", quality: 77.4, cost: 0.01 })
    ).toBe("Small scores 3 points lower on quality than Big, at a third of the cost per task.");
    expect(
      buildVerdict({ name: "A", quality: 70, cost: 0.02 }, { name: "B", quality: 69.6, cost: 0.04 })
    ).toBe("A matches B on quality, at half the cost per task.");
    expect(
      buildVerdict({ name: "A", quality: 71, cost: 0.02 }, { name: "B", quality: 70, cost: 0.04 })
    ).toBe("A scores 1 point higher on quality than B, at half the cost per task.");
  });
  it("falls back to quality only when a cost is missing", () => {
    expect(buildVerdict({ name: "A", quality: 60, cost: null }, { name: "B", quality: 65, cost: 0.1 })).toBe(
      "B scores 5 points higher on quality than A. Cost per task is not published for A."
    );
  });

  it("derives every number from the scored rows the pages show", () => {
    const a = byId.get("anthropic/claude-opus-4.5")!;
    const b = byId.get("z-ai/glm-5.3-flash")!;
    const text = buildVerdict(verdictSide(a), verdictSide(b));
    const [cheap, dear] = a.cost! <= b.cost! ? [a, b] : [b, a];
    const gap = Math.round(cheap.quality - dear.quality);
    expect(text.startsWith(cheap.model.name)).toBe(true);
    expect(text).toContain(dear.model.name);
    if (gap !== 0) {
      expect(text).toContain(`${Math.abs(gap)} point`);
      expect(text).toContain(gap > 0 ? "higher" : "lower");
    }
    expect(text).toContain(costRatioPhrase(cheap.cost! / dear.cost!));
    // Same verdict regardless of argument order
    expect(buildVerdict(verdictSide(b), verdictSide(a))).toBe(text);
    // Changing a field the pages show changes the verdict
    const bumped = buildVerdict(verdictSide({ ...cheap, quality: dear.quality + 10 }), verdictSide(dear));
    expect(bumped).toContain("10 points higher");
  });
});

describe("popular comparisons", () => {
  it("pairs frontier neighbours, all linkable", () => {
    const pairs = frontierPairs(result.models);
    const frontier = result.models.filter((r) => r.frontier);
    expect(pairs.length).toBe(Math.min(4, frontier.length - 1));
    for (const p of pairs) {
      expect(p.a.frontier && p.b.frontier).toBe(true);
      expect(p.a.model.slug && p.b.model.slug).toBeTruthy();
      // neighbours: no frontier model sits between them on cost
      const [lo, hi] = [p.a.cost!, p.b.cost!].sort((x, y) => x - y);
      expect(frontier.some((r) => r.cost! > lo && r.cost! < hi)).toBe(false);
    }
  });
  it("pairs similarly priced models within the ratio, without repeats", () => {
    const pairs = similarPricePairs(result.models, 4, 100, new Set(), 100);
    const ids = pairs.flatMap((p) => [p.a.model.id, p.b.model.id]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of pairs) expect(Math.max(p.a.cost! / p.b.cost!, p.b.cost! / p.a.cost!)).toBeLessThanOrEqual(100);
    for (const p of similarPricePairs(result.models, 4, 100, new Set(), 5)) {
      expect(Math.abs(p.a.quality - p.b.quality)).toBeLessThanOrEqual(5);
    }
    expect(pairs[0]?.a.model.id).toBe("anthropic/claude-opus-4.5"); // most used first
    const all = popularComparisons(result.models);
    const keys = all.map((p) => [p.a.model.id, p.b.model.id].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
