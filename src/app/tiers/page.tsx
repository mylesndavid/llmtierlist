import { getBaseModelsWithStats } from "@/lib/data";
import { communityScore } from "@/lib/tiers";
import { COMMUNITY_SEED, seededTier } from "@/lib/communitySeed";
import TierBoard from "@/components/TierBoard";
import FullscreenBoard from "@/components/FullscreenBoard";
import { TIERS, type ModelWithStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "The Official LLM Tier List" };

export default async function CommunityTiersPage() {
  const models = await getBaseModelsWithStats();
  const modelById = new Map(models.map((m) => [m.id, m]));

  const placements = new Map<string, ModelWithStats[]>(TIERS.map((t) => [t, []]));
  for (const seed of COMMUNITY_SEED) {
    const model = modelById.get(seed.id);
    if (!model) continue;
    placements.get(seededTier(seed.tier, communityScore(model)))?.push(model);
  }
  // highest-scoring models lead each row
  for (const row of placements.values()) {
    row.sort((a, b) => communityScore(b) - communityScore(a));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">The official LLM tier list</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One board, decided by everyone. The models people actually talk
          about, placed by community votes — cast yours to move them.
        </p>
      </div>
      <FullscreenBoard title="The official LLM tier list">
        <TierBoard placements={placements} />
      </FullscreenBoard>
    </div>
  );
}
