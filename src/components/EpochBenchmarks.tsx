import { getEpochForModel } from "@/lib/epochData";
import { EPOCH_HUB_URL, type EpochScore } from "@/lib/epoch";

function formatScore(s: EpochScore): string {
  return s.kind === "index" ? s.score.toFixed(1) : `${(s.score * 100).toFixed(1)}%`;
}

function formatError(s: EpochScore): string | null {
  if (s.kind === "index") {
    return s.ciLow != null && s.ciHigh != null ? `${s.ciLow.toFixed(1)}–${s.ciHigh.toFixed(1)}` : null;
  }
  return s.stderr != null ? `±${(s.stderr * 100).toFixed(1)}` : null;
}

export function EpochBenchmarksView({ scores }: { scores: EpochScore[] }) {
  if (scores.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="epoch-heading">
      <h2 id="epoch-heading" className="text-xl font-bold">
        Independent benchmarks (Epoch AI)
      </h2>
      <div className="overflow-x-auto border border-edge bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-muted">
            <tr className="border-b border-edge">
              <th className="px-3 py-2 font-semibold">Benchmark</th>
              <th className="px-3 py-2 text-right font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => {
              const err = formatError(s);
              return (
                <tr key={s.benchmark} className="border-b border-edge last:border-0">
                  <td className="px-3 py-2">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                      {s.label}
                    </a>
                    <div className="mt-0.5 break-all text-xs text-muted">
                      {s.logUrl ? (
                        <a href={s.logUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                          {s.version}
                        </a>
                      ) : (
                        s.version
                      )}
                      {s.date && <span className="tabular-nums"> · {s.date}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">
                    {formatScore(s)}
                    {err && <div className="text-xs text-muted">{err}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Benchmarks run by{" "}
        <a href={EPOCH_HUB_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          Epoch AI
        </a>
        ,{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          CC BY
        </a>
        . Best run per benchmark when Epoch tested several settings.
      </p>
    </section>
  );
}

export default async function EpochBenchmarks({ modelId }: { modelId: string }) {
  const scores = await getEpochForModel(modelId);
  return <EpochBenchmarksView scores={scores} />;
}
