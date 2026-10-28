import { bucketByScore } from "./tiers";
import type { Tier } from "./types";

/**
 * Value tier list scoring. Pure functions only (no I/O), shared by the server
 * loader and the client controls that recompute tiers when weights change.
 */

export const BENCHMARKS = [
  {
    key: "gpqa_diamond",
    label: "GPQA Diamond",
    short: "GPQA",
    url: "https://openrouter.ai/benchmarks/gpqa-diamond",
  },
  {
    key: "tau_bench_verified_airline",
    label: "τ²-bench airline",
    short: "τ²",
    url: "https://openrouter.ai/benchmarks/tau2-bench-airline",
  },
] as const;

export type BenchmarkKey = (typeof BENCHMARKS)[number]["key"];
const BENCHMARK_KEYS: BenchmarkKey[] = BENCHMARKS.map((b) => b.key);

/** One row of the OpenRouter benchmark-leaderboard dataset. */
export interface BenchRow {
  benchmark: string;
  benchmark_page_url?: string;
  model_permaslug?: string;
  model_slug: string | null;
  model_name: string;
  provider_name: string;
  accuracy: number;
  accuracy_std_dev?: number | null;
  run_count?: number;
  total_questions: number;
  avg_cost_per_task_usd: number | null;
  avg_duration_per_task_ms: number | null;
  avg_output_tokens_per_task: number | null;
  last_run_timestamp?: string;
}

/** A model's result on one benchmark. */
export interface BenchMetric {
  accuracy: number; // 0–1
  cost: number | null; // USD per task
  durationMs: number | null; // per task
  outputTokens: number | null; // per task
  /** true when no auto-routing row existed and this is a mean over pinned providers */
  pinned: boolean;
  /** sum of run_count over the rows used */
  runs: number;
  /** sum of total_questions over the rows used */
  tasks: number;
}

/**
 * Shrinkage strength: each result is blended with the benchmark average as if
 * that average had been measured on this many extra tasks.
 */
export const SHRINK_TASKS = 100;

/** A result is thin when its 95% interval half-width is over this (5 percentage points). */
export const THIN_HALF_WIDTH = 0.05;

/** 95% interval half-width of an accuracy over `tasks` tasks, with a floor on the variance. */
export function halfWidth(m: Pick<BenchMetric, "accuracy" | "tasks">): number {
  if (!(m.tasks > 0)) return Infinity;
  const p = m.accuracy;
  return 1.96 * Math.sqrt(Math.max(p * (1 - p), 0.0025) / m.tasks);
}

export function isThin(m: Pick<BenchMetric, "accuracy" | "tasks">): boolean {
  return halfWidth(m) > THIN_HALF_WIDTH;
}

/** "4 runs, 196 tasks · ±5.7 pts" */
export function sampleLabel(m: Pick<BenchMetric, "accuracy" | "runs" | "tasks">): string {
  const hw = halfWidth(m);
  const runs = `${m.runs} run${m.runs === 1 ? "" : "s"}, ${m.tasks} task${m.tasks === 1 ? "" : "s"}`;
  return Number.isFinite(hw) ? `${runs} · ±${(hw * 100).toFixed(1)} pts` : runs;
}

/** (accuracy·tasks + μ·K) / (tasks + K): few-task results move toward the benchmark mean μ. */
export function shrinkAccuracy(accuracy: number, tasks: number, mean: number, k = SHRINK_TASKS): number {
  const t = Math.max(0, tasks);
  return (accuracy * t + mean * k) / (t + k);
}

/** Task-weighted mean accuracy; a plain mean when no result has tasks. */
export function benchmarkMean(ms: Array<Pick<BenchMetric, "accuracy" | "tasks">>): number {
  let sum = 0;
  let w = 0;
  for (const m of ms) {
    const t = Math.max(0, m.tasks);
    sum += m.accuracy * t;
    w += t;
  }
  if (w > 0) return sum / w;
  return ms.length ? ms.reduce((a, m) => a + m.accuracy, 0) / ms.length : 0;
}

