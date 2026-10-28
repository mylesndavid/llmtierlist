import { describe, expect, it } from "vitest";
import fixture from "./fixtures/or-bench-sample.json";
import { bucketByScore } from "../tiers";
import {
  aggregateRows,
  findDominators,
  geometricMean,
  median,
  percentileRanks,
  presetWeights,
  qualityOf,
  scoreModels,
  valueScore,
  type BenchModel,
  type BenchRow,
} from "../value";

const rows = fixture.rows as BenchRow[];

function row(over: Partial<BenchRow>): BenchRow {
  return {
    benchmark: "gpqa_diamond",
    model_slug: "lab/model",
    model_name: "Lab: Model",
    provider_name: "auto-routing",
    accuracy: 0.5,
    total_questions: 100,
    avg_cost_per_task_usd: 0.01,
    avg_duration_per_task_ms: 1000,
    avg_output_tokens_per_task: 1000,
    ...over,
  };
}

function model(id: string, gpqa: [number, number, number], tau: [number, number, number]): BenchModel {
  const m = ([accuracy, cost, durationMs]: [number, number, number]) => ({
    accuracy,
    cost,
    durationMs,
    outputTokens: 1000,
    pinned: false,
    runs: 5,
    tasks: 500,
  });
  return {
    id,
    name: id,
    vendor: "lab",
    vendorSlug: "lab",
    metrics: { gpqa_diamond: m(gpqa), tau_bench_verified_airline: m(tau) },
  };
}

describe("percentileRanks", () => {
  it("ranks 0–100 by share of values strictly lower", () => {
    expect(percentileRanks([0.9, 0.5, 0.7])).toEqual([100, 0, 50]);
  });

  it("gives tied values the same rank", () => {
    // sorted: 0.2, 0.5, 0.5, 0.9 -> 0.5 has one value below it of 3 others
    const r = percentileRanks([0.5, 0.9, 0.2, 0.5]);
    expect(r[0]).toBeCloseTo(100 / 3);
    expect(r[3]).toBeCloseTo(100 / 3);
    expect(r[1]).toBe(100);
    expect(r[2]).toBe(0);
  });

  it("handles one or zero values", () => {
    expect(percentileRanks([0.4])).toEqual([100]);
    expect(percentileRanks([])).toEqual([]);
  });
});

