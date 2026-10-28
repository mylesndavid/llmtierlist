import { describe, expect, it } from "vitest";
import fixture from "./fixtures/or-bench-sample.json";
import {
  aggregateRows,
  SHRINK_TASKS,
  benchmarkMean,
  formatTokenCount,
  formatUsage,
  halfWidth,
  isThin,
  latestUsageRows,
  presetWeights,
  rankUsage,
  sampleLabel,
  scoreModels,
  shrinkAccuracy,
  usageSlug,
  type BenchModel,
  type BenchRow,
  type UsageRow,
} from "@/lib/value";

function row(over: Partial<BenchRow>): BenchRow {
  return {
    benchmark: "gpqa_diamond",
    model_slug: "lab/model",
    model_name: "Lab: Model",
    provider_name: "auto-routing",
    accuracy: 0.5,
    run_count: 3,
    total_questions: 300,
    avg_cost_per_task_usd: 0.01,
    avg_duration_per_task_ms: 1000,
    avg_output_tokens_per_task: 1000,
    ...over,
  };
}

/** Model with equal cost/time and the same accuracy and sample on both benchmarks. */
function model(id: string, accuracy: number, tasks: number): BenchModel {
  const m = { accuracy, cost: 0.01, durationMs: 1000, outputTokens: 1000, pinned: false, runs: 3, tasks };
  return {
    id,
    name: id,
    vendor: "lab",
    vendorSlug: "lab",
    metrics: { gpqa_diamond: { ...m }, tau_bench_verified_airline: { ...m } },
  };
}

describe("sample sizes", () => {
  it("sums runs and tasks over the rows actually used", () => {
    const auto = aggregateRows([
      row({ run_count: 2, total_questions: 200 }),
      row({ run_count: 1, total_questions: 100 }),
      row({ provider_name: "ProviderA", run_count: 9, total_questions: 900 }),
    ]);
    expect(auto[0].metrics.gpqa_diamond).toMatchObject({ runs: 3, tasks: 300, pinned: false });

    const pinned = aggregateRows([
      row({ provider_name: "ProviderA", run_count: 1, total_questions: 50 }),
      row({ provider_name: "ProviderB", run_count: 3, total_questions: 146 }),
    ]);
    expect(pinned[0].metrics.gpqa_diamond).toMatchObject({ runs: 4, tasks: 196, pinned: true });
  });

  it("counts a missing run_count as zero runs", () => {
    const out = aggregateRows([row({ run_count: undefined, total_questions: 1000 })]);
    expect(out[0].metrics.gpqa_diamond!.runs).toBe(0);
  });

  it("carries runs and tasks through the dataset fixture", () => {
    const rows = fixture.rows as BenchRow[];
    const argon = aggregateRows(rows).find((m) => m.id === "google/gemini-4-argon")!;
    const tauRows = rows.filter(
      (r) => r.model_slug === "google/gemini-4-argon" && r.benchmark === "tau_bench_verified_airline"
    );
    const tau = argon.metrics.tau_bench_verified_airline!;
    expect(tau.pinned).toBe(true); // all provider rows are used
    expect(tau.runs).toBe(tauRows.reduce((s, r) => s + (r.run_count ?? 0), 0));
    expect(tau.tasks).toBe(tauRows.reduce((s, r) => s + r.total_questions, 0));
  });
});

describe("shrinkage", () => {
  it("matches a hand-computed case", () => {
    // μ = (0.9·100 + 0.6·300) / 400 = 0.675
    expect(benchmarkMean([{ accuracy: 0.9, tasks: 100 }, { accuracy: 0.6, tasks: 300 }])).toBeCloseTo(0.675);
    // A: (0.9·100 + 0.675·100) / 200 = 0.7875; B: (0.6·300 + 0.675·100) / 400 = 0.61875
    expect(shrinkAccuracy(0.9, 100, 0.675)).toBeCloseTo(0.7875);
    expect(shrinkAccuracy(0.6, 300, 0.675)).toBeCloseTo(0.61875);
    expect(SHRINK_TASKS).toBe(100);

    const res = scoreModels([model("A", 0.9, 100), model("B", 0.6, 300)], presetWeights("raw"));
    const a = res.models.find((m) => m.model.id === "A")!;
    expect(a.adjusted.gpqa_diamond).toBeCloseTo(0.7875);
    expect(a.adjusted.tau_bench_verified_airline).toBeCloseTo(0.7875);
    expect(res.models.find((m) => m.model.id === "B")!.adjusted.gpqa_diamond).toBeCloseTo(0.61875);
    // raw accuracy is kept for display
    expect(a.model.metrics.gpqa_diamond!.accuracy).toBe(0.9);
  });

  it("ranks a perfect score on 50 tasks below a slightly lower score on 2,000", () => {
    const res = scoreModels(
      [
        model("lucky", 1.0, 50),
        model("solid", 0.97, 2000),
        model("m1", 0.7, 2000),
        model("m2", 0.65, 2000),
        model("m3", 0.6, 2000),
      ],
      presetWeights("raw")
    );
    const by = Object.fromEntries(res.models.map((m) => [m.model.id, m]));
    // μ = (50 + 1940 + 1400 + 1300 + 1200) / 8050 = 5890 / 8050 ≈ 0.73168
    // lucky: (1.0·50 + 73.168) / 150 ≈ 0.82112; solid: (0.97·2000 + 73.168) / 2100 ≈ 0.95865
    expect(by.lucky.adjusted.gpqa_diamond).toBeCloseTo(0.82112, 4);
    expect(by.solid.adjusted.gpqa_diamond).toBeCloseTo(0.95865, 4);
    expect(by.solid.rank).toBe(1);
    expect(by.lucky.rank).toBe(2);
    expect(by.solid.quality).toBeGreaterThan(by.lucky.quality);
  });

  it("does not reorder models with equal task counts", () => {
    const res = scoreModels(
      [model("x", 0.9, 500), model("y", 0.8, 500), model("z", 0.7, 500)],
      presetWeights("raw")
    );
    expect(res.models.map((m) => m.model.id)).toEqual(["x", "y", "z"]);
  });
});