export interface BenchModel {
  id: string; // OpenRouter slug, e.g. "z-ai/glm-5.3-flash"
  name: string; // dataset display name, vendor prefix stripped
  vendor: string;
  vendorSlug: string;
  metrics: Partial<Record<BenchmarkKey, BenchMetric>>;
}

export const AUTO_ROUTING = "auto-routing";

/** OpenRouter's own harness test endpoints; their runs are not a real provider's. */
const TEST_PROVIDERS = new Set(["fakeprovider"]);

/** Mean of `value` over rows, weighted by total_questions, skipping null values. */
function weightedMean(rows: BenchRow[], value: (r: BenchRow) => number | null): number | null {
  let sum = 0;
  let weight = 0;
  for (const r of rows) {
    const v = value(r);
    if (v == null || !Number.isFinite(v)) continue;
    const w = r.total_questions > 0 ? r.total_questions : 0;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}

/** "Google: Gemini 4 Argon" -> { vendor: "Google", name: "Gemini 4 Argon" } */
function splitName(raw: string): { vendor: string | null; name: string } {
  const i = raw.indexOf(": ");
  if (i > 0) return { vendor: raw.slice(0, i), name: raw.slice(i + 2) };
  return { vendor: null, name: raw };
}

/**
 * Collapse dataset rows (one per model version × provider × benchmark) into one
 * metric per model and benchmark. Auto-routing rows are preferred; without one,
 * the provider rows are averaged weighted by questions and flagged as pinned.
 * Rows without a current model_slug are skipped.
 */
export function aggregateRows(rows: BenchRow[]): BenchModel[] {
  const byModel = new Map<string, Map<BenchmarkKey, BenchRow[]>>();
  for (const r of rows) {
    if (!r.model_slug) continue;
    if (TEST_PROVIDERS.has(r.provider_name.toLowerCase())) continue;
    if (!BENCHMARK_KEYS.includes(r.benchmark as BenchmarkKey)) continue;
    if (!Number.isFinite(r.accuracy)) continue;
    let benches = byModel.get(r.model_slug);
    if (!benches) byModel.set(r.model_slug, (benches = new Map()));
    const key = r.benchmark as BenchmarkKey;
    benches.set(key, [...(benches.get(key) ?? []), r]);
  }

  const out: BenchModel[] = [];
  for (const [id, benches] of byModel) {
    const metrics: BenchModel["metrics"] = {};
    let displayName: string | null = null;
    let vendorName: string | null = null;
    for (const [key, all] of benches) {
      const auto = all.filter((r) => r.provider_name === AUTO_ROUTING);
      const used = auto.length > 0 ? auto : all;
      const accuracy = weightedMean(used, (r) => r.accuracy);
      if (accuracy == null) continue;
      metrics[key] = {
        accuracy,
        cost: weightedMean(used, (r) => r.avg_cost_per_task_usd),
        durationMs: weightedMean(used, (r) => r.avg_duration_per_task_ms),
        outputTokens: weightedMean(used, (r) => r.avg_output_tokens_per_task),
        pinned: auto.length === 0,
        runs: used.reduce((s, r) => s + (Number.isFinite(r.run_count) ? r.run_count! : 0), 0),
        tasks: used.reduce((s, r) => s + (Number.isFinite(r.total_questions) ? r.total_questions : 0), 0),
      };
      for (const r of all) {
        const parts = splitName(r.model_name);
        if (parts.vendor && !vendorName) {
          vendorName = parts.vendor;
          displayName = parts.name;
        }
        if (!displayName) displayName = parts.name;
      }
    }
    const vendorSlug = id.includes("/") ? id.slice(0, id.indexOf("/")) : "";
    out.push({
      id,
      name: displayName ?? id,
      vendor: vendorName ?? vendorSlug,
      vendorSlug,
      metrics,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Percentile rank 0–100 for each value: the share of the other values that are
 * strictly lower. The best value gets 100, the worst 0, and ties share a rank.
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // count of values strictly below v
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return (lo / (n - 1)) * 100;
  });
}

/** Geometric mean; null if any value is missing or not positive. */
export function geometricMean(values: Array<number | null | undefined>): number | null {
  if (values.length === 0) return null;
  let logSum = 0;
  for (const v of values) {
    if (v == null || !(v > 0) || !Number.isFinite(v)) return null;
    logSum += Math.log(v);
  }
  return Math.exp(logSum / values.length);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Weights {
  costWeight: number;
  timeWeight: number;
  benchmarkWeights: Record<BenchmarkKey, number>;
}

export const DEFAULT_BENCHMARK_WEIGHTS: Record<BenchmarkKey, number> = {
  gpqa_diamond: 1,
  tau_bench_verified_airline: 1,
};

export const PRESETS = [
  { key: "balanced", label: "Balanced", costWeight: 6, timeWeight: 2 },
  { key: "background", label: "Background jobs", costWeight: 10, timeWeight: 0 },
  { key: "interactive", label: "Interactive", costWeight: 4, timeWeight: 6 },
  { key: "raw", label: "Raw intelligence", costWeight: 0, timeWeight: 0 },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];
export const DEFAULT_PRESET: PresetKey = "balanced";

export function presetByKey(key: string | null | undefined) {
  return PRESETS.find((p) => p.key === key) ?? null;
}

export function presetWeights(key: PresetKey): Weights {
  const p = presetByKey(key)!;
  return {
    costWeight: p.costWeight,
    timeWeight: p.timeWeight,
    benchmarkWeights: { ...DEFAULT_BENCHMARK_WEIGHTS },
  };
}

export interface ScoredModel<M extends BenchModel = BenchModel> {
  model: M;
  /** percentile rank per benchmark, 0–100 */
  percentiles: Record<BenchmarkKey, number>;
  quality: number; // Q, 0–100
  cost: number | null; // geometric mean USD per task
  timeS: number | null; // geometric mean seconds per task
  tokens: number | null; // geometric mean output tokens per task
  score: number;
  missingCost: boolean;
  missingTime: boolean;
  /** on the quality/cost Pareto frontier */
  frontier: boolean;
  /** best model that beats this one on quality and cost, if any */
  dominatedBy: M | null;
  /** accuracy after shrinkage toward the benchmark mean; what percentiles rank */
  adjusted: Record<BenchmarkKey, number>;
  /** benchmarks whose result is thin (display only) */
  thin: BenchmarkKey[];
  tier: Tier;
  rank: number; // 1-based, by score
}

export interface ScoreResult<M extends BenchModel = BenchModel> {
  models: ScoredModel<M>[]; // sorted by rank
  medianCost: number | null;
  medianTimeS: number | null;
  tiers: Map<Tier, ScoredModel<M>[]>;
}

export function isEligible(m: BenchModel): boolean {
  return BENCHMARK_KEYS.every((k) => m.metrics[k] != null);
}

/** Q as the weighted mean of per-benchmark percentiles; equal weights if all are zero. */
export function qualityOf(
  percentiles: Record<BenchmarkKey, number>,
  weights: Record<BenchmarkKey, number>
): number {
  let total = 0;
  for (const k of BENCHMARK_KEYS) total += Math.max(0, weights[k] ?? 0);
  let sum = 0;
  for (const k of BENCHMARK_KEYS) {
    const w = total > 0 ? Math.max(0, weights[k] ?? 0) / total : 1 / BENCHMARK_KEYS.length;
    sum += w * percentiles[k];
  }
  return sum;
}

/** Score = Q − costWeight·log2(C / median C) − timeWeight·log2(T / median T). A missing term counts as 0. */
export function valueScore(
  quality: number,
  cost: number | null,
  timeS: number | null,
  medianCost: number | null,
  medianTimeS: number | null,
  costWeight: number,
  timeWeight: number
): number {
  let score = quality;
  if (cost != null && medianCost != null && costWeight !== 0) {
    score -= costWeight * Math.log2(cost / medianCost);
  }
  if (timeS != null && medianTimeS != null && timeWeight !== 0) {
    score -= timeWeight * Math.log2(timeS / medianTimeS);
  }
  return score;
}

/**
 * For each item, the best item that dominates it on (quality higher, cost lower):
 * Q ≥ and C ≤ with at least one strict. "Best" is highest Q, then lowest C.
 * Items without a cost are never compared (null for them and never a dominator).
 */
export function findDominators<T>(
  items: T[],
  qualityOfItem: (t: T) => number,
  costOfItem: (t: T) => number | null
): Array<T | null> {
  return items.map((a) => {
    const qa = qualityOfItem(a);
    const ca = costOfItem(a);
    if (ca == null) return null;
    let best: T | null = null;
    for (const b of items) {
      if (b === a) continue;
      const qb = qualityOfItem(b);
      const cb = costOfItem(b);
      if (cb == null) continue;
      const dominates = qb >= qa && cb <= ca && (qb > qa || cb < ca);
      if (!dominates) continue;
      if (
        best == null ||
        qb > qualityOfItem(best) ||
        (qb === qualityOfItem(best) && cb < costOfItem(best)!)
      ) {
        best = b;
      }
    }
    return best;
  });
}

/** Score every eligible model and bucket them into tiers. */
export function scoreModels<M extends BenchModel>(models: M[], weights: Weights): ScoreResult<M> {
  const eligible = models.filter(isEligible);

  // Shrink each accuracy toward its benchmark's task-weighted mean, then rank.
  const adjustedByBench = new Map<BenchmarkKey, number[]>();
  const percentilesByBench = new Map<BenchmarkKey, number[]>();
  for (const k of BENCHMARK_KEYS) {
    const ms = eligible.map((m) => m.metrics[k]!);
    const mean = benchmarkMean(ms);
    const adjusted = ms.map((m) => shrinkAccuracy(m.accuracy, m.tasks, mean));
    adjustedByBench.set(k, adjusted);
    percentilesByBench.set(k, percentileRanks(adjusted));
  }

  const base = eligible.map((model, i) => {
    const percentiles = Object.fromEntries(
      BENCHMARK_KEYS.map((k) => [k, percentilesByBench.get(k)![i]])
    ) as Record<BenchmarkKey, number>;
    const adjusted = Object.fromEntries(
      BENCHMARK_KEYS.map((k) => [k, adjustedByBench.get(k)![i]])
    ) as Record<BenchmarkKey, number>;
    const ms = BENCHMARK_KEYS.map((k) => model.metrics[k]!);
    const durations = ms.map((m) => (m.durationMs == null ? null : m.durationMs / 1000));
    return {
      model,
      adjusted,
      percentiles,
      quality: qualityOf(percentiles, weights.benchmarkWeights),
      cost: geometricMean(ms.map((m) => m.cost)),
      timeS: geometricMean(durations),
      tokens: geometricMean(ms.map((m) => m.outputTokens)),
    };
  });

  const medianCost = median(base.flatMap((b) => (b.cost == null ? [] : [b.cost])));
  const medianTimeS = median(base.flatMap((b) => (b.timeS == null ? [] : [b.timeS])));

  const dominators = findDominators(base, (b) => b.quality, (b) => b.cost);

  const scored = base.map((b, i) => ({
    ...b,
    score: valueScore(
      b.quality,
      b.cost,
      b.timeS,
      medianCost,
      medianTimeS,
      weights.costWeight,
      weights.timeWeight
    ),
    missingCost: b.cost == null,
    missingTime: b.timeS == null,
    frontier: b.cost != null && dominators[i] == null,
    dominatedBy: dominators[i]?.model ?? null,
    thin: BENCHMARK_KEYS.filter((k) => isThin(b.model.metrics[k]!)),
    tier: "F" as Tier,
    rank: 0,
  }));

  const tiers = bucketByScore(scored, (s) => s.score, (s) => s.model.name);
  for (const [tier, rows] of tiers) for (const r of rows) r.tier = tier;

  const ranked = [...scored].sort(
    (a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name)
  );
  ranked.forEach((r, i) => (r.rank = i + 1));

  return { models: ranked, medianCost, medianTimeS, tiers };
}

/** Benchmark model joined with the site catalog, as sent to the client. */
export interface ValueModel extends BenchModel {
  /** catalog slug for /models/<slug>; null when the model is not in the catalog */
  slug: string | null;
  /** 7-day OpenRouter usage; null when outside the published top list (or usage is unavailable) */
  usage: UsageStat | null;
  /** from the catalog's license; null when the model is not in the catalog */
  openWeights?: boolean | null;
  /** community sentiment (from getCachedSentiment); undefined until wired in, null when there is none */
  sentiment?: SentimentStat | null;
  /** Arena rating (from getArenaRatings); undefined until wired in, null when unrated */
  arena?: number | null;
}

export interface SentimentStat {
  positivePct: number;
  negativePct: number;
  n: number;
}

/** One row of OpenRouter's rankings-daily dataset. */
export interface UsageRow {
  date: string; // YYYY-MM-DD
  model_permaslug: string;
  rank: number;
  total_tokens: number;
  share_of_daily_tokens?: number;
}

export interface UsageStat {
  rank: number; // 1-based, by tokens over the window
  tokens: number; // total tokens over the window
}

export const USAGE_DAYS = 7;

/** Rows from the latest `days` dates, without the aggregate "other" row or malformed rows. */
export function latestUsageRows(rows: UsageRow[], days = USAGE_DAYS): UsageRow[] {
  const valid = rows.filter(
    (r) =>
      r != null &&
      typeof r.date === "string" &&
      typeof r.model_permaslug === "string" &&
      r.model_permaslug !== "other" &&
      Number.isFinite(r.total_tokens)
  );
  const dates = new Set([...new Set(valid.map((r) => r.date))].sort().slice(-days));
  return valid.filter((r) => dates.has(r.date));
}

/**
 * Model slug for a rankings permaslug: the benchmark dataset's own
 * permaslug → slug pair when it has one, else the permaslug without a
 * ":variant" suffix and a trailing -YYYYMMDD version date.
 */
export function usageSlug(permaslug: string, known: Record<string, string>): string {
  const base = permaslug.replace(/:[^/]*$/, "");
  return known[base] ?? known[permaslug] ?? base.replace(/-\d{8}$/, "");
}

/**
 * Sum tokens per model slug (variants such as ":free" fold into their model)
 * and rank by that total, highest first.
 */
export function rankUsage(rows: UsageRow[], known: Record<string, string>): Map<string, UsageStat> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const slug = usageSlug(r.model_permaslug, known);
    totals.set(slug, (totals.get(slug) ?? 0) + r.total_tokens);
  }
  const ranked = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(ranked.map(([slug, tokens], i) => [slug, { rank: i + 1, tokens }]));
}

/** 14_100_000_000_000 -> "14.1T" */
export function formatTokenCount(n: number): string {
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${unit}`;
    }
  }
  return String(Math.round(n));
}

export function formatUsage(u: UsageStat): string {
  return `#${u.rank} · ${formatTokenCount(u.tokens)}`;
}

export function formatCost(usd: number | null): string {
  if (usd == null) return "—";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s >= 90) return `${(s / 60).toFixed(1)} min`;
  return `${s >= 10 ? Math.round(s) : s.toFixed(1)} s`;
}

export function formatTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function formatPct(accuracy: number): string {
  return `${(accuracy * 100).toFixed(1)}%`;
}
