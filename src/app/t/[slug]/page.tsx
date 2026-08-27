import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentUser,
  getModelsWithStats,
  getModelsByIds,
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

  const modelById = new Map<string, Model>(models.map((m) => [m.id, m]));
  // custom entries live outside the public catalog — pull them in by id
  const missing = shownItems.map((i) => i.model_id).filter((id) => !modelById.has(id));
  for (const m of await getModelsByIds(missing)) modelById.set(m.id, m);

  const placements = new Map<string, Model[]>(shownTiers.map((t) => [t.key, []]));
  for (const item of shownItems) {
    const model = modelById.get(item.model_id);
    if (model) placements.get(item.tier)?.push(model);
  }

  // Each saved version is a full board, so what changed is the difference
  // between it and the state that replaced it.
  type Placement = { model_id: string; tier: string };
  function summarise(before: Placement[], after: Placement[]): string | null {
    const prev = new Map(before.map((i) => [i.model_id, i.tier]));
    const next = new Map(after.map((i) => [i.model_id, i.tier]));
    let added = 0;
    let removed = 0;
    let moved = 0;
    for (const [id, tier] of next) {
      if (!prev.has(id)) added++;
      else if (prev.get(id) !== tier) moved++;
    }
    for (const id of prev.keys()) if (!next.has(id)) removed++;
    const parts: string[] = [];
    if (added) parts.push(`${added} added`);
    if (moved) parts.push(`${moved} moved`);
    if (removed) parts.push(`${removed} removed`);
    return parts.length ? parts.join(", ") : null;
  }

  // newest first: versions[0] was replaced by the current board
  const changeFor = (index: number) => {
    const before = versions[index].items;
    const after = index === 0 ? list.items : versions[index - 1].items;
    return summarise(before, after);
  };

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
        <p className="text-xs text-muted">
          Viewing an earlier version saved <TimeAgo iso={viewing.created_at} />.{" "}
          <Link href={`/t/${list.slug}`} className="underline hover:text-foreground">
            Back to current
          </Link>
        </p>
      )}

      <FullscreenBoard title={viewing ? `${list.title} (v${viewing.version})` : list.title}>
        <TierBoard placements={placements} tiers={shownTiers} />
      </FullscreenBoard>

      <section className="pt-6">
        <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted/70">
          History
        </h2>
        <ol className="space-y-1 text-xs text-muted">
          <li>
            <Link
              href={`/t/${list.slug}`}
              className={`inline-flex items-baseline gap-2 hover:text-foreground ${
                viewing ? "" : "text-foreground/80"
              }`}
            >
              <span className="font-mono text-muted/60">v{versions.length + 1}</span>
              <span>
                {versions.length > 0 ? "updated" : "published"}{" "}
                <TimeAgo iso={list.updated_at} />
              </span>
              {!viewing && <span className="text-muted/60">· viewing</span>}
            </Link>
          </li>
          {versions.map((ver, i) => (
            <li key={ver.version}>
              <Link
                href={`/t/${list.slug}?v=${ver.version}`}
                title={[
                  new Date(ver.created_at.replace(" ", "T") + "Z").toLocaleString(),
                  changeFor(i),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                className={`inline-flex items-baseline gap-2 hover:text-foreground ${
                  viewing?.version === ver.version ? "text-foreground/80" : ""
                }`}
              >
                <span className="font-mono text-muted/60">v{ver.version}</span>
                <span>
                  <TimeAgo iso={ver.created_at} />
                </span>
                {viewing?.version === ver.version && (
                  <span className="text-muted/60">· viewing</span>
                )}
              </Link>
            </li>
          ))}
          <li className="inline-flex items-baseline gap-2 text-muted/70">
            <span>
              created <TimeAgo iso={list.created_at} />
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}
