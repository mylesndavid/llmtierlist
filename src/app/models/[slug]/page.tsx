import { notFound, redirect } from "next/navigation";
import {
  getCurrentUser,
  getModelById,
  getModelBySlug,
  getModelScoreHistory,
  getReviewsForModel,
  getUserVotes,
} from "@/lib/data";
import { formatContextWindow, plainDescription } from "@/lib/tiers";
import VoteButtons from "@/components/VoteButtons";
import StarRating from "@/components/StarRating";
import ReviewForm from "@/components/ReviewForm";
import ReviewCard from "@/components/ReviewCard";
import VendorLogo from "@/components/VendorLogo";
import ScoreHistory from "@/components/ScoreHistory";

export const dynamic = "force-dynamic";

export default async function ModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = await getModelBySlug(slug);
  if (!model) notFound();

  // Variants (thinking modes, service tiers) share the base model's page so
  // votes and reviews don't fragment.
  if (model.variant && model.base_model_id) {
    const base = await getModelById(model.base_model_id);
    if (base) redirect(`/models/${base.slug}`);
  }

  const [reviews, userVotes, user, history] = await Promise.all([
    getReviewsForModel(model.id),
    getUserVotes(),
    getCurrentUser(),
    getModelScoreHistory(model.id),
  ]);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;
  const stats = model.stats;

  return (
    <div className="space-y-8">
      <section className="border border-edge bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-surface-2 p-2 sm:h-16 sm:w-16 sm:p-3">
            <VendorLogo vendorSlug={model.vendor_slug} className="h-full w-full" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-lg font-bold leading-tight sm:text-2xl">
              {model.name}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              {model.vendor}
              <span className="border border-edge px-1.5 py-0.5 text-[10px] sm:text-xs">
                {model.license === "open-weights" ? "Open weights" : "Proprietary"}
              </span>
            </p>
          </div>
          <VoteButtons
            modelId={model.id}
            netScore={stats.net_score}
            userVote={userVotes[model.id] ?? 0}
            signedIn={!!user}
            size="lg"
          />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere] line-clamp-4 sm:line-clamp-none">
          {plainDescription(model.description)}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span>Context: <span className="text-foreground">{formatContextWindow(model.context_window)}</span></span>
          {model.release_date && (
            <span>Released: <span className="text-foreground">{new Date(model.release_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span></span>
          )}
          <span>
            {stats.upvotes} up · {stats.downvotes} down
          </span>
          {stats.avg_rating != null && (
            <span className="flex items-center gap-1">
              <StarRating rating={Number(stats.avg_rating)} size="text-xs" />
              <span>{Number(stats.avg_rating).toFixed(1)} ({stats.review_count} reviews)</span>
            </span>
          )}
        </div>
      </section>

      <ScoreHistory points={history} live={stats.net_score} />

      <section className="space-y-4">
        <h2 className="text-xl font-bold">
          Reviews <span className="text-sm font-normal text-muted">({reviews.length})</span>
        </h2>
        <ReviewForm
          modelId={model.id}
          modelSlug={model.slug}
          signedIn={!!user}
          existing={myReview ? { rating: myReview.rating, title: myReview.title, body: myReview.body } : undefined}
        />
        <div className="space-y-3">
          {reviews.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No reviews yet — be the first to review {model.name}.
            </p>
          ) : (
            reviews.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                isOwn={user?.id === r.user_id}
                modelSlug={model.slug}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