describe("thin flag", () => {
  it("is thin when the 95% half-width is over 5 points", () => {
    // p = 0.5: the line falls between 384 and 385 tasks
    expect(halfWidth({ accuracy: 0.5, tasks: 384 })).toBeCloseTo(0.050011, 5);
    expect(isThin({ accuracy: 0.5, tasks: 384 })).toBe(true);
    expect(halfWidth({ accuracy: 0.5, tasks: 385 })).toBeCloseTo(0.049946, 5);
    expect(isThin({ accuracy: 0.5, tasks: 385 })).toBe(false);
  });

  it("floors the variance so 0% or 100% isn't treated as certain", () => {
    // max(1·0, 0.0025) / 50 -> 1.96·sqrt(0.00005) ≈ 1.4 points
    expect(halfWidth({ accuracy: 1, tasks: 50 })).toBeCloseTo(0.01386, 4);
    expect(halfWidth({ accuracy: 1, tasks: 1 })).toBeCloseTo(0.098, 3);
    expect(isThin({ accuracy: 1, tasks: 1 })).toBe(true);
    expect(isThin({ accuracy: 0.8, tasks: 0 })).toBe(true);
  });

  it("labels runs, tasks and the interval", () => {
    expect(sampleLabel({ accuracy: 0.789, runs: 4, tasks: 196 })).toBe("4 runs, 196 tasks · ±5.7 pts");
    expect(sampleLabel({ accuracy: 0.5, runs: 1, tasks: 1 })).toBe("1 run, 1 task · ±98.0 pts");
  });

  it("flags thin results on scored models without changing tiers", () => {
    const res = scoreModels([model("big", 0.8, 2000), model("small", 0.8, 50)], presetWeights("raw"));
    expect(res.models.find((m) => m.model.id === "small")!.thin).toEqual([
      "gpqa_diamond",
      "tau_bench_verified_airline",
    ]);
    expect(res.models.find((m) => m.model.id === "big")!.thin).toEqual([]);
  });
});

function u(date: string, model_permaslug: string, total_tokens: number): UsageRow {
  return { date, model_permaslug, rank: 1, total_tokens };
}

describe("usage rankings", () => {
  it("keeps the latest 7 dates and drops the other row and malformed rows", () => {
    const rows = Array.from({ length: 10 }, (_, i) => u(`2026-10-${10 + i}`, "a/x-20260101", 1));
    rows.push(u("2026-10-19", "other", 99));
    rows.push({ date: "2026-10-19", model_permaslug: "b/y" } as UsageRow);
    const out = latestUsageRows(rows);
    expect(out.map((r) => r.date)).toEqual([
      "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19",
    ]);
    expect(out.every((r) => r.model_permaslug === "a/x-20260101")).toBe(true);
  });

  it("maps permaslugs via the benchmark pairs, then by stripping a date or variant", () => {
    const known = { "qwen/qwen3-235b-a22b-07-25": "qwen/qwen3-235b-a22b-2507" };
    expect(usageSlug("qwen/qwen3-235b-a22b-07-25", known)).toBe("qwen/qwen3-235b-a22b-2507");
    expect(usageSlug("z-ai/glm-5.3-flash-20260826", known)).toBe("z-ai/glm-5.3-flash");
    expect(usageSlug("qwen/qwen3.8-27b-20260814:free", known)).toBe("qwen/qwen3.8-27b");
    expect(usageSlug("openai/gpt-oss-120b", known)).toBe("openai/gpt-oss-120b");
  });

  it("sums 7-day tokens per model, folding variants, and ranks by total", () => {
    const rows = [
      u("2026-10-26", "a/big-20260101", 10e12),
      u("2026-10-27", "a/big-20260101", 4.1e12),
      u("2026-10-26", "b/mid-20260202", 8e12),
      u("2026-10-27", "b/mid-20260202:free", 1e12),
      u("2026-10-27", "c/small", 5e9),
    ];
    const ranked = rankUsage(rows, {});
    expect(ranked.get("a/big")?.rank).toBe(1);
    expect(ranked.get("a/big")?.tokens).toBeCloseTo(14.1e12);
    expect(ranked.get("b/mid")).toEqual({ rank: 2, tokens: 9e12 });
    expect(ranked.get("c/small")).toEqual({ rank: 3, tokens: 5e9 });
    expect(ranked.get("d/none")).toBeUndefined();
    expect(formatUsage(ranked.get("a/big")!)).toBe("#1 · 14.1T");
  });

  it("formats token counts", () => {
    expect(formatTokenCount(14.1e12)).toBe("14.1T");
    expect(formatTokenCount(850e9)).toBe("850B");
    expect(formatTokenCount(2.34e9)).toBe("2.3B");
    expect(formatTokenCount(512)).toBe("512");
  });
});
