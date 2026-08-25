import { getBaseModelsWithStats } from "@/lib/data";
import { communityScore } from "@/lib/tiers";
import { COMMUNITY_SEED, seededTier } from "@/lib/communitySeed";
import TierBoard from "@/components/TierBoard";
import FullscreenBoard from "@/components/FullscreenBoard";
import { TIERS, type ModelWithStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Community Tier List" };

export default async function CommunityTiersPage() {
  const models = await getBaseModelsWithStats();
  const modelById = new Map(models.map((m) => [m.id, m]));

  const placements = new Map<string, ModelWithStats[]>(TIERS.map((t) => [t, []]));
  let totalVotes = 0;
  for (const seed of COMMUNITY_SEED) {
    const model = modelById.get(seed.id);
    if (!model) continue;
    totalVotes += model.stats.upvotes + model.stats.downvotes;
    placements.get(seededTier(seed.tier, communityScore(model)))?.push(model);
  }
  // highest-scoring models lead each row
  for (const row of placements.values()) {
    row.sort((a, b) => communityScore(b) - communityScore(a));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community tier list</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The models people are actually talking about right now — and where
          the community puts them. Votes move models up and down from here.
        </p>
      </div>
      <FullscreenBoard title="Community tier list">
        <TierBoard placements={placements} />
      </FullscreenBoard>
      <p className="max-w-3xl text-xs text-muted">
        How it works: this board covers today&apos;s relevant models (not the
        full {models.length}-model catalog) and starts from editorial seeds
        based on arena rankings, benchmarks, and community discourse. From
        there it&apos;s yours: every ~10 net points from votes and tier-list
        placements shifts a model a full tier, up to two tiers either way.
        {totalVotes > 0 ? ` ${totalVotes} votes counted so far.` : ""} Vote on
        the leaderboard or any model page to move things.
      </p>
    </div>
  );
}
