"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import VendorLogo from "./VendorLogo";
import { DEFAULT_TIERS } from "@/lib/types";
import {
  SHRINK_TASKS,
  formatCost,
  formatTokenCount,
  formatUsage,
  isThin,
  sampleLabel,
  formatPct,
  formatSeconds,
  formatTokens,
  type BenchmarkKey,
  type ScoredModel,
  type ValueModel,
} from "@/lib/value";

type Row = ScoredModel<ValueModel>;
type SortKey =
  | "rank"
  | "tier"
  | "name"
  | "score"
  | "quality"
  | "gpqa"
  | "tau"
  | "cost"
  | "time"
  | "tokens"
  | "usage"
  | "status";

const TIER_COLOR = new Map(DEFAULT_TIERS.map((t) => [t.key, t.color]));
const TIER_INDEX = new Map(DEFAULT_TIERS.map((t, i) => [t.key, i]));

const acc = (r: Row, k: BenchmarkKey) => r.model.metrics[k]!.accuracy;

const SORT_VALUE: Record<SortKey, (r: Row) => number | string | null> = {
  rank: (r) => r.rank,
  tier: (r) => TIER_INDEX.get(r.tier) ?? DEFAULT_TIERS.length,
  name: (r) => r.model.name.toLowerCase(),
  score: (r) => r.score,
  quality: (r) => r.quality,
  gpqa: (r) => acc(r, "gpqa_diamond"),
  tau: (r) => acc(r, "tau_bench_verified_airline"),
  cost: (r) => r.cost,
  time: (r) => r.timeS,
  tokens: (r) => r.tokens,
  usage: (r) => r.model.usage?.rank ?? null,
  status: (r) => (r.frontier ? 0 : r.dominatedBy ? 1 : 2),
};

// Lower-is-better columns sort ascending first; everything else descending.
const ASC_FIRST = new Set<SortKey>(["rank", "tier", "name", "cost", "time", "tokens", "usage", "status"]);

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "rank", label: "#", align: "right" },
  { key: "name", label: "Model" },
  { key: "tier", label: "Tier" },
  { key: "score", label: "Score", align: "right" },
  { key: "quality", label: "Q", align: "right" },
  { key: "gpqa", label: "GPQA", align: "right" },
  { key: "tau", label: "τ²", align: "right" },
  { key: "cost", label: "Cost/task", align: "right" },
  { key: "time", label: "Time/task", align: "right" },
  { key: "tokens", label: "Tokens/task", align: "right" },
  { key: "usage", label: "Usage (7d)", align: "right" },
  { key: "status", label: "Status" },
];

function Pinned({ show }: { show: boolean }) {
  return show ? (
    <sup className="text-muted" title="Average of pinned providers (no default-routing run)">
      *
    </sup>
  ) : null;
}

/** Raw accuracy, with the sample and the adjusted value used for ranking in the tooltip. */
function Accuracy({ r, k }: { r: Row; k: BenchmarkKey }) {
  const m = r.model.metrics[k]!;
  const thin = isThin(m);
  const title = `${sampleLabel(m)}. Adjusted for ranking: ${formatPct(r.adjusted[k])}`;
  return (
    <span className="cursor-help" title={title}>
      {formatPct(m.accuracy)}
      <Pinned show={m.pinned} />
      {thin && (
        <sup className="text-muted" aria-label={`Thin sample: ${sampleLabel(m)}`}>
          †
        </sup>
      )}
    </span>
  );
}

function Usage({ r }: { r: Row }) {
  const u = r.model.usage;
  if (!u) {
    return (
      <span className="cursor-help text-muted" title="Outside OpenRouter's published top list for the last 7 days">
        —
      </span>
    );
  }
  return <span title={`${formatTokenCount(u.tokens)} tokens on OpenRouter in the last 7 days`}>{formatUsage(u)}</span>;
}

export default function ValueTable({ rows, showUsage }: { rows: Row[]; showUsage: boolean }) {
  const columns = showUsage ? COLUMNS : COLUMNS.filter((c) => c.key !== "usage");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "rank", asc: true });
  const byId = useMemo(() => new Map(rows.map((r) => [r.model.id, r])), [rows]);

  const sorted = useMemo(() => {
    const get = SORT_VALUE[sort.key];
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      // missing values always sink to the bottom
      if (va == null && vb == null) return a.rank - b.rank;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return (sort.asc ? cmp : -cmp) || a.rank - b.rank;
    });
  }, [rows, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: ASC_FIRST.has(key) }));
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-sm border border-edge">
        <table className="w-full min-w-[62rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.asc ? "ascending" : "descending") : undefined}
                  className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {c.label}
                    {sort.key === c.key && <span aria-hidden>{sort.asc ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.model.id} className="border-t border-edge">
                <td className="px-2 py-1.5 text-right font-mono text-muted">{r.rank}</td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <VendorLogo vendorSlug={r.model.vendorSlug} className="h-4 w-4 shrink-0" />
                    {r.model.slug ? (
                      <Link href={`/models/${r.model.slug}`} className="hover:underline">
                        {r.model.name}
                      </Link>
                    ) : (
                      <span>{r.model.name}</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block w-6 rounded-sm text-center text-xs font-bold text-black"
                    style={{ backgroundColor: TIER_COLOR.get(r.tier) }}
                  >
                    {r.tier}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{r.score.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.quality.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  <Accuracy r={r} k="gpqa_diamond" />
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  <Accuracy r={r} k="tau_bench_verified_airline" />
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{formatCost(r.cost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatSeconds(r.timeS)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatTokens(r.tokens)}</td>
                {showUsage && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                    <Usage r={r} />
                  </td>
                )}
                <td className="px-2 py-1.5 text-xs">
                  {r.frontier ? (
                    <span className="font-semibold text-foreground">Frontier</span>
                  ) : r.dominatedBy ? (
                    <span className="text-muted">
                      Dominated by {r.dominatedBy.name}:{" "}
                      {(byId.get(r.dominatedBy.id)?.quality ?? 0) > r.quality ? "higher" : "same"}{" "}
                      quality for less
                    </span>
                  ) : (
                    <span className="text-muted">No cost data</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        * No default-routing run for that benchmark; the figure is an average over the providers
        OpenRouter pinned, weighted by questions. † Thin sample: the 95% interval is wider than ±5 points.
        Accuracy shown is the raw result; hover for runs, tasks and the adjusted value used for
        ranking. Scores from few tasks are pulled toward the benchmark average before ranking, so a lucky small sample can&apos;t top the list. (Each result is blended with the benchmark
        average as if that average had {SHRINK_TASKS} more tasks.) A dash means the dataset has no value.
      </p>
    </div>
  );
}
