import { TIERS, type Tier } from "./types";

/**
 * Editorial seed for the community tier list — a curated set of models people
 * are actually talking about, placed from August 2026 discourse: LMArena elo,
 * Artificial Analysis, SWE-bench/Terminal-Bench results, and community
 * sentiment (r/LocalLLaMA, HN, X). Votes shift models from these seeds.
 *
 * Rationale snapshot (Aug 2026):
 * - Fable 5 tops LMArena (~1525) and AA Intelligence; Opus 5 leads agentic
 *   coding; GPT-5.6 Sol is the strongest generalist and finishes work cheap.
 * - Kimi K3 is the consensus open-weights king; DeepSeek V4 Pro hits 80.6%
 *   SWE-bench under MIT; Grok 4.6 is 4th on AA with best frontier price/perf.
 * - Muse Spark 1.2 ties Grok on Vals at half the cost; GLM-5.3 and V4 Flash
 *   anchor the open value tier; Luna/3.7-Flash are the budget workhorses.
 */
export const COMMUNITY_SEED: ReadonlyArray<{ id: string; tier: Tier }> = [
  // S — the frontier
  { id: "anthropic/claude-fable-5", tier: "S" },
  { id: "anthropic/claude-opus-5", tier: "S" },
  { id: "openai/gpt-5.6-sol", tier: "S" },
  // A — excellent, a notch behind
  { id: "moonshotai/kimi-k3", tier: "A" },
  { id: "deepseek/deepseek-v4-pro", tier: "A" },
  { id: "deepseek/deepseek-v4-flash", tier: "A" },
  { id: "google/gemini-3.1-pro-preview", tier: "A" },
  { id: "openai/gpt-5.6-terra", tier: "A" },
  { id: "x-ai/grok-4.6", tier: "A" },
  // B — strong, specific reasons to pick
  { id: "z-ai/glm-5.3", tier: "B" },
  { id: "openai/gpt-5.6-luna", tier: "B" },
  { id: "anthropic/claude-opus-4.8", tier: "B" },
  { id: "openai/gpt-5.5", tier: "B" },
  { id: "minimax/minimax-m3", tier: "B" },
  // C — has fans, but the takes are mixed
  { id: "meta/muse-spark-1.2", tier: "C" },
  { id: "qwen/qwen3.8-max", tier: "C" },
  { id: "moonshotai/kimi-k2.6", tier: "C" },
  // D — superseded or the community's punching bag
  { id: "x-ai/grok-4.5", tier: "D" },
  { id: "anthropic/claude-sonnet-5", tier: "D" },
  // F — the community's verdict on budget Gemini
  { id: "google/gemini-3.7-flash", tier: "F" },
];

/**
 * A model's effective community tier: its editorial seed shifted by votes.
 * Every 10 net points (upvotes − downvotes, plus tier-list placement bonus)
 * moves it one tier, capped at two tiers in either direction.
 */
export function seededTier(seed: Tier, score: number): Tier {
  const shift = Math.max(-2, Math.min(2, Math.trunc(score / 10)));
  const idx = Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(seed as (typeof TIERS)[number]) - shift));
  return TIERS[idx];
}
