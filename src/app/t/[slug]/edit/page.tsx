import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getBuilderModels, getTierListBySlug } from "@/lib/data";
import TierListBuilder from "@/components/TierListBuilder";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit Tier List" };

export default async function EditTierListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [list, models, user] = await Promise.all([
    getTierListBySlug(slug),
    getBuilderModels(),
    getCurrentUser(),
  ]);
  if (!list) notFound();
  if (!user || user.id !== list.user_id) redirect(`/t/${slug}`);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit tier list</h1>
      <TierListBuilder
        models={models}
        listId={list.id}
        initialTitle={list.title}
        initialDescription={list.description}
        initialIsPublic={list.is_public}
        initialTiers={list.tiers}
        initialItems={list.items}
        initialRankModes={list.rank_modes}
        signedIn
      />
    </div>
  );
}
