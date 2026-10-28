import { BENCHMARKS } from "@/lib/value";
import type { BenchmarkLoad, UsageLoad } from "@/lib/valueData";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

/** CC BY attribution for the OpenRouter benchmark and rankings datasets. */
export default function ValueCredits({ bench, usage }: { bench: BenchmarkLoad; usage: UsageLoad }) {
  return (
    <p className="text-xs text-muted">
      Benchmark data:{" "}
      <a href="https://openrouter.ai" className="underline hover:text-foreground">
        OpenRouter (openrouter.ai)
      </a>
      ,{" "}
      <a href={CC_BY} className="underline hover:text-foreground">
        CC BY 4.0
      </a>
      {bench.ok && <>, snapshot {bench.snapshotDate}</>}. Benchmarks:{" "}
      {BENCHMARKS.map((b, i) => (
        <span key={b.key}>
          {i > 0 && ", "}
          <a href={b.url} className="underline hover:text-foreground">
            {b.label}
          </a>
        </span>
      ))}
      .
      {usage.ok && (
        <>
          {" "}Usage:{" "}
          <a href="https://openrouter.ai/rankings" className="underline hover:text-foreground">
            OpenRouter rankings
          </a>
          ,{" "}
          <a href={CC_BY} className="underline hover:text-foreground">
            CC BY 4.0
          </a>
          , snapshot {usage.snapshotDate}.
        </>
      )}
    </p>
  );
}
