import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentUser,
  getModelsWithStats,
  getTierListBySlug,
  getTierListVersions,
} from "@/lib/data";
import TierBoard from "@/components/TierBoard";
import ShareButton from "@/components/ShareButton";
import FullscreenBoard from "@/components/FullscreenBoard";
import { deleteTierList } from "@/lib/actions";
import { redirect } from "next/navigation";
import VoteButtons from "@/components/VoteButtons";
import TimeAgo from "@/components/TimeAgo";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const [{ slug }, { v }, models, user] = await Promise.all([
    params,
    searchParams,
    getModelsWithStats(),
    getCurrentUser(),
  ]);
  const list = await getTierListBySlug(slug);
  if (!list) notFound();

  const versions = await getTierListVersions(list.id);
  const viewing = v ? versions.find((ver) => String(ver.version) === v) : undefined;

  // a past revision renders its own tiers and placements
  const shownTiers = viewing?.tiers ?? list.tiers;
  const shownItems = viewing?.items ?? list.items;

  const modelById = new Map(models.map((m) => [m.id, m]));
  const placements = new Map<string, Model[]>(shownTiers.map((t) => [t.key, []]));
  for (const item of shownItems) {
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
            · <TimeAgo iso={list.created_at} /> ·{" "}
            <span className="text-muted">
              {new Date(list.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
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
      {viewing && (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Viewing an earlier version of this list, saved{" "}
          <TimeAgo iso={viewing.created_at} />.{" "}
          <Link href={`/t/${list.slug}`} className="underline">
            Back to current
          </Link>
        </p>
      )}

      <FullscreenBoard title={viewing ? `${list.title} (v${viewing.version})` : list.title}>
        <TierBoard placements={placements} tiers={shownTiers} />
      </FullscreenBoard>

      <section className="pt-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">History</h2>
        <ol className="overflow-hidden rounded-sm border border-edge bg-surface">
          <li>
            <Link
              href={`/t/${list.slug}`}
              className={`flex items-baseline gap-3 border-b border-edge px-3 py-2.5 text-sm transition-colors hover:bg-surface-2 ${
                viewing ? "" : "bg-surface-2/60"
              }`}
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {versions.length > 0 ? "Updated" : "Published"}
                </span>
                {!viewing && (
                  <span className="ml-2 rounded-sm border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    viewing
                  </span>
                )}
                <span className="ml-2 text-muted">
                  <TimeAgo iso={list.updated_at} />
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">
                v{versions.length + 1}
              </span>
            </Link>
          </li>

          {versions.map((ver) => (
            <li key={ver.version}>
              <Link
                href={`/t/${list.slug}?v=${ver.version}`}
                className={`flex items-baseline gap-3 border-b border-edge px-3 py-2.5 text-sm transition-colors hover:bg-surface-2 ${
                  viewing?.version === ver.version ? "bg-surface-2/60" : ""
                }`}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted/60" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">Revision</span>
                  {viewing?.version === ver.version && (
                    <span className="ml-2 rounded-sm border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      viewing
                    </span>
                  )}
                  <span className="ml-2 text-muted">
                    <TimeAgo iso={ver.created_at} />
                  </span>
                  <span className="ml-2 hidden text-xs text-muted sm:inline">
                    {new Date(ver.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">v{ver.version}</span>
              </Link>
            </li>
          ))}

          <li className="flex items-baseline gap-3 px-3 py-2.5 text-sm text-muted">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-edge" />
            <span className="min-w-0 flex-1">
              Created <TimeAgo iso={list.created_at} />
              <span className="ml-2 hidden text-xs sm:inline">
                {new Date(list.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}
