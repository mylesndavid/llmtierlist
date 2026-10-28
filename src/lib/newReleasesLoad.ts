import "server-only";
import { loadOpenRouterModels } from "./openrouterCatalog";
import { loadValueData, type ValueData } from "./valueLoad";
import { recentReleases, toReleaseEntries, type ReleaseCatalogRef, type ReleaseEntry, type ReleaseValue } from "./newReleases";

export type NewReleasesLoad =
  | { ok: true; entries: ReleaseEntry[]; valueSnapshot: string | null }
  | { ok: false; error: string };

/**
 * Models released in the last `days` days, joined with the catalog and value
 * numbers. Pass `value` when the page already loaded it. Never throws.
 */
export async function loadNewReleases(days = 30, now = new Date(), value?: ValueData): Promise<NewReleasesLoad> {
  const [or, v] = await Promise.all([loadOpenRouterModels(), value ?? loadValueData()]);
  if (!or.ok) return { ok: false, error: or.error };

  const refs = new Map<string, ReleaseCatalogRef>(v.catalog.models.map((m) => [m.id, m]));
  const values = new Map<string, ReleaseValue>();
  if (v.ok) {
    for (const r of v.result.models) {
      values.set(r.model.id, { tier: r.tier, quality: r.quality, score: r.score });
    }
  }
  return {
    ok: true,
    entries: recentReleases(toReleaseEntries(or.models, refs, values), now, days),
    valueSnapshot: v.ok ? v.snapshotDate : null,
  };
}
