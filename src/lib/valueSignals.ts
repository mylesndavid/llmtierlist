import "server-only";
import { peekArenaRatings } from "./arenaData";
import { sentimentSummary } from "./xPosts";
import { peekPanels } from "./xPostsData";
import type { ValueModel } from "./value";

/**
 * Adds the optional Sentiment and Arena columns to the home table's rows.
 * Both read only stored data: X panels from memory and one batched D1 query
 * (never a search), Arena ratings from memory or the colo cache (never
 * Hugging Face). A column is added only when its source has data for at
 * least one row; otherwise the field stays undefined and the table hides it.
 * `arenaCached` is false when Arena data was not cached, so the caller can
 * warm it after the response.
 */
export async function withTableSignals(
  models: ValueModel[]
): Promise<{ models: ValueModel[]; arenaCached: boolean }> {
  const [panels, arena] = await Promise.all([
    peekPanels(
      models.map((m) => m.id),
      { edge: false }
    ),
    peekArenaRatings(),
  ]);

  const sentiment = new Map<string, NonNullable<ValueModel["sentiment"]>>();
  for (const [id, { panel }] of panels) {
    if (!panel.scored) continue;
    const s = sentimentSummary(panel.counts);
    if (s) sentiment.set(id, { positivePct: s.positivePct, negativePct: s.negativePct, n: s.n });
  }
  const arenaText = new Map<string, number>();
  for (const m of models) {
    const r = arena?.get(m.id)?.text;
    if (r != null) arenaText.set(m.id, r);
  }

  return {
    models: models.map((m) => ({
      ...m,
      ...(sentiment.size > 0 ? { sentiment: sentiment.get(m.id) ?? null } : {}),
      ...(arenaText.size > 0 ? { arena: arenaText.get(m.id) ?? null } : {}),
    })),
    arenaCached: arena != null,
  };
}
