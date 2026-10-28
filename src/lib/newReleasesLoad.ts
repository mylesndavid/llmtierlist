import "server-only";
import { loadOpenRouterModels } from "./openrouterCatalog";
import { loadCatalog, loadValueData } from "./valueLoad";
import { recentReleases, toReleaseEntries, type ReleaseCatalogRef, type ReleaseEntry, type ReleaseValue } from "./newReleases";

export type NewReleasesLoad =
  | { ok: true; entries: ReleaseEntry[]; valueSnapshot: string | null }
  | { ok: false; error: string };

/** Models released in the last `days` days, joined with the catalog and value numbers. Never throws. */
export async function loadNewReleases(days = 30, now = new Date()): Promise<NewReleasesLoad> {
  const [or, catalog] = await Promise.all([loadOpenRouterModels(), loadCatalog()]);
  if (!or.ok) return { ok: false, error: or.error };
  const value = await loadValueData(catalog);

  const refs = new Map<string, ReleaseCatalogRef>(catalog.models.map((m) => [m.id, m]));
  const values = new Map<string, ReleaseValue>();
  if (value.ok) {
    for (const r of value.result.models) {
      values.set(r.model.id, { tier: r.tier, quality: r.quality, score: r.score });
    }
  }
  return {
    ok: true,
    entries: recentReleases(toReleaseEntries(or.models, refs, values), now, days),
    valueSnapshot: value.ok ? value.snapshotDate : null,
  };
}
