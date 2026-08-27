import { getCurrentUser, getBuilderModels } from "@/lib/data";
import TierListBuilder from "@/components/TierListBuilder";

export const dynamic = "force-dynamic";

export const metadata = { title: "New Tier List" };

export default async function NewTierListPage() {
  const [models, user] = await Promise.all([getBuilderModels(), getCurrentUser()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Build your tier list</h1>
        <p className="mt-1 text-sm text-muted">
          Drag models from the pool into tiers. S is god tier, F is skip.
        </p>
      </div>
      <TierListBuilder models={models} signedIn={!!user} />
    </div>
  );
}
