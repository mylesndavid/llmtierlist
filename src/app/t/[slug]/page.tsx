import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, getModelsWithStats, getTierListBySlug } from "@/lib/data";
import TierBoard from "@/components/TierBoard";
import ShareButton from "@/components/ShareButton";
import FullscreenBoard from "@/components/FullscreenBoard";
import { deleteTierList } from "@/lib/actions";
import { redirect } from "next/navigation";
import VoteButtons from "@/components/VoteButtons";
import type { Model } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = await getTierListBySlug(slug);
  if (!list) return { title: "Tier list not found" };
  const author = list.profiles?.display_name || list.profiles?.username;
  const description =
    list.description || `An LLM tier list${author ? ` by ${author}` : ""} on llmtierlist.com`;
  const image = {
    url: `/t/${slug}/og.png`,
    width: 1200,
    height: 630,
    alt: "Tier list",
  };
  return {
    title: list.title,
    description,
    openGraph: { title: list.title, description, images: [image] },
    twitter: {
      card: "summary_large_image",
      title: list.title,
      description,
      images: [image],
    },
  };
}

export default async function TierListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [list, models, user] = await Promise.all([
    getTierListBySlug(slug),
    getModelsWithStats(),
    getCurrentUser(),
  ]);
  if (!list) notFound();

  const modelById = new Map(models.map((m) => [m.id, m]));
  const placements = new Map<string, Model[]>(list.tiers.map((t) => [t.key, []]));
  for (const item of list.items) {
    const model = modelById.get(item.model_id);
    if (model) placements.get(item.tier)?.push(model);
  }

  const isOwner = user?.id === list.user_id;
  const author = list.profiles?.display_name || list.profiles?.username || "anonymous";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{list.title}</h1>
            {!list.is_public && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                Private
              </span>
            )}
            {list.rank_modes && (
              <span className="border border-edge px-2 py-0.5 text-xs text-muted">
                ranked by thinking mode
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            by{" "}
            {list.profiles?.username ? (
              <Link href={`/u/${list.profiles.username}`} className="hover:text-foreground hover:underline">
                {author}
              </Link>
            ) : (
              author
            )}{" "}
            · updated{" "}
            {new Date(list.updated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {list.description && (
            <p className="mt-2 max-w-2xl text-sm text-foreground/90">{list.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <VoteButtons
            modelId={list.id}
            netScore={list.score}
            userVote={list.myVote}
            signedIn={!!user}
            kind="list"
          />
          <ShareButton />
          {isOwner && (
            <>
              <Link
                href={`/t/${list.slug}/edit`}
                className="rounded-md border border-edge bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Edit
              </Link>
              <form
                action={async () => {
                  "use server";
                  await deleteTierList(list.id);
                  redirect("/me/tierlists");
                }}
              >
                <button className="rounded-md border border-edge bg-surface px-3 py-1.5 text-sm text-rose-400 hover:bg-surface-2" type="submit">
                  Delete
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <FullscreenBoard title={list.title}>
        <TierBoard placements={placements} tiers={list.tiers} />
      </FullscreenBoard>
    </div>
  );
}
