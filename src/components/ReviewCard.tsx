import Link from "next/link";
import type { Review } from "@/lib/types";
import { deleteReview } from "@/lib/actions";
import StarRating from "./StarRating";
import Avatar from "./Avatar";

export default function ReviewCard({
  review,
  isOwn,
  modelSlug,
}: {
  review: Review;
  isOwn: boolean;
  modelSlug: string;
}) {
  const author = review.profiles;
  const name = author?.display_name || author?.username || "anonymous";

  return (
    <article className="rounded-sm border border-edge bg-surface p-4">
      <div className="flex items-center gap-3">
        <Link href={author ? `/u/${author.username}` : "#"}>
          <Avatar src={author?.avatar_url} name={name} size={32} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {author ? (
              <Link
                href={`/u/${author.username}`}
                className="truncate text-sm font-semibold hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold">{name}</span>
            )}
            <StarRating rating={review.rating} size="text-xs" />
          </div>
          <time className="text-xs text-muted">
            {new Date(review.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
        {isOwn && (
          <form
            action={async () => {
              "use server";
              await deleteReview(review.id, modelSlug);
            }}
          >
            <button className="text-xs text-muted hover:text-rose-400" type="submit">
              Delete
            </button>
          </form>
        )}
      </div>
      {review.title && <h3 className="mt-3 font-semibold">{review.title}</h3>}
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
        {review.body}
      </p>
    </article>
  );
}