describe("geometricMean and median", () => {
  it("computes the geometric mean", () => {
    expect(geometricMean([0.01, 0.04])).toBeCloseTo(0.02);
    expect(geometricMean([2, 8])).toBeCloseTo(4);
    expect(geometricMean([5])).toBeCloseTo(5);
  });

  it("returns null for missing or non-positive values", () => {
    expect(geometricMean([0.01, null])).toBeNull();
    expect(geometricMean([0.01, 0])).toBeNull();
    expect(geometricMean([])).toBeNull();
  });

  it("computes the median for odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("valueScore", () => {
  it("matches a hand-computed case", () => {
    // Q 60; cost 4x median: 6·log2(4) = 12 off; time half the median: 2·log2(0.5) = -2 -> +2
    expect(valueScore(60, 0.04, 5, 0.01, 10, 6, 2)).toBeCloseTo(50);
  });

  it("treats a missing cost or time term as 0", () => {
    expect(valueScore(60, null, 5, 0.01, 10, 6, 2)).toBeCloseTo(62);
    expect(valueScore(60, 0.04, null, 0.01, 10, 6, 2)).toBeCloseTo(48);
  });

  it("is just Q with zero weights", () => {
    expect(valueScore(42, 1, 100, 0.01, 1, 0, 0)).toBe(42);
  });
});

describe("qualityOf", () => {
  it("weights benchmark percentiles", () => {
    const p = { gpqa_diamond: 100, tau_bench_verified_airline: 40 };
    expect(qualityOf(p, { gpqa_diamond: 1, tau_bench_verified_airline: 1 })).toBe(70);
    expect(qualityOf(p, { gpqa_diamond: 3, tau_bench_verified_airline: 1 })).toBe(85);
    expect(qualityOf(p, { gpqa_diamond: 0, tau_bench_verified_airline: 1 })).toBe(40);
    // all zero falls back to equal weights
    expect(qualityOf(p, { gpqa_diamond: 0, tau_bench_verified_airline: 0 })).toBe(70);
  });
});

describe("findDominators", () => {
  type P = { id: string; q: number; c: number | null };
  const pts: P[] = [
    { id: "X", q: 80, c: 1 },
    { id: "Y", q: 90, c: 1 },
    { id: "Z", q: 90, c: 0.5 },
    { id: "W", q: 70, c: 2 },
    { id: "V", q: 50, c: null },
    { id: "P1", q: 10, c: 0.1 },
    { id: "P2", q: 10, c: 0.1 },
  ];
  const doms = findDominators(pts, (p) => p.q, (p) => p.c).map((d) => d?.id ?? null);
  const by = Object.fromEntries(pts.map((p, i) => [p.id, doms[i]]));

  it("picks the dominator with the highest quality, then lowest cost", () => {
    expect(by.X).toBe("Z");
    expect(by.W).toBe("Z");
  });

  it("counts equal quality at lower cost as dominating", () => {
    expect(by.Y).toBe("Z");
  });

  it("leaves frontier points, identical points and cost-less points undominated", () => {
    expect(by.Z).toBeNull();
    expect(by.V).toBeNull();
    expect(by.P1).toBeNull();
    expect(by.P2).toBeNull();
  });
});

describe("aggregateRows", () => {
  it("prefers the auto-routing row over pinned providers", () => {
    const out = aggregateRows([
      row({ provider_name: "auto-routing", accuracy: 0.8, avg_cost_per_task_usd: 0.03 }),
      row({ provider_name: "ProviderA", accuracy: 0.2, avg_cost_per_task_usd: 0.5, total_questions: 1000 }),
    ]);
    expect(out[0].metrics.gpqa_diamond).toMatchObject({ accuracy: 0.8, cost: 0.03, pinned: false });
  });

  it("falls back to a question-weighted mean over providers and flags it pinned", () => {
    const out = aggregateRows([
      row({ provider_name: "ProviderA", accuracy: 0.5, total_questions: 100, avg_cost_per_task_usd: 0.02, avg_duration_per_task_ms: 1000 }),
      row({ provider_name: "ProviderB", accuracy: 0.8, total_questions: 300, avg_cost_per_task_usd: null, avg_duration_per_task_ms: 5000 }),
    ]);
    const m = out[0].metrics.gpqa_diamond!;
    expect(m.pinned).toBe(true);
    expect(m.accuracy).toBeCloseTo((0.5 * 100 + 0.8 * 300) / 400);
    expect(m.cost).toBeCloseTo(0.02); // null cost skipped
    expect(m.durationMs).toBeCloseTo((1000 * 100 + 5000 * 300) / 400);
  });

  it("ignores OpenRouter's harness test provider", () => {
    const out = aggregateRows([
      row({ provider_name: "ProviderA", accuracy: 0.7, total_questions: 100 }),
      row({ provider_name: "FakeProvider", accuracy: 0.1, total_questions: 1000 }),
    ]);
    expect(out[0].metrics.gpqa_diamond!.accuracy).toBeCloseTo(0.7);
  });

  it("weights several auto-routing rows (model versions) by questions", () => {
    const out = aggregateRows([
      row({ accuracy: 0.6, total_questions: 100 }),
      row({ accuracy: 0.9, total_questions: 200 }),
      row({ provider_name: "ProviderA", accuracy: 0.1 }),
    ]);
    expect(out[0].metrics.gpqa_diamond!.accuracy).toBeCloseTo(0.8);
  });

  it("parses the dataset fixture", () => {
    const models = aggregateRows(rows);
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain(null);
    expect(ids).toContain("z-ai/glm-5.3-flash");

    const glm = models.find((m) => m.id === "z-ai/glm-5.3-flash")!;
    const auto = rows.find(
      (r) => r.model_slug === "z-ai/glm-5.3-flash" && r.benchmark === "gpqa_diamond" && r.provider_name === "auto-routing"
    )!;
    expect(glm.metrics.gpqa_diamond!.accuracy).toBeCloseTo(auto.accuracy);
    expect(glm.metrics.gpqa_diamond!.pinned).toBe(false);
    expect(glm.vendorSlug).toBe("z-ai");
    expect(glm.name).not.toContain(":");

    // The fixture has no auto-routing tau² row for Gemini 4 Argon.
    const argon = models.find((m) => m.id === "google/gemini-4-argon")!;
    expect(argon.metrics.tau_bench_verified_airline!.pinned).toBe(true);
    expect(argon.metrics.gpqa_diamond!.pinned).toBe(false);
    expect(argon.vendor).toBe("Google");
  });
});

describe("bucketByScore", () => {
  it("uses the S 10 / A 30 / B 55 / C 80 / D 95 / F cutoffs", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: `m${String(i).padStart(2, "0")}`, s: 100 - i }));
    const tiers = bucketByScore(items, (x) => x.s, (x) => x.name);
    expect(["S", "A", "B", "C", "D", "F"].map((t) => tiers.get(t)!.length)).toEqual([2, 4, 5, 5, 3, 1]);
  });

  it("keeps tied scores in the same tier", () => {
    const items = [10, 9, 9, 9, 1].map((s, i) => ({ name: `m${i}`, s }));
    const tiers = bucketByScore(items, (x) => x.s, (x) => x.name);
    // m1 at index 1 (20%) lands in A; its ties follow it there
    expect(tiers.get("S")!.map((x) => x.name)).toEqual(["m0"]);
    expect(tiers.get("A")!.map((x) => x.name)).toEqual(["m1", "m2", "m3"]);
  });

  it("puts everything in B when all scores are equal", () => {
    const items = [5, 5, 5].map((s, i) => ({ name: `m${i}`, s }));
    expect(bucketByScore(items, (x) => x.s, (x) => x.name).get("B")!.length).toBe(3);
  });
});

