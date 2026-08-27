"use client";

import { useMemo, useState } from "react";
import type { ScorePoint } from "@/lib/data";

const LINE = "#3b82f6"; // validated against the dark chart surface
const W = 640;
const H = 160;
const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

function fmtDay(day: string) {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Net score over time — how the community's view of a model has moved. */
export default function ScoreHistory({
  points,
  live,
}: {
  points: ScorePoint[];
  live: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // today's live value continues the line past the last snapshot
  const data = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [...points];
    if (rows.length === 0 || rows[rows.length - 1].day !== today) {
      rows.push({ day: today, net_score: live, upvotes: 0, downvotes: 0 });
    } else {
      rows[rows.length - 1] = { ...rows[rows.length - 1], net_score: live };
    }
    return rows;
  }, [points, live]);

  if (data.length < 2) {
    return (
      <p className="border border-edge bg-surface p-4 text-sm text-muted">
        Score history starts tracking today — check back tomorrow to see how this
        model moves.
      </p>
    );
  }

  const scores = data.map((d) => d.net_score);
  const min = Math.min(0, ...scores);
  const max = Math.max(1, ...scores);
  const span = max - min || 1;

  const x = (i: number) =>
    PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.net_score)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const ticks = [max, Math.round((max + min) / 2), min].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const active = hover ?? data.length - 1;

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Net score over time</h3>
        <span className="font-mono text-xs text-muted">
          {fmtDay(data[active].day)} · {data[active].net_score > 0 ? "+" : ""}
          {data[active].net_score}
        </span>
      </figcaption>
      <div className="border border-edge bg-surface p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Net score history: ${data
            .map((d) => `${fmtDay(d.day)} ${d.net_score}`)
            .join(", ")}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="#2a2a2a"
                strokeWidth="1"
              />
              <text x={4} y={y(t) + 4} fill="#8b95a9" fontSize="10" fontFamily="monospace">
                {t}
              </text>
            </g>
          ))}
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity="0.28" />
              <stop offset="100%" stopColor={LINE} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#scoreFill)" />
          <path d={path} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#8b95a9"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
          <circle
            cx={x(active)}
            cy={y(data[active].net_score)}
            r="4.5"
            fill={LINE}
            stroke="#1a1a1a"
            strokeWidth="2"
          />

          {/* generous invisible hit targets */}
          {data.map((d, i) => (
            <rect
              key={d.day}
              x={x(i) - (W / data.length) / 2}
              y={0}
              width={W / data.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          <text x={PAD.left} y={H - 6} fill="#8b95a9" fontSize="10">
            {fmtDay(data[0].day)}
          </text>
          <text x={W - PAD.right} y={H - 6} fill="#8b95a9" fontSize="10" textAnchor="end">
            {fmtDay(data[data.length - 1].day)}
          </text>
        </svg>
      </div>
    </figure>
  );
}
