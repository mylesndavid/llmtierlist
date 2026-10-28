import {
  presetWeights,
  scoreModels,
  type BenchModel,
  type ScoreResult,
  type ScoredModel,
  type UsageStat,
  type ValueModel,
} from "./value";

/**
 * Pure helpers shared by every page that shows value numbers, so a model's
 * tier, Q and value score are computed one way everywhere. No I/O here.
 */

/** The catalog fields the value join needs. */
export interface CatalogRef {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  vendor_slug: string;
}

/** Join benchmark models with the catalog and usage, as the value tier list does. */
export function joinValueModels(
  bench: BenchModel[],
  catalog: Map<string, CatalogRef>,
  usage: Map<string, UsageStat> | null
): ValueModel[] {
  return bench.map((m) => {
    const c = catalog.get(m.id);
    const u = usage?.get(m.id) ?? null;
    return c
      ? { ...m, name: c.name, vendor: c.vendor, vendorSlug: c.vendor_slug, slug: c.slug, usage: u }
      : { ...m, slug: null, usage: u };
  });
}

/** Score with the Balanced preset (the default everywhere outside the tier list controls). */
export function scoreBalanced(models: ValueModel[]): ScoreResult<ValueModel> {
  return scoreModels(models, presetWeights("balanced"));
}

/** One row of the value_snapshots table. Column names match db/schema.sql. */
export interface ValueSnapshotRow {
  day: string;
  model_id: string;
  q: number;
  value_score: number;
  tier: string;
  gpqa: number;
  tau: number;
  cost_per_task: number | null;
  time_per_task_s: number | null;
  usage_rank: number | null;
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};
const sig = (v: number | null) => (v == null ? null : Number(v.toPrecision(4)));

/** Map a scored model to its snapshot row for `day` (the benchmark snapshot date). */
export function toSnapshotRow(r: ScoredModel<ValueModel>, day: string): ValueSnapshotRow {
  return {
    day,
    model_id: r.model.id,
    q: round(r.quality, 2),
    value_score: round(r.score, 2),
    tier: r.tier,
    gpqa: round(r.model.metrics.gpqa_diamond!.accuracy, 4),
    tau: round(r.model.metrics.tau_bench_verified_airline!.accuracy, 4),
    cost_per_task: sig(r.cost),
    time_per_task_s: sig(r.timeS),
    usage_rank: r.model.usage?.rank ?? null,
  };
}