function gpqaOnly(id: string): BenchModel {
  const m = model(id, [0.95, 1, 1000], [0.95, 1, 1000]);
  delete m.metrics.tau_bench_verified_airline;
  return m;
}

describe("scoreModels", () => {
  // gpqa percentiles: A 100, B 50, C 0; tau²: A 50, B 0, C 100 -> Q: A 75, B 25, C 50
  // cost geomeans: A 0.04, B 0.01, C 0.02 (median 0.02); time: A 10s, B 5s, C 20s (median 10s)
  const models = [
    model("A", [0.9, 0.04, 10000], [0.8, 0.04, 10000]),
    model("B", [0.7, 0.01, 5000], [0.6, 0.01, 5000]),
    model("C", [0.5, 0.01, 20000], [0.9, 0.04, 20000]),
    gpqaOnly("D"),
  ];

  it("scores a hand-computed case with the Balanced preset", () => {
    const res = scoreModels(models, presetWeights("balanced"));
    const by = Object.fromEntries(res.models.map((m) => [m.model.id, m]));
    expect(Object.keys(by).sort()).toEqual(["A", "B", "C"]); // D lacks tau² and is not eligible
    expect(by.A.quality).toBeCloseTo(75);
    expect(by.B.quality).toBeCloseTo(25);
    expect(by.C.quality).toBeCloseTo(50);
    expect(res.medianCost).toBeCloseTo(0.02);
    expect(res.medianTimeS).toBeCloseTo(10);
    // A: 75 − 6·log2(2) − 2·log2(1) = 69
    // B: 25 − 6·log2(0.5) − 2·log2(0.5) = 33
    // C: 50 − 6·log2(1) − 2·log2(2) = 48
    expect(by.A.score).toBeCloseTo(69);
    expect(by.B.score).toBeCloseTo(33);
    expect(by.C.score).toBeCloseTo(48);
    expect(res.models.map((m) => m.model.id)).toEqual(["A", "C", "B"]);
    expect(res.models.map((m) => m.rank)).toEqual([1, 2, 3]);
    expect(res.models.every((m) => m.frontier)).toBe(true);
  });

  it("marks a dominated model and its dominator", () => {
    const res = scoreModels(
      [...models.slice(0, 3), model("E", [0.6, 0.05, 1000], [0.55, 0.05, 1000])],
      presetWeights("raw")
    );
    const e = res.models.find((m) => m.model.id === "E")!;
    expect(e.frontier).toBe(false);
    expect(e.dominatedBy?.id).toBe("A");
    // raw intelligence: score is Q
    expect(e.score).toBeCloseTo(e.quality);
  });

  it("flags missing cost and leaves that term out", () => {
    const noCost = model("N", [0.8, 0.01, 10000], [0.7, 0.01, 10000]);
    noCost.metrics.gpqa_diamond!.cost = null;
    const res = scoreModels([...models.slice(0, 3), noCost], presetWeights("background"));
    const n = res.models.find((m) => m.model.id === "N")!;
    expect(n.missingCost).toBe(true);
    expect(n.frontier).toBe(false);
    expect(n.dominatedBy).toBeNull();
    expect(n.score).toBeCloseTo(n.quality);
  });
});
