import { getCurrentUser, getModelsWithStats, getUserVotes } from "@/lib/data";
import ModelDirectory from "@/components/ModelDirectory";

export const dynamic = "force-dynamic";

export const metadata = { title: "Models" };

export default async function ModelsPage() {
  const [models, userVotes, user] = await Promise.all([
    getModelsWithStats(),
    getUserVotes(),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model directory</h1>
        <p className="mt-1 text-sm text-muted">
          Every model on the site. Vote, review, and rank them.
        </p>
      </div>
      <ModelDirectory models={models} userVotes={userVotes} signedIn={!!user} />
    </div>
  );
}
