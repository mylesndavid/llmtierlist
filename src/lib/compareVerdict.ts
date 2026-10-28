import type { ScoredModel, ValueModel } from "./value";

/** The fields a verdict is built from. Taken straight from a scored row. */
export interface VerdictSide {
  name: string;
  quality: number; // Q, 0–100
  cost: number | null; // USD per task
}

export function verdictSide(r: ScoredModel<ValueModel>, name = r.model.name): VerdictSide {
  return { name, quality: r.quality, cost: r.cost };
}

const FRACTIONS: Array<[number, string]> = [
  [1 / 2, "half"],
  [1 / 3, "a third of"],
  [1 / 4, "a quarter of"],
  [1 / 5, "a fifth of"],
  [1 / 10, "a tenth of"],
];

/** How `ratio` (subject cost ÷ other cost, at most ~1) reads in words. */
export function costRatioPhrase(ratio: number): string {
  if (ratio >= 0.9) return "at about the same cost per task";
  for (const [f, words] of FRACTIONS) {
    if (Math.abs(ratio - f) / f <= 0.08) return `at ${words} the cost per task`;
  }
  if (ratio >= 0.1) return `at ${Math.round(ratio * 100)}% of the cost per task`;
  return `at 1/${Math.round(1 / ratio)} of the cost per task`;
}

function points(n: number): string {
  return `${n} point${n === 1 ? "" : "s"}`;
}

/**
 * One plain sentence comparing two models on quality and cost per task.
 * The cheaper model is the subject; with no usable cost, the higher-quality
 * one is. Quality gaps are whole Q points.
 */
export function buildVerdict(a: VerdictSide, b: VerdictSide): string {
  const haveCost = a.cost != null && b.cost != null && a.cost > 0 && b.cost > 0;
  let s = a;
  let o = b;
  if (haveCost) {
    if (b.cost! < a.cost! || (b.cost === a.cost && b.quality > a.quality)) [s, o] = [b, a];
  } else if (b.quality > a.quality) {
    [s, o] = [b, a];
  }

  const gap = Math.round(s.quality - o.quality);
  const quality =
    gap === 0
      ? `matches ${o.name} on quality`
      : `scores ${points(Math.abs(gap))} ${gap > 0 ? "higher" : "lower"} on quality than ${o.name}`;

  if (!haveCost) {
    const missing = [a, b].filter((m) => m.cost == null || !(m.cost > 0)).map((m) => m.name);
    return `${s.name} ${quality}. Cost per task is not published for ${missing.join(" or ")}.`;
  }
  return `${s.name} ${quality}, ${costRatioPhrase(s.cost! / o.cost!)}.`;
}
