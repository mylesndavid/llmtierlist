import Link from "next/link";
import VendorLogo from "@/components/VendorLogo";
import { TierBadge, fmtReleaseDay } from "@/components/ReleaseRow";
import { loadNewReleases } from "@/lib/newReleasesLoad";

/**
 * "New this week" strip for the home page: models released in the last 7
 * days, newest first. Server component; renders nothing when there are none
 * or the data is unavailable.
 */
export default async function NewThisWeek({ limit = 8 }: { limit?: number }) {
  const load = await loadNewReleases(7);
  if (!load.ok || load.entries.length === 0) return null;
  const entries = load.entries.slice(0, limit);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold">
          New this week{" "}
          <span className="text-sm font-normal text-muted">{load.entries.length} released</span>
        </h2>
        <Link href="/new" className="shrink-0 text-sm text-muted hover:text-foreground">
          All new models →
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {entries.map((e) => {
          const body = (
            <>
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-surface-2 p-1">
                  <VendorLogo vendorSlug={e.vendorSlug} className="h-full w-full" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{e.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {e.vendor} · {fmtReleaseDay(e.releaseDate)}
                  </span>
                </span>
              </span>
              <span className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                {e.value ? (
                  <>
                    <TierBadge tier={e.value.tier} />
                    <span className="font-mono">Value {e.value.score.toFixed(1)}</span>
                  </>
                ) : (
                  "Not benchmarked yet"
                )}
              </span>
            </>
          );
          return (
            <li key={e.id} className="w-52 shrink-0 snap-start">
              {e.slug ? (
                <Link
                  href={`/models/${e.slug}`}
                  className="block h-full border border-edge bg-surface p-3 hover:bg-surface-2"
                >
                  {body}
                </Link>
              ) : (
                <div className="h-full border border-edge bg-surface p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
