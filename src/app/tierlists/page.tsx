import Link from "next/link";
import { getPublicTierLists } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tier Lists" };

export default async function TierListsPage() {
  const lists = await getPublicTierLists();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Community tier lists</h1>
          <p className="mt-1 text-sm text-muted">
            Recently published rankings from the community.
          </p>
        </div>
        <Link
          href="/tierlists/new"
          className="rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-black hover:bg-white"
        >
          + Make yours
        </Link>
      </div>

      {lists.length === 0 ? (
        <p className="py-16 text-center text-muted">
          No public tier lists yet.{" "}
          <Link href="/tierlists/new" className="underline hover:text-foreground">
            Be the first to publish one.
          </Link>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/t/${list.slug}`}
              className="border border-edge bg-surface p-4 transition-colors hover:border-muted"
            >
              <h2 className="truncate font-semibold">{list.title}</h2>
              {list.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{list.description}</p>
              )}
              <p className="mt-3 text-xs text-muted">
                by{" "}
                <span className="font-medium text-foreground/80">
                  {list.profiles?.display_name || list.profiles?.username || "anonymous"}
                </span>{" "}
                ·{" "}
                {new Date(list.updated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
