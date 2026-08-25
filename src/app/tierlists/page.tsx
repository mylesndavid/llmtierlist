import Link from "next/link";
import { getPublicTierLists } from "@/lib/data";
import VendorLogo from "@/components/VendorLogo";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tier Lists" };

export default async function TierListsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const lists = await getPublicTierLists(30, q);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Community tier lists</h1>
          <p className="mt-1 text-sm text-muted">
            Top-voted and recent rankings from the community.
          </p>
        </div>
        <Link
          href="/tierlists/new"
          className="rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-black hover:bg-white"
        >
          + Make yours
        </Link>
      </div>

      <form action="/tierlists" method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search tier lists by title, description, or author…"
          className="w-full max-w-md rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-muted"
        />
        <button
          type="submit"
          className="rounded-sm border border-edge bg-surface px-4 py-2 text-sm hover:bg-surface-2"
        >
          Search
        </button>
        {q && (
          <Link
            href="/tierlists"
            className="self-center text-sm text-muted underline hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </form>

      {lists.length === 0 ? (
        <p className="py-16 text-center text-muted">
          {q ? (
            <>No tier lists match “{q}”.</>
          ) : (
            <>
              No public tier lists yet.{" "}
              <Link href="/tierlists/new" className="underline hover:text-foreground">
                Be the first to publish one.
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
              className="border border-edge bg-surface transition-colors hover:border-muted"
            >
              {/* mini board preview */}
              <div className="border-b border-edge bg-black/40 p-2">
                <div className="space-y-px">
                  {list.tiers.slice(0, 6).map((tier) => (
                    <div key={tier.key} className="flex items-center gap-px overflow-hidden">
                      <span
                        className="h-5 w-7 shrink-0"
                        style={{ backgroundColor: tier.color }}
                      />
                      {(list.tier_previews[tier.key] ?? []).slice(0, 11).map((slug, i) => (
                        <span
                          key={i}
                          className="grid h-5 w-5 shrink-0 place-items-center bg-surface-2 p-0.5"
                        >
                          <VendorLogo vendorSlug={slug} className="h-full w-full" />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate font-semibold">{list.title}</h2>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold ${
                      list.score > 0
                        ? "text-emerald-400"
                        : list.score < 0
                          ? "text-rose-400"
                          : "text-muted"
                    }`}
                  >
                    {list.score > 0 ? `+${list.score}` : list.score}
                  </span>
                </div>
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
