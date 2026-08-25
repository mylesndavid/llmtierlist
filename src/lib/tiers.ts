import type { ModelWithStats, Tier } from "./types";

// Classic TierMaker default row colors.
export const TIER_COLORS: Record<Tier, string> = {
  S: "#ff7f7e",
  A: "#ffbf7f",
  B: "#ffdf80",
  C: "#ffff7f",
  D: "#bfff7f",
  F: "#7fff7f",
};

export const TIER_LABELS: Record<Tier, string> = {
  S: "God tier",
  A: "Great",
  B: "Good",
  C: "Mid",
  D: "Meh",
  F: "Skip",
};

/**
 * Community score blends direct votes with tier-list placements.
 * Placements are worth up to half a vote each so raw votes stay dominant,
 * and the placement influence is capped so one prolific list-maker can't
 * swing a model's tier.
 */
export function communityScore(m: ModelWithStats): number {
  const { net_score, avg_tier_value, placement_count } = m.stats;
  let score = net_score;
  if (avg_tier_value != null && placement_count != null && placement_count > 0) {
    score += (avg_tier_value - 2.5) * Math.min(placement_count, 20) * 0.5;
  }
  return score;
}

const TIER_CUTOFFS: Array<[Tier, number]> = [
  ["S", 0.1],
  ["A", 0.3],
  ["B", 0.55],
  ["C", 0.8],
  ["D", 0.95],
  ["F", 1],
];

/**
 * Bucket models into community tiers by score percentile.
 * Models with equal scores always share a tier.
 */
export function bucketIntoTiers(
  models: ModelWithStats[]
): Map<Tier, ModelWithStats[]> {
  const sorted = [...models].sort(
    (a, b) => communityScore(b) - communityScore(a) || a.name.localeCompare(b.name)
  );
  const result = new Map<Tier, ModelWithStats[]>([
    ["S", []], ["A", []], ["B", []], ["C", []], ["D", []], ["F", []],
  ]);

  const scores = sorted.map(communityScore);
  const allEqual = scores.every((s) => s === scores[0]);

  const tierOf = new Map<number, Tier>(); // score -> tier, so ties share
  sorted.forEach((m, i) => {
    const score = scores[i];
    let tier: Tier;
    if (allEqual) {
      tier = "B";
    } else if (tierOf.has(score)) {
      tier = tierOf.get(score)!;
    } else {
      const pct = i / sorted.length;
      tier = TIER_CUTOFFS.find(([, cutoff]) => pct < cutoff)![0];
      tierOf.set(score, tier);
    }
    result.get(tier)!.push(m);
  });

  return result;
}

export function formatContextWindow(tokens: number | null): string {
  if (!tokens) return "—";
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M tokens`;
  return `${Math.round(tokens / 1000)}K tokens`;
}
