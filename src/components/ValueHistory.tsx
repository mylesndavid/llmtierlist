"use client";

import { useState } from "react";
import Link from "next/link";

export interface ValueHistoryPoint {
  day: string;
  value_score: number;
  tier: string | null;
}

const LINE = "#3b82f6"; // same series color as ScoreHistory
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

/** Balanced value score over time. Renders nothing until two days are stored. */
export default function ValueHistory({ points }: { points: ValueHistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const scores = points.map((d) => d.value_score);
  const lo = Math.floor(Math.min(...scores) - 2);
  const hi = Math.ceil(Math.max(...scores) + 2);
  const span = hi - lo || 1;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);
  const path = points.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value_score)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const ticks = [hi, Math.round((hi + lo) / 2), lo].filter((v, i, a) => a.indexOf(v) === i);
  const active = hover ?? points.length - 1;
  const p = points[active];

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Value score over time</h3>
        <span className="font-mono text-xs text-muted">
          {fmtDay(p.day)} · {p.value_score.toFixed(1)}
          {p.tier ? ` · ${p.tier} tier` : ""}
        </span>
      </figcaption>
      <div className="border border-edge bg-surface p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Value score history: ${points
            .map((d) => `${fmtDay(d.day)} ${d.value_score.toFixed(1)}`)
            .join(", ")}`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#2a2a2a" strokeWidth="1" />
              <text x={4} y={y(t) + 4} fill="#8b95a9" fontSize="10" fontFamily="monospace">
                {t}
              </text>
            </g>
          ))}
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity="0.28" />
              <stop offset="100%" stopColor={LINE} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#valueFill)" />
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
          <circle cx={x(active)} cy={y(p.value_score)} r="4.5" fill={LINE} stroke="#1a1a1a" strokeWidth="2" />
          {points.map((d, i) => (
            <rect
              key={d.day}
              x={x(i) - W / points.length / 2}
              y={0}
              width={W / points.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
          <text x={PAD.left} y={H - 6} fill="#8b95a9" fontSize="10">
            {fmtDay(points[0].day)}
          </text>
          <text x={W - PAD.right} y={H - 6} fill="#8b95a9" fontSize="10" textAnchor="end">
            {fmtDay(points[points.length - 1].day)}
          </text>
        </svg>
      </div>
      <p className="text-xs text-muted">
        Balanced preset, from the daily{" "}
        <Link href="/value" className="underline hover:text-foreground">
          value tier list
        </Link>{" "}
        snapshot.
      </p>
    </figure>
  );
}
