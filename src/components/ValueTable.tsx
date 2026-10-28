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
  type BenchmarkKey,
} from "@/lib/value";
import {
  CHEAP_COST,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  PAGE_SIZE,
  filterRows,
  hasActiveFilters,
  labOptions,
  nextSort,
  pageList,
  paginate,
  sortRows,
  type SortKey,
  type SortState,
  type TableFilters,
  type ValueRow,
} from "@/lib/valueTable";

type Row = ValueRow;

const TIER_COLOR = new Map(DEFAULT_TIERS.map((t) => [t.key, t.color]));

type ColumnKey = SortKey;

const COLUMNS: Array<{ key: ColumnKey; label: string; title?: string; align?: "right" }> = [
  { key: "rank", label: "#", title: "Rank by value score", align: "right" },
  { key: "tier", label: "Tier" },
  { key: "name", label: "Model" },
  { key: "score", label: "Score", title: "Value score", align: "right" },
  { key: "quality", label: "Q", title: "Quality: benchmark percentile, 0–100", align: "right" },
  { key: "gpqa", label: "GPQA", align: "right" },
  { key: "tau", label: "τ²", align: "right" },
  { key: "cost", label: "Cost/task", align: "right" },
  { key: "time", label: "Time/task", align: "right" },
  { key: "usage", label: "Usage (7d)", align: "right" },
  { key: "sentiment", label: "Sentiment", title: "Share of positive posts on X", align: "right" },
  { key: "arena", label: "Arena", title: "LMArena text rating", align: "right" },
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

const Dash = ({ title }: { title?: string }) => (
  <span className="cursor-help text-muted" title={title}>
    —
  </span>
);

function Usage({ r }: { r: Row }) {
  const u = r.model.usage;
  if (!u) return <Dash title="Outside OpenRouter's published top list for the last 7 days" />;
  return <span title={`${formatTokenCount(u.tokens)} tokens on OpenRouter in the last 7 days`}>{formatUsage(u)}</span>;
}

function Sentiment({ r }: { r: Row }) {
  const s = r.model.sentiment;
  if (!s) return <Dash title="No sentiment data" />;
  return (
    <span title={`${s.positivePct}% positive, ${s.negativePct}% negative across ${s.n} posts`}>
      {Math.round(s.positivePct)}%
    </span>
  );
}

function Status({ r, byId }: { r: Row; byId: Map<string, Row> }) {
  if (r.frontier) return <span className="font-semibold text-foreground">Frontier</span>;
  if (!r.dominatedBy) return <span className="text-muted">No cost data</span>;
  const better = (byId.get(r.dominatedBy.id)?.quality ?? 0) > r.quality ? "higher" : "same";
  const full = `Dominated by ${r.dominatedBy.name}: ${better} quality for less`;
  return (
    <span className="block max-w-[14rem] truncate text-muted" title={full}>
      Beaten by {r.dominatedBy.name}
    </span>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        on
          ? "border-foreground bg-foreground font-semibold text-black"
          : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function ValueTable({
  rows,
  showUsage,
  medianTimeS,
  showOpenWeights = false,
}: {
  rows: Row[];
  showUsage: boolean;
  /** median time per task, for the "Fast" filter */
  medianTimeS: number | null;
  /** show the open-weights chip (only when license data was available) */
  showOpenWeights?: boolean;
}) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [filters, setFilters] = useState<TableFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // Optional columns appear once their data is wired in (field present on any row).
  const showSentiment = rows.some((r) => r.model.sentiment !== undefined);
  const showArena = rows.some((r) => r.model.arena !== undefined);
  const columns = COLUMNS.filter(
    (c) =>
      (c.key !== "usage" || showUsage) &&
      (c.key !== "sentiment" || showSentiment) &&
      (c.key !== "arena" || showArena)
  );

  const byId = useMemo(() => new Map(rows.map((r) => [r.model.id, r])), [rows]);
  const labs = useMemo(() => labOptions(rows), [rows]);
  const filtered = useMemo(() => filterRows(rows, filters, medianTimeS), [rows, filters, medianTimeS]);
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const view = paginate(sorted, page, PAGE_SIZE);

  function update(patch: Partial<TableFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function toggle(key: SortKey) {
    setSort((s) => nextSort(s, key));
    setPage(1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sm:w-64">
          <span className="sr-only">Search models</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search models or labs"
            className="w-full rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm placeholder:text-muted focus:border-foreground focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Lab</span>
          <select
            value={filters.lab}
            onChange={(e) => update({ lab: e.target.value })}
            className="min-w-0 flex-1 rounded-sm border border-edge bg-surface px-2 py-1.5 text-sm text-foreground sm:flex-none"
          >
            <option value="">All labs</option>
            {labs.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name} ({l.count})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {showOpenWeights && (
          <Chip on={filters.openWeights} onClick={() => update({ openWeights: !filters.openWeights })}>
            Open weights
          </Chip>
        )}
        <Chip on={filters.cheap} onClick={() => update({ cheap: !filters.cheap })}>
          Under ${CHEAP_COST}/task
        </Chip>
        <Chip on={filters.fast} onClick={() => update({ fast: !filters.fast })}>
          <span title={medianTimeS != null ? `Under the median ${formatSeconds(medianTimeS)} per task` : undefined}>
            Fast
          </span>
        </Chip>
        <Chip on={filters.frontierOnly} onClick={() => update({ frontierOnly: !filters.frontierOnly })}>
          Frontier only
        </Chip>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={() => update(EMPTY_FILTERS)}
            className="px-1 text-xs text-muted underline hover:text-foreground"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {view.total === 0
            ? "No models match"
            : `${view.from}–${view.to} of ${view.total} models`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm border border-edge">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">
            Models ranked by value score. Column headers sort the table.
          </caption>
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  title={c.title}
                  aria-sort={sort.key === c.key ? (sort.asc ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-2 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
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
            {view.items.map((r) => (
              <tr key={r.model.id} className="border-t border-edge hover:bg-surface">
                <td className="px-2 py-1.5 text-right font-mono text-muted">{r.rank}</td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block w-6 rounded-sm text-center text-xs font-bold text-black"
                    style={{ backgroundColor: TIER_COLOR.get(r.tier) }}
                    aria-label={`Tier ${r.tier}`}
                  >
                    {r.tier}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <VendorLogo vendorSlug={r.model.vendorSlug} className="h-4 w-4 shrink-0" />
                    {r.model.slug ? (
                      <Link href={`/models/${r.model.slug}`} className="whitespace-nowrap hover:underline">
                        {r.model.name}
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap">{r.model.name}</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{r.score.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.quality.toFixed(1)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                  <Accuracy r={r} k="gpqa_diamond" />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                  <Accuracy r={r} k="tau_bench_verified_airline" />
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{formatCost(r.cost)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatSeconds(r.timeS)}</td>
                {showUsage && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                    <Usage r={r} />
                  </td>
                )}
                {showSentiment && (
                  <td className="px-2 py-1.5 text-right font-mono">
                    <Sentiment r={r} />
                  </td>
                )}
                {showArena && (
                  <td className="px-2 py-1.5 text-right font-mono">
                    {r.model.arena != null ? Math.round(r.model.arena) : <Dash title="Not rated on Arena" />}
                  </td>
                )}
                <td className="px-2 py-1.5 text-xs">
                  <Status r={r} byId={byId} />
                </td>
              </tr>
            ))}
            {view.total === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2 py-6 text-center text-sm text-muted">
                  No models match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view.pageCount > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-1 text-sm" aria-label="Table pages">
          <button
            type="button"
            onClick={() => setPage(view.page - 1)}
            disabled={view.page === 1}
            className="rounded-sm border border-edge px-2.5 py-1 text-muted hover:text-foreground disabled:opacity-40"
          >
            Prev
          </button>
          {pageList(view.page, view.pageCount).map((p, i) =>
            p == null ? (
              <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === view.page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={`min-w-8 rounded-sm border px-2 py-1 font-mono ${
                  p === view.page
                    ? "border-foreground bg-foreground font-semibold text-black"
                    : "border-edge text-muted hover:text-foreground"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage(view.page + 1)}
            disabled={view.page === view.pageCount}
            className="rounded-sm border border-edge px-2.5 py-1 text-muted hover:text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}

      <p className="text-xs text-muted">
        * No default-routing run for that benchmark; the figure is an average over the providers
        OpenRouter pinned, weighted by questions. † Thin sample: the 95% interval is wider than ±5 points.
        Accuracy shown is the raw result; hover for runs, tasks and the adjusted value used for
        ranking. Scores from few tasks are pulled toward the benchmark average before ranking, so a lucky small sample can&apos;t top the list. (Each result is blended with the benchmark
        average as if that average had {SHRINK_TASKS} more tasks.) A dash means the dataset has no value.
      </p>
    </div>
  );
}
