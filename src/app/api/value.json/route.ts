import { loadValueData } from "@/lib/valueLoad";
import { toSnapshotRow } from "@/lib/valueRows";

export const dynamic = "force-dynamic";

/**
 * Balanced-preset value rows for every benchmarked model, keyed by the
 * benchmark snapshot date. Read-only; scripts/snapshot-value.mjs stores these
 * daily in value_snapshots.
 */
export async function GET() {
  const data = await loadValueData();
  if (!data.ok) {
    return Response.json(
      { error: "benchmark data unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(
    {
      preset: "balanced",
      snapshotDate: data.snapshotDate,
      usageDate: data.usageDate,
      source: "OpenRouter benchmark-leaderboard and rankings-daily datasets, CC BY 4.0",
      rows: data.result.models.map((r) => toSnapshotRow(r, data.snapshotDate)),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
