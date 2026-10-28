import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getBaseModelsWithStats } from "./data";
import { loadBenchmarks, loadUsage, type BenchmarkLoad, type UsageLoad } from "./valueData";
import { rankUsage, type ValueModel } from "./value";
import type { ModelWithStats } from "./types";

async function catalogById(): Promise<Map<string, ModelWithStats>> {
  try {
    const models = await getBaseModelsWithStats();
    return new Map(models.map((m) => [m.id, m]));
  } catch (err) {
    unstable_rethrow(err); // let Next's own control-flow errors through
    // The view still renders from benchmark data alone (also covers local dev without D1).
    console.error("value view: catalog unavailable:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

export interface ValueView {
  bench: BenchmarkLoad;
  usage: UsageLoad;
  /** benchmark models joined with the catalog; empty when benchmarks are unavailable */
  models: ValueModel[];
  showUsage: boolean;
  /** at least one model has license data from the catalog */
  showOpenWeights: boolean;
}

/** Benchmarks, 7-day usage and the D1 catalog, joined for the value view. Never throws. */
export async function loadValueView(): Promise<ValueView> {
  const [bench, catalog, usageLoad] = await Promise.all([loadBenchmarks(), catalogById(), loadUsage()]);
  const usage = bench.ok && usageLoad.ok ? rankUsage(usageLoad.rows, bench.permaslugs) : null;

  const models: ValueModel[] = bench.ok
    ? bench.models.map((m) => {
        const c = catalog.get(m.id);
        const u = usage?.get(m.id) ?? null;
        // Optional columns: add `sentiment: getCachedSentiment(m.id)` or `arena: ...` here
        // and the table shows the column.
        return c
          ? {
              ...m,
              name: c.name,
              vendor: c.vendor,
              vendorSlug: c.vendor_slug,
              slug: c.slug,
              usage: u,
              openWeights: c.license === "open-weights",
            }
          : { ...m, slug: null, usage: u, openWeights: null };
      })
    : [];

  return {
    bench,
    usage: usageLoad,
    models,
    showUsage: usage != null,
    showOpenWeights: models.some((m) => m.openWeights != null),
  };
}
