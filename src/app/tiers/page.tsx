import { getModelsWithStats } from "@/lib/data";
import { bucketIntoTiers } from "@/lib/tiers";
import TierBoard from "@/components/TierBoard";
import FullscreenBoard from "@/components/FullscreenBoard";
import type { Model, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Community Tier List" };

export default async function CommunityTiersPage() {
  const models = await getModelsWithStats();
  const buckets = bucketIntoTiers(models);
  const placements = new Map<Tier, Model[]>(
    [...buckets.entries()].map(([tier, ms]) => [tier, ms as Model[]])
  );

  const totalVotes = models.reduce(
    (n, m) => n + m.stats.upvotes + m.stats.downvotes,
    0
  );
  const totalPlacements = models.reduce(
    (n, m) => n + (m.stats.placement_count ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community tier list</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The hive mind&apos;s verdict — computed from {totalVotes} votes and{" "}
          {totalPlacements} tier-list placements. Vote and publish your own tier
          lists to move the needle.
        </p>
      </div>
      <FullscreenBoard title="Community tier list">
        <TierBoard placements={placements} />
      </FullscreenBoard>
      <p className="text-xs text-muted">
        How it works: each model&apos;s score is its net upvotes plus a capped bonus
        from where the community places it in public tier lists. Models are then
        bucketed by percentile: top 10% are S tier, bottom 5% are F.
      </p>
    </div>
  );
}
