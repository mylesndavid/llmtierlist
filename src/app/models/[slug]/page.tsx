import { notFound, redirect } from "next/navigation";
import {
  getCurrentUser,
  getModelById,
  getModelBySlug,
  getReviewsForModel,
  getUserVotes,
} from "@/lib/data";
import { formatContextWindow } from "@/lib/tiers";
import VoteButtons from "@/components/VoteButtons";
import StarRating from "@/components/StarRating";
import ReviewForm from "@/components/ReviewForm";
import ReviewCard from "@/components/ReviewCard";
import VendorLogo from "@/components/VendorLogo";

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

  const [reviews, userVotes, user] = await Promise.all([
    getReviewsForModel(model.id),
    getUserVotes(),
    getCurrentUser(),
  ]);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;
  const stats = model.stats;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border border-edge bg-surface p-6 sm:flex-row sm:items-start">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-sm bg-surface-2 p-3">
          <VendorLogo vendorSlug={model.vendor_slug} className="h-full w-full" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{model.name}</h1>
            <span className="border border-edge px-2 py-0.5 text-xs text-muted">
              {model.license === "open-weights" ? "Open weights" : "Proprietary"}
            </span>
          </div>
          <p className="text-sm text-muted">{model.vendor}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed">{model.description}</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
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
        </div>
        <VoteButtons
          modelId={model.id}
          netScore={stats.net_score}
          userVote={userVotes[model.id] ?? 0}
          signedIn={!!user}
          size="lg"
        />
      </section>

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
