import "server-only";
import { unstable_rethrow } from "next/navigation";
import { d1Query } from "./d1";
import { parseEpochScores, type EpochScore } from "./epoch";
import { d1Available } from "./xPanelStore";

/**
 * Epoch scores for one OpenRouter id, read from the epoch_scores table that
 * scripts/sync-epoch.mjs fills daily. Unzipping and parsing Epoch's archive
 * costs too much CPU for a Worker request, so pages only read one small row.
 * Empty when the model has no scores, the table is not there yet, or D1 is
 * unreachable (local dev without credentials). Never throws.
 */
export async function getEpochForModel(id: string): Promise<EpochScore[]> {
  if (!d1Available()) return [];
  try {
    const rows = await d1Query<{ scores: string }>("select scores from epoch_scores where model_id = ?", [id]);
    return parseEpochScores(rows[0]?.scores);
  } catch (err) {
    unstable_rethrow(err);
    console.error("epoch: scores unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}
