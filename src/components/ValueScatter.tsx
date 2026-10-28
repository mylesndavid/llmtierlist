"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { placeLabels } from "@/lib/scatterLabels";
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

const PAD = { top: 14, right: 18, bottom: 40, left: 44 };
const TOOLTIP_W = 224;

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

/**
 * Quality (y) against log cost per task (x), with the Pareto frontier drawn
 * as a line. The box height comes from CSS (`heightClass`) so the chart
 * takes its final size before it is measured: no layout shift.
 */
export default function ValueScatter({
  rows,
  showUsage,
  labelFrontier = false,
  heightClass = "h-[300px] sm:h-[400px]",
}: {
  rows: Row[];
  showUsage: boolean;
  /** draw frontier model names next to their points */
  labelFrontier?: boolean;
  heightClass?: string;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  // Touch and pen: first tap shows details (with a link). Mouse: click opens the page.
  const [touch, setTouch] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.max(260, Math.floor(entry.contentRect.width)),
        h: Math.max(220, Math.floor(entry.contentRect.height)),
      })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Before measuring (server render), draw at a nominal size scaled into the box.
  const width = size?.w ?? 720;
  const height = size?.h ?? 400;
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

  const frontier = useMemo(
    () => points.filter((r) => r.frontier).sort((a, b) => a.cost! - b.cost!),
    [points]
  );

  const labels = useMemo(() => {
    // Labels need real measurements; skip them in the server render.
    if (!labelFrontier || !size || frontier.length === 0) return [];
    // Highest quality first: those are the names people look for.
    const order = [...frontier].sort((a, b) => b.quality - a.quality);
    return placeLabels(
      order.map((r) => ({ id: r.model.id, x: geo.x(r.cost!), y: geo.y(r.quality), text: r.model.name })),
      {
        bounds: { left: PAD.left + 2, top: 0, right: width - 2, bottom: PAD.top + geo.innerH - 2 },
        obstacles: points.map((r) => ({ x: geo.x(r.cost!), y: geo.y(r.quality) })),
        fontSize: narrow ? 10 : 11,
        maxChars: narrow ? 16 : 24,
      }
    );
  }, [labelFrontier, size, frontier, points, geo, width, narrow]);

  if (points.length === 0) return null;

  const activeRow = points.find((r) => r.model.id === active) ?? null;
  // draw dominated first so frontier points sit on top
  const ordered = [...points].sort((a, b) => Number(a.frontier) - Number(b.frontier));

  function open(r: Row) {
    if (r.model.slug) router.push(`/models/${r.model.slug}`);
  }

  const tooltipLeft = activeRow
    ? Math.max(4, Math.min(geo.x(activeRow.cost!) + 16, width - TOOLTIP_W - 4))
    : 0;
  const tooltipBelow = activeRow ? geo.y(activeRow.quality) < height / 2 : true;

  return (
    <div className="rounded-sm border border-edge bg-surface p-2">
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
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
        <span className="ml-auto hidden sm:inline">Hover for details, click to open the model</span>
      </div>
      <div
        ref={box}
        className={`relative w-full ${heightClass}`}
        onMouseLeave={() => setActive(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="100%"
          role="img"
          aria-label={`Scatter plot of quality against cost per task for ${points.length} models; ${frontier.length} are on the frontier`}
          className="absolute inset-0 block"
          onClick={(e) => {
            // tapping empty chart space closes the details
            if (!(e.target as Element).closest("[data-point]")) setActive(null);
          }}
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

          <polyline
            points={frontier.map((r) => `${geo.x(r.cost!)},${geo.y(r.quality)}`).join(" ")}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          <g aria-hidden>
            {labels.map((l) => (
              <text
                key={l.id}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                fontSize={narrow ? 10 : 11}
                fill="var(--foreground)"
                stroke="var(--surface)"
                strokeWidth="3"
                paintOrder="stroke"
                className="pointer-events-none select-none"
              >
                {l.text}
              </text>
            ))}
          </g>

          {ordered.map((r) => {
            const cx = geo.x(r.cost!);
            const cy = geo.y(r.quality);
            const isActive = r.model.id === active;
            return (
              <g
                key={r.model.id}
                data-point
                tabIndex={0}
                role={r.model.slug ? "link" : "button"}
                aria-label={`${r.model.name}: quality ${r.quality.toFixed(1)}, ${formatCost(r.cost)} per task${r.frontier ? ", frontier" : ""}`}
                onMouseEnter={() => setActive(r.model.id)}
                onFocus={() => setActive(r.model.id)}
                onBlur={() => setActive((a) => (a === r.model.id ? null : a))}
                onPointerDown={(e) => setTouch(e.pointerType !== "mouse")}
                onClick={() => {
                  if (touch && active !== r.model.id) setActive(r.model.id);
                  else open(r);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(r);
                  } else if (e.key === "Escape") setActive(null);
                }}
                className="cursor-pointer outline-none"
              >
                {/* larger invisible hit target */}
                <circle cx={cx} cy={cy} r="11" fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6 : r.frontier ? 4.5 : 3.5}
                  fill={r.frontier ? "var(--foreground)" : "var(--muted)"}
                  fillOpacity={r.frontier || isActive ? 1 : 0.4}
                  stroke={isActive ? "var(--foreground)" : "var(--surface)"}
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        {activeRow && (
          <div
            role="tooltip"
            className={`absolute z-10 rounded-sm border ${touch ? "" : "pointer-events-none"} border-edge bg-surface-2 p-2 text-xs shadow-lg shadow-black/40`}
            style={{
              width: TOOLTIP_W,
              left: tooltipLeft,
              ...(tooltipBelow
                ? { top: Math.min(geo.y(activeRow.quality) + 14, height - 40) }
                : { bottom: Math.min(height - geo.y(activeRow.quality) + 14, height - 40) }),
            }}
          >
            <p className="font-semibold text-foreground">{activeRow.model.name}</p>
            <p className="text-muted">{activeRow.model.vendor}</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
              <dt>Quality</dt>
              <dd className="text-right font-mono text-foreground">{activeRow.quality.toFixed(1)}</dd>
              <dt>Value score</dt>
              <dd className="text-right font-mono text-foreground">{activeRow.score.toFixed(1)}</dd>
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
            <p className="mt-1 text-muted">
              {activeRow.frontier
                ? "Frontier"
                : activeRow.dominatedBy
                  ? `Dominated by ${activeRow.dominatedBy.name}`
                  : ""}
            </p>
            {activeRow.model.slug && (
              <Link
                href={`/models/${activeRow.model.slug}`}
                className="mt-1 inline-block text-foreground underline"
              >
                Open model page
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
