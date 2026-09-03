import Link from "next/link";
import { searchUsers } from "@/lib/data";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export const metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const people = await searchUsers(q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone publishing tier lists and reviews.
        </p>
      </div>

      <form action="/people" method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by username or name…"
          className="w-full max-w-md rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-muted"
        />
        <button
          type="submit"
          className="rounded-sm border border-edge bg-surface px-4 py-2 text-sm hover:bg-surface-2"
        >
          Search
        </button>
        {q && (
          <Link href="/people" className="self-center text-sm text-muted underline hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      {people.length === 0 ? (
        <p className="py-16 text-center text-muted">
          {q ? <>No one matches “{q}”.</> : <>No profiles yet.</>}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <Link
              key={p.username}
              href={`/u/${p.username}`}
              className="flex items-start gap-3 border border-edge bg-surface p-4 transition-colors hover:border-muted"
            >
              <Avatar src={p.avatar_url} name={p.username} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.display_name || p.username}</div>
                <div className="truncate text-xs text-muted">@{p.username}</div>
                {p.bio && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.bio}</p>}
                <p className="mt-2 text-[11px] text-muted">
                  {p.list_count} {p.list_count === 1 ? "list" : "lists"}
                  {p.upvotes_received > 0 && (
                    <> · <span className="text-emerald-400">{p.upvotes_received}</span> upvotes</>
                  )}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
