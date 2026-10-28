import type { ScoredModel, ValueModel } from "./value";

type Row = ScoredModel<ValueModel>;

export interface ComparePair {
  a: Row;
  b: Row;
  kind: "frontier" | "price";
}

const linkable = (r: Row) => r.model.slug != null && r.cost != null;

function key(a: Row, b: Row) {
  return [a.model.id, b.model.id].sort().join("|");
}

/** Neighbouring models on the quality/cost frontier, most-used first. */
export function frontierPairs(rows: Row[], limit = 4): ComparePair[] {
  const frontier = rows.filter((r) => r.frontier && linkable(r)).sort((a, b) => a.cost! - b.cost!);
  const pairs: ComparePair[] = [];
  for (let i = 1; i < frontier.length; i++) {
    pairs.push({ a: frontier[i], b: frontier[i - 1], kind: "frontier" });
  }
  const usage = (p: ComparePair) =>
    Math.min(p.a.model.usage?.rank ?? Infinity, p.b.model.usage?.rank ?? Infinity);
  return pairs
    .sort((x, y) => usage(x) - usage(y) || y.a.quality - x.a.quality)
    .slice(0, limit);
}

/**
 * Pairs of widely used models within `maxRatio` of each other on cost per
 * task and `maxGap` Q points of each other, so each pair is a real choice.
 * Walks models by usage rank (then score) and pairs each with its
 * closest-priced unpaired peer.
 */
export function similarPricePairs(
  rows: Row[],
  limit = 4,
  maxRatio = 1.5,
  exclude = new Set<string>(),
  maxGap = 15
): ComparePair[] {
  const pool = rows
    .filter(linkable)
    .sort(
      (a, b) =>
        (a.model.usage?.rank ?? Infinity) - (b.model.usage?.rank ?? Infinity) || b.score - a.score
    );
  const used = new Set<string>();
  const pairs: ComparePair[] = [];
  for (const a of pool) {
    if (pairs.length >= limit) break;
    if (used.has(a.model.id)) continue;
    let best: Row | null = null;
    let bestGap = Infinity;
    for (const b of pool) {
      if (b === a || used.has(b.model.id) || exclude.has(key(a, b))) continue;
      if (Math.abs(a.quality - b.quality) > maxGap) continue;
      const gap = Math.abs(Math.log(a.cost! / b.cost!));
      if (gap <= Math.log(maxRatio) && gap < bestGap) {
        best = b;
        bestGap = gap;
      }
    }
    if (!best) continue;
    used.add(a.model.id);
    used.add(best.model.id);
    pairs.push({ a, b: best, kind: "price" });
  }
  return pairs;
}

/** Frontier pairs, then similarly priced pairs, without repeats. */
export function popularComparisons(rows: Row[], perKind = 4): ComparePair[] {
  const frontier = frontierPairs(rows, perKind);
  const seen = new Set(frontier.map((p) => key(p.a, p.b)));
  return [...frontier, ...similarPricePairs(rows, perKind, 1.5, seen)];
}
