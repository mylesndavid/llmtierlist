import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getBaseModelsWithStats } from "./data";
import { loadBenchmarks, loadUsage, type BenchmarkLoad, type UsageLoad } from "./valueData";
import { rankUsage, type ScoreResult, type ScoredModel, type UsageStat, type ValueModel } from "./value";
import { joinValueModels, scoreBalanced } from "./valueRows";
import { catalogFromOpenRouter, loadOpenRouterModels } from "./openrouterCatalog";
import type { ModelWithStats } from "./types";

export interface Catalog {
  /** "d1" is the real catalog with community stats; "openrouter" is the fallback without them */
  source: "d1" | "openrouter" | "none";
  models: ModelWithStats[];
  byId: Map<string, ModelWithStats>;
  bySlug: Map<string, ModelWithStats>;
}

function catalogOf(source: Catalog["source"], models: ModelWithStats[]): Catalog {
  return {
    source,
    models,
    byId: new Map(models.map((m) => [m.id, m])),
    bySlug: new Map(models.map((m) => [m.slug, m])),
  };
}

/** Base-model catalog from D1, falling back to the OpenRouter list when D1 is unreachable. Never throws. */
export async function loadCatalog(): Promise<Catalog> {
  try {
    return catalogOf("d1", await getBaseModelsWithStats());
  } catch (err) {
    unstable_rethrow(err);
    console.error("catalog unavailable, using OpenRouter list:", err instanceof Error ? err.message : err);
  }
  const or = await loadOpenRouterModels();
  return or.ok ? catalogOf("openrouter", catalogFromOpenRouter(or.models)) : catalogOf("none", []);
}

interface ValueDataCommon {
  bench: BenchmarkLoad;
  usageLoad: UsageLoad;
  catalog: Catalog;
  /**
   * 7-day usage rank for every model in OpenRouter's published top list, not
   * only benchmarked ones; null when usage is unavailable.
   */
  usage: Map<string, UsageStat> | null;
}

export type ValueData = ValueDataCommon &
  (
    | {
        ok: true;
        snapshotDate: string;
        usageDate: string | null;
        /** benchmarked models joined with the catalog and usage, unscored (the home page scores them per preset) */
        models: ValueModel[];
        /** `models` scored with the Balanced preset */
        result: ScoreResult<ValueModel>;
        byId: Map<string, ScoredModel<ValueModel>>;
        showUsage: boolean;
        /** at least one model has license data from the catalog */
        showOpenWeights: boolean;
      }
    | { ok: false; error: string }
  );

/**
 * The one value loader. Benchmarks, 7-day usage and the catalog, joined once
 * and scored with the Balanced preset. The home page, /compare, /new, /buzz
 * and /api/value.json all read from here, so a model's tier, Q and value
 * score are the same on every page. Pass `catalog` when the caller already
 * loaded it. Never throws.
 */
export async function loadValueData(catalog?: Catalog): Promise<ValueData> {
  const [bench, usageLoad, cat] = await Promise.all([
    loadBenchmarks(),
    loadUsage(),
    catalog ?? loadCatalog(),
  ]);
  const usage = usageLoad.ok ? rankUsage(usageLoad.rows, bench.ok ? bench.permaslugs : {}) : null;
  const common: ValueDataCommon = { bench, usageLoad, catalog: cat, usage };
  if (!bench.ok) return { ...common, ok: false, error: bench.error };

  const models = joinValueModels(bench.models, cat.byId, usage);
  const result = scoreBalanced(models);
  return {
    ...common,
    ok: true,
    snapshotDate: bench.snapshotDate,
    usageDate: usageLoad.ok ? usageLoad.snapshotDate : null,
    models,
    result,
    byId: new Map(result.models.map((r) => [r.model.id, r])),
    showUsage: usage != null,
    showOpenWeights: models.some((m) => m.openWeights != null),
  };
}
