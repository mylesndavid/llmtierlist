import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getBaseModelsWithStats } from "./data";
import { loadBenchmarks, loadUsage } from "./valueData";
import { rankUsage, type ScoreResult, type ScoredModel, type ValueModel } from "./value";
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

export type ValueData =
  | {
      ok: true;
      snapshotDate: string;
      usageDate: string | null;
      result: ScoreResult<ValueModel>;
      byId: Map<string, ScoredModel<ValueModel>>;
      showUsage: boolean;
    }
  | { ok: false; error: string };

/**
 * Balanced-preset value numbers for every benchmarked model, joined with the
 * catalog and 7-day usage the same way the value tier list joins them. Every
 * page that shows a tier, Q or value score reads from here.
 */
export async function loadValueData(catalog?: Catalog): Promise<ValueData> {
  const [bench, usageLoad, cat] = await Promise.all([
    loadBenchmarks(),
    loadUsage(),
    catalog ?? loadCatalog(),
  ]);
  if (!bench.ok) return { ok: false, error: bench.error };
  const usage = usageLoad.ok ? rankUsage(usageLoad.rows, bench.permaslugs) : null;
  const result = scoreBalanced(joinValueModels(bench.models, cat.byId, usage));
  return {
    ok: true,
    snapshotDate: bench.snapshotDate,
    usageDate: usageLoad.ok ? usageLoad.snapshotDate : null,
    result,
    byId: new Map(result.models.map((r) => [r.model.id, r])),
    showUsage: usage != null,
  };
}
