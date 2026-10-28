import { formatCost, type ScoredModel, type ValueModel } from "@/lib/value";

type Row = ScoredModel<ValueModel>;

export const COMPARE_COLORS = ["#3b82f6", "#f59e0b"] as const;

const PAD = { top: 14, right: 16, bottom: 36, left: 40 };

function ticks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const v = 10 ** e;
    if (v >= lo && v <= hi) out.push(v);
  }
  return out;
}

const tickLabel = (v: number) => (v >= 1 ? `$${v}` : `$${Number(v.toPrecision(1))}`);
const r1 = (v: number) => Math.round(v * 10) / 10;

interface PlotProps {
  pts: Row[];
  picked: Row[];
  a: Row | null;
  b: Row | null;
  W: number;
  H: number;
  className: string;
}

function Plot({ pts, picked, a, b, W, H, className }: PlotProps) {
  const costs = pts.map((r) => r.cost!);
  const lo = Math.min(...costs) / 1.3;
  const hi = Math.max(...costs) * 1.3;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (c: number) => r1(PAD.left + ((Math.log(c) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * innerW);
  const y = (q: number) => r1(PAD.top + (1 - q / 100) * innerH);
  const ids = new Set(picked.map((r) => r.model.id));

  return (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`w-full ${className}`}
          role="img"
          aria-label={`Quality against cost per task. ${picked
            .map((r) => `${r.model.name}: Q ${r.quality.toFixed(1)}, ${formatCost(r.cost)} per task`)
            .join(". ")}`}
        >
          {[0, 50, 100].map((q) => (
            <g key={q}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(q)} y2={y(q)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(q) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {q}
              </text>
            </g>
          ))}
          {ticks(lo, hi).map((c) => (
            <g key={c}>
              <line
                x1={x(c)}
                x2={x(c)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text x={x(c)} y={PAD.top + innerH + 15} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {tickLabel(c)}
              </text>
            </g>
          ))}
          <text x={PAD.left + innerW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
            Cost per task (log scale)
          </text>
          <text
            transform={`translate(11 ${PAD.top + innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            Quality (Q)
          </text>
          {pts
            .filter((r) => !ids.has(r.model.id))
            .map((r) => (
              <circle key={r.model.id} cx={x(r.cost!)} cy={y(r.quality)} r="3" fill="var(--muted)" fillOpacity="0.3" />
            ))}
          {[a, b].map((r, i) =>
            r && r.cost != null ? (
              <circle
                key={r.model.id}
                cx={x(r.cost)}
                cy={y(r.quality)}
                r="6"
                fill={COMPARE_COLORS[i]}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ) : null
          )}
        </svg>
  );
}

/** Quality against log cost per task: every benchmarked model faded, the two compared models highlighted. */
export default function CompareChart({ field, a, b }: { field: Row[]; a: Row | null; b: Row | null }) {
  const pts = field.filter((r) => r.cost != null);
  const picked = [a, b].filter((r): r is Row => r != null && r.cost != null);
  if (pts.length === 0 || picked.length === 0) return null;
  const props = { pts, picked, a, b };

  return (
    <figure className="space-y-2">
      <div className="border border-edge bg-surface p-2">
        <Plot {...props} W={360} H={250} className="sm:hidden" />
        <Plot {...props} W={640} H={260} className="hidden sm:block" />
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {[a, b].map((r, i) =>
          r ? (
            <span key={r.model.id} className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden>
                <circle cx="5" cy="5" r="4.5" fill={COMPARE_COLORS[i]} />
              </svg>
              {r.model.name}
            </span>
          ) : null
        )}
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="3" fill="var(--muted)" fillOpacity="0.4" />
          </svg>
          Other benchmarked models
        </span>
      </figcaption>
    </figure>
  );
}
