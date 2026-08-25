import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentUser,
  getProfileByUsername,
  getReviewsByUser,
  getTierListsByUser,
} from "@/lib/data";
import Avatar from "@/components/Avatar";
import StarRating from "@/components/StarRating";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Profile not found" };
  return {
    title: `${profile.display_name || profile.username} (@${profile.username})`,
    description: profile.bio || `${profile.username}'s LLM tier lists and reviews`,
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([
    getProfileByUsername(username),
    getCurrentUser(),
  ]);
  if (!profile) notFound();

  const isOwn = viewer?.id === profile.id;
  const [lists, reviews] = await Promise.all([
    getTierListsByUser(profile.id, isOwn),
    getReviewsByUser(profile.id),
  ]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border border-edge bg-surface p-6 sm:flex-row sm:items-center">
        <Avatar src={profile.avatar_url} name={profile.username} size={80} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {profile.display_name || profile.username}
          </h1>
          <p className="text-sm text-muted">@{profile.username}</p>
          {profile.bio && <p className="mt-2 max-w-xl text-sm">{profile.bio}</p>}
          <p className="mt-2 text-xs text-muted">
            {profile.list_count} tier {profile.list_count === 1 ? "list" : "lists"} ·{" "}
            {profile.review_count} {profile.review_count === 1 ? "review" : "reviews"} ·{" "}
            {profile.vote_count} {profile.vote_count === 1 ? "vote" : "votes"} · joined{" "}
            {new Date(profile.created_at + "Z").toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        {isOwn && (
          <Link
            href="/settings"
            className="self-start rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Edit profile
          </Link>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Tier lists</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-muted">
            No tier lists yet.
            {isOwn && (
              <>
                {" "}
                <Link href="/tierlists/new" className="underline hover:text-foreground">
                  Make your first one.
                </Link>
              </>
            )}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <Link
                key={list.id}
                href={`/t/${list.slug}`}
                className="border border-edge bg-surface p-4 transition-colors hover:border-muted"
              >
                <h3 className="truncate font-semibold">{list.title}</h3>
                {list.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{list.description}</p>
                )}
                <p className="mt-3 text-xs text-muted">
                  {!list.is_public && "Private · "}
                  updated{" "}
                  {new Date(list.updated_at + "Z").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Recent reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="border border-edge bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/models/${r.model_slug}`}
                    className="font-semibold hover:underline"
                  >
                    {r.model_name}
                  </Link>
                  <StarRating rating={r.rating} size="text-xs" />
                  <span className="text-xs text-muted">
                    {new Date(r.created_at + "Z").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {r.title && <h3 className="mt-2 text-sm font-semibold">{r.title}</h3>}
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
