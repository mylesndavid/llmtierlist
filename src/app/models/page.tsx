import { getCurrentUser, getBaseModelsWithStats, getUserVotes } from "@/lib/data";
import { Suspense } from "react";
import ModelDirectory from "@/components/ModelDirectory";
import { plainDescription } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export const metadata = { title: "Models" };

export default async function ModelsPage() {
  const [allModels, userVotes, user] = await Promise.all([
    getBaseModelsWithStats(),
    getUserVotes(),
    getCurrentUser(),
  ]);

  // The directory filters client-side, so every model crosses the wire —
  // ship only what a card renders (full blurbs live on the model page).
  const models = allModels.map((m) => ({
    ...m,
    description: plainDescription(m.description).slice(0, 150),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model directory</h1>
        <p className="mt-1 text-sm text-muted">
          Every model on the site. Vote, review, and rank them.
        </p>
      </div>
      <Suspense fallback={null}>
        <ModelDirectory models={models} userVotes={userVotes} signedIn={!!user} />
      </Suspense>
    </div>
  );
}
