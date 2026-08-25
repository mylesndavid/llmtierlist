import Link from "next/link";
import { getCurrentUser, getBaseModelsWithStats, getSiteStats, getUserVotes } from "@/lib/data";
import { communityScore } from "@/lib/tiers";
import VoteButtons from "@/components/VoteButtons";
import StarRating from "@/components/StarRating";
import VendorLogo from "@/components/VendorLogo";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, models, userVotes, user, stats] = await Promise.all([
    searchParams,
    getBaseModelsWithStats(),
    getUserVotes(),
    getCurrentUser(),
    getSiteStats(),
  ]);

  const ranked = [...models].sort(
    (a, b) =>
      b.stats.net_score - a.stats.net_score ||
      communityScore(b) - communityScore(a) ||
      (b.release_date ?? "").localeCompare(a.release_date ?? "") ||
      a.name.localeCompare(b.name)
  );

  return (
    <div className="space-y-10">
      {error === "signin" && (
        <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Sign-in didn&apos;t complete — please{" "}
          <Link href="/login" className="underline">try again</Link>. If it keeps
          failing, the sign-in codes expire quickly, so go through in one sitting.
        </div>
      )}
      {user && !user.onboarded && (
        <div className="flex items-center justify-between gap-3 border border-edge bg-surface px-4 py-3 text-sm">
          <span>You&apos;re signed in — finish setting up your profile to vote and publish tier lists.</span>
          <Link
            href="/welcome"
            className="shrink-0 rounded-sm bg-foreground px-3 py-1.5 font-semibold text-black hover:bg-white"
          >
            Create profile
          </Link>
        </div>
      )}
      <section className="pt-6 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          The internet&apos;s LLM tier list
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Vote on your favorite (and least favorite) AI models, write reviews,
          and build your own tier lists to share with the world.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/tierlists/new"
            className="rounded-sm bg-foreground px-5 py-2.5 font-semibold text-black hover:bg-white"
          >
            Create a tier list
          </Link>
          <Link
            href="/tiers"
            className="rounded-sm border border-edge bg-surface px-5 py-2.5 font-semibold hover:bg-surface-2"
          >
            Community tiers
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted">
          <span className="font-semibold text-foreground">{stats.list_count}</span>{" "}
          tier {stats.list_count === 1 ? "list" : "lists"} ·{" "}
          <span className="font-semibold text-foreground">{stats.vote_count}</span>{" "}
          {stats.vote_count === 1 ? "vote" : "votes"} cast ·{" "}
          <span className="font-semibold text-foreground">{stats.visitor_count}</span>{" "}
          {stats.visitor_count === 1 ? "visitor" : "visitors"}
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">Leaderboard <span className="text-sm font-normal text-muted">top 30</span></h2>
          <Link href="/models" className="text-sm text-muted hover:text-foreground">
            Browse all models →
          </Link>
        </div>
        <div className="border border-edge">
          {ranked.slice(0, 30).map((m, i) => (
            <div
              key={m.id}
              className="flex items-center gap-3 border-b border-edge bg-surface px-3 py-2.5 last:border-b-0 hover:bg-surface-2 sm:gap-4 sm:px-4"
            >
              <span className="w-8 shrink-0 text-center font-mono text-sm font-bold text-muted">
                {i + 1}
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface-2 p-1.5">
                <VendorLogo vendorSlug={m.vendor_slug} className="h-full w-full" />
              </span>
              <Link href={`/models/${m.slug}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold hover:underline">{m.name}</div>
                <div className="truncate text-xs text-muted">{m.vendor}</div>
              </Link>
              <div className="hidden items-center gap-2 text-xs text-muted md:flex">
                {m.stats.avg_rating != null && (
                  <>
                    <StarRating rating={Number(m.stats.avg_rating)} />
                    <span>({m.stats.review_count})</span>
                  </>
                )}
              </div>
              <VoteButtons
                modelId={m.id}
                netScore={m.stats.net_score}
                userVote={userVotes[m.id] ?? 0}
                signedIn={!!user}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
