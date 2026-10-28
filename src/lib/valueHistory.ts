import "server-only";
import { unstable_rethrow } from "next/navigation";
import { d1Query } from "./d1";

export interface ValuePoint {
  day: string;
  value_score: number;
  q: number | null;
  tier: string | null;
}

/** Daily Balanced value score for a model (OpenRouter id), oldest first. Empty when unavailable. */
export async function getValueHistory(modelId: string, days = 180): Promise<ValuePoint[]> {
  try {
    return await d1Query<ValuePoint>(
      `select day, value_score, q, tier
       from value_snapshots
       where model_id = ? and day >= date('now', ?) and value_score is not null
       order by day`,
      [modelId, `-${days} days`]
    );
  } catch (err) {
    unstable_rethrow(err);
    // Table not created yet, or D1 unreachable: the chart just doesn't render.
    console.error("value history unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}
