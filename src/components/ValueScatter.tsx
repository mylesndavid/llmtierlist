"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatCost,
  formatUsage,
  isThin,
  sampleLabel,
  formatPct,
  formatSeconds,
  formatTokens,
  type ScoredModel,
  type ValueModel,
} from "@/lib/value";

type Row = ScoredModel<ValueModel>;

const PAD = { top: 12, right: 16, bottom: 40, left: 44 };

/** Cost-axis ticks at 1–3 steps per decade between lo and hi. */
function logTicks(lo: number, hi: number, narrow: boolean): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of narrow ? [1] : [1, 3]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

function tickLabel(v: number): string {
  if (v >= 1) return `$${v}`;
  return `$${Number(v.toPrecision(1))}`;
}

/** Quality (y) against log cost per task (x), with the Pareto frontier drawn as a line. */
export default function ValueScatter({ rows, showUsage }: { rows: Row[]; showUsage: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.min(440, Math.max(280, width * 0.6)));
  const narrow = width < 520;
  const points = useMemo(() => rows.filter((r) => r.cost != null), [rows]);

  const geo = useMemo(() => {
    const costs = points.map((r) => r.cost!);
    const lo = Math.min(...costs) / 1.3;
    const hi = Math.max(...costs) * 1.3;
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    // Rounded so server and client render identical attributes (Math.log can differ in the last bit).
    const round = (v: number) => Math.round(v * 10) / 10;
    const x = (c: number) =>
      round(PAD.left + ((Math.log(c) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * innerW);
    const y = (q: number) => round(PAD.top + (1 - q / 100) * innerH);
    return { lo, hi, x, y, innerW, innerH };
  }, [points, width, height]);

  if (points.length === 0) return null;

  const frontier = points
    .filter((r) => r.frontier)
    .sort((a, b) => a.cost! - b.cost!);
  const activeRow = points.find((r) => r.model.id === active) ?? null;
  // draw dominated first so frontier points sit on top
  const ordered = [...points].sort((a, b) => Number(a.frontier) - Number(b.frontier));

  return (
    <div ref={wrap} className="relative rounded-sm border border-edge bg-surface p-2">
      <div className="mb-1 flex gap-4 px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill="var(--foreground)" />
          </svg>
          Frontier
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill="var(--muted)" fillOpacity="0.45" />
          </svg>
          Dominated
        </span>
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Scatter plot of quality against cost per task"
        className="block max-w-full"
        onMouseLeave={() => setActive(null)}
      >
        {/* grid and axes */}
        {[0, 25, 50, 75, 100].map((q) => (
          <g key={q}>
            <line
              x1={PAD.left}
              x2={PAD.left + geo.innerW}
              y1={geo.y(q)}
              y2={geo.y(q)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={geo.y(q) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {q}
            </text>
          </g>
        ))}
        {logTicks(geo.lo, geo.hi, narrow).map((c) => (
          <g key={c}>
            <line
              x1={geo.x(c)}
              x2={geo.x(c)}
              y1={PAD.top}
              y2={PAD.top + geo.innerH}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text
              x={geo.x(c)}
              y={PAD.top + geo.innerH + 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {tickLabel(c)}
            </text>
          </g>
        ))}
        <text
          x={PAD.left + geo.innerW / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
        >
          Cost per task (log scale)
        </text>
        <text
          transform={`translate(12 ${PAD.top + geo.innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
        >
          Quality (Q)
        </text>

        <g>
          <polyline
            points={frontier.map((r) => `${geo.x(r.cost!)},${geo.y(r.quality)}`).join(" ")}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {ordered.map((r) => {
            const cx = geo.x(r.cost!);
            const cy = geo.y(r.quality);
            const isActive = r.model.id === active;
            return (
              <g
                key={r.model.id}
                tabIndex={0}
                role="button"
                aria-label={`${r.model.name}: quality ${r.quality.toFixed(1)}, ${formatCost(r.cost)} per task`}
                onMouseEnter={() => setActive(r.model.id)}
                onFocus={() => setActive(r.model.id)}
                onBlur={() => setActive((a) => (a === r.model.id ? null : a))}
                onClick={() => setActive(r.model.id)}
                className="cursor-pointer outline-none"
              >
                {/* larger invisible hit target */}
                <circle cx={cx} cy={cy} r="10" fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6 : 4}
                  fill={r.frontier ? "var(--foreground)" : "var(--muted)"}
                  fillOpacity={r.frontier || isActive ? 1 : 0.45}
                  stroke={isActive ? "var(--foreground)" : "var(--surface)"}
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {activeRow && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-sm border border-edge bg-surface-2 p-2 text-xs shadow-lg shadow-black/40"
          style={{
            left: Math.max(8, Math.min(geo.x(activeRow.cost!) + 20, width - 224)),
            top: Math.max(8, Math.min(geo.y(activeRow.quality) + 36, height - 250)),
          }}
        >
          <p className="font-semibold text-foreground">{activeRow.model.name}</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
            <dt>Quality</dt>
            <dd className="text-right font-mono text-foreground">{activeRow.quality.toFixed(1)}</dd>
            <dt>GPQA</dt>
            <dd className="text-right font-mono text-foreground">
              {formatPct(activeRow.model.metrics.gpqa_diamond!.accuracy)}
              {isThin(activeRow.model.metrics.gpqa_diamond!) && " †"}
            </dd>
            <dt>τ²-bench</dt>
            <dd className="text-right font-mono text-foreground">
              {formatPct(activeRow.model.metrics.tau_bench_verified_airline!.accuracy)}
              {isThin(activeRow.model.metrics.tau_bench_verified_airline!) && " †"}
            </dd>
            <dt>Cost/task</dt>
            <dd className="text-right font-mono text-foreground">{formatCost(activeRow.cost)}</dd>
            <dt>Time/task</dt>
            <dd className="text-right font-mono text-foreground">{formatSeconds(activeRow.timeS)}</dd>
            <dt>Tokens/task</dt>
            <dd className="text-right font-mono text-foreground">{formatTokens(activeRow.tokens)}</dd>
            {showUsage && (
              <>
                <dt>Usage (7d)</dt>
                <dd className="text-right font-mono text-foreground">
                  {activeRow.model.usage ? formatUsage(activeRow.model.usage) : "—"}
                </dd>
              </>
            )}
          </dl>
          {activeRow.thin.map((k) => (
            <p key={k} className="mt-1 text-muted">
              † Thin {k === "gpqa_diamond" ? "GPQA" : "τ²"} sample: {sampleLabel(activeRow.model.metrics[k]!)}.
              Ranked as {formatPct(activeRow.adjusted[k])}.
            </p>
          ))}
          {activeRow.thin.length > 0 && (
            <p className="mt-1 text-muted">
              Scores from few tasks are pulled toward the benchmark average before ranking, so a
              lucky small sample can&apos;t top the list.
            </p>
          )}
          <p className="mt-1 text-muted">
            {activeRow.frontier
              ? "Frontier"
              : activeRow.dominatedBy
                ? `Dominated by ${activeRow.dominatedBy.name}`
                : ""}
          </p>
        </div>
      )}
    </div>
  );
}
