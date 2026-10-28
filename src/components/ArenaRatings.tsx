import { getArenaForModel } from "@/lib/arenaData";
import {
  ARENA_CATEGORY_LABEL,
  ARENA_DATASET_URL,
  ciHalfWidth,
  type ArenaEntry,
} from "@/lib/arena";

export function ArenaRatingsView({ entries }: { entries: ArenaEntry[] }) {
  if (entries.length === 0) return null;
  const showName = new Set(entries.map((e) => e.name)).size > 1;
  const byCategory = new Map(entries.filter((e) => e.date).map((e) => [e.category, e.date]));
  const dates = [...byCategory].map(([c, d]) => `${ARENA_CATEGORY_LABEL[c]} ${d}`).join(", ");
  return (
    <section className="space-y-3" aria-labelledby="arena-heading">
      <h2 id="arena-heading" className="text-xl font-bold">
        Human preference (LMArena)
      </h2>
      <div className="overflow-x-auto border border-edge bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-muted">
            <tr className="border-b border-edge">
              <th className="px-3 py-2 font-semibold">Category</th>
              {showName && <th className="px-3 py-2 font-semibold">Arena entry</th>}
              <th className="px-3 py-2 text-right font-semibold">Rating</th>
              <th className="px-3 py-2 text-right font-semibold">Rank</th>
              <th className="px-3 py-2 text-right font-semibold">Votes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const ci = ciHalfWidth(e);
              return (
                <tr key={`${e.category}-${e.name}`} className="border-b border-edge last:border-0">
                  <td className="px-3 py-2 font-semibold">{ARENA_CATEGORY_LABEL[e.category]}</td>
                  {showName && <td className="px-3 py-2 text-muted">{e.name}</td>}
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {Math.round(e.rating)}
                    {ci != null && <span className="ml-1 text-xs text-muted">±{Math.round(ci)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.rank != null ? `#${e.rank}` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.votes != null ? e.votes.toLocaleString("en-US") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Human preference ratings: LMArena (
        <a href={ARENA_DATASET_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          lmarena-ai/leaderboard-dataset
        </a>
        ),{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          CC BY 4.0
        </a>
        . Overall leaderboard in each category{dates ? ` (${dates})` : ""}. ± is half the dataset&apos;s confidence interval.
      </p>
    </section>
  );
}

export default async function ArenaRatings({ modelId }: { modelId: string }) {
  const { entries } = await getArenaForModel(modelId);
  return <ArenaRatingsView entries={entries} />;
}
