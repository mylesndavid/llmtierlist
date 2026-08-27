"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ModelWithStats } from "@/lib/types";
import { formatContextWindow, formatParams, formatPrice } from "@/lib/tiers";
import VoteButtons from "./VoteButtons";
import StarRating from "./StarRating";
import VendorLogo from "./VendorLogo";

interface Props {
  models: ModelWithStats[];
  userVotes: Record<string, number>;
  signedIn: boolean;
}

export default function ModelDirectory({ models, userVotes, signedIn }: Props) {
  // Filters live in the URL so back/forward and shared links restore them.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [vendor, setVendor] = useState(params.get("vendor") ?? "all");
  const [license, setLicense] = useState(params.get("license") ?? "all");
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | null>(() => {
    const raw = params.get("age");
    if (raw === "all") return null;
    return raw ? Number(raw) : 12;
  });
  const [visible, setVisible] = useState(48);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const syncUrl = useCallback(
    (next: Partial<{ q: string; vendor: string; license: string; age: string }>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const isDefault =
          (key === "q" && !value) ||
          (key !== "q" && (value === "all" || (key === "age" && value === "12")));
        if (isDefault) sp.delete(key);
        else sp.set(key, value as string);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // debounce the text field so typing doesn't spam history entries
  useEffect(() => {
    const t = setTimeout(() => syncUrl({ q: query }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const vendors = useMemo(
    () => [...new Set(models.map((m) => m.vendor))].sort(),
    [models]
  );

  const ageCutoff = useMemo(() => {
    if (maxAgeMonths == null) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - maxAgeMonths);
    return d.toISOString().slice(0, 10);
  }, [maxAgeMonths]);

  const filtered = models
    .filter((m) => {
      const q = query.toLowerCase();
      return (
        (!q || m.name.toLowerCase().includes(q) || m.vendor.toLowerCase().includes(q)) &&
        (vendor === "all" || m.vendor === vendor) &&
        (license === "all" || m.license === license) &&
        (!ageCutoff || (m.release_date ?? "") >= ageCutoff)
      );
    })
    .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));

  const shown = filtered.slice(0, visible);
  const activeFilters =
    (vendor !== "all" ? 1 : 0) + (license !== "all" ? 1 : 0) + (maxAgeMonths !== 12 ? 1 : 0);

  const selectCls =
    "rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-muted";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(48);
            }}
            placeholder="Search models…"
            className={`${selectCls} min-w-0 flex-1 placeholder:text-muted`}
          />
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`shrink-0 rounded-sm border px-3 py-2 text-sm font-medium transition-colors sm:hidden ${
              activeFilters > 0 || filtersOpen
                ? "border-foreground bg-foreground text-black"
                : "border-edge text-muted"
            }`}
          >
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
        </div>

        <div
          className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-2 sm:!grid sm:grid-cols-[repeat(3,auto)_1fr] sm:items-center`}
        >
          <select
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value);
              setVisible(48);
              syncUrl({ vendor: e.target.value });
            }}
            className={selectCls}
          >
            <option value="all">All vendors</option>
            {vendors.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            value={license}
            onChange={(e) => {
              setLicense(e.target.value);
              setVisible(48);
              syncUrl({ license: e.target.value });
            }}
            className={selectCls}
          >
            <option value="all">Any license</option>
            <option value="proprietary">Proprietary</option>
            <option value="open-weights">Open weights</option>
          </select>
          <select
            value={maxAgeMonths ?? "all"}
            onChange={(e) => {
              setMaxAgeMonths(e.target.value === "all" ? null : Number(e.target.value));
              setVisible(48);
              syncUrl({ age: e.target.value });
            }}
            className={`${selectCls} col-span-2 sm:col-span-1`}
          >
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="24">Last 2 years</option>
            <option value="all">All time</option>
          </select>
          <span className="hidden text-xs text-muted sm:inline">{filtered.length} models</span>
        </div>

        <p className="text-xs text-muted sm:hidden">{filtered.length} models</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => (
          <div
            key={m.id}
            className="group relative flex min-w-0 flex-col gap-3 border border-edge bg-surface p-4 transition-colors hover:border-muted"
          >
            <Link
              href={`/models/${m.slug}`}
              aria-label={m.name}
              className="absolute inset-0 z-0"
            />
            <div className="pointer-events-none relative z-10 flex items-start gap-3">
              <Link
                href={`/labs/${m.vendor_slug}`}
                aria-label={`All ${m.vendor} models`}
                title={`All ${m.vendor} models`}
                className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-surface-2 p-1.5 transition-colors hover:bg-surface"
              >
                <VendorLogo vendorSlug={m.vendor_slug} className="h-full w-full" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold group-hover:underline">{m.name}</div>
                <div className="pointer-events-auto text-xs text-muted">
                  <Link href={`/labs/${m.vendor_slug}`} className="hover:text-foreground hover:underline">
                    {m.vendor}
                  </Link>
                </div>
              </div>
              <div className="pointer-events-auto">
              <VoteButtons
                modelId={m.id}
                netScore={m.stats.net_score}
                userVote={userVotes[m.id] ?? 0}
                signedIn={signedIn}
              />
              </div>
            </div>
            <p className="pointer-events-none relative z-10 line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{m.description}</p>
            <div className="pointer-events-none relative z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              <span className="border border-edge px-2 py-0.5">
                {m.license === "open-weights" ? "Open" : "Closed"}
              </span>
              <span title="input / output per 1M tokens">
                {formatPrice(m.price_in)}/{formatPrice(m.price_out)}
              </span>
              <span>{formatContextWindow(m.context_window)}</span>
              {formatParams(m.params_b, m.active_params_b) && (
                <span>
                  {formatParams(m.params_b, m.active_params_b)}
                  {m.is_moe ? " MoE" : ""}
                </span>
              )}
              {m.release_date && (
                <span>
                  {new Date(m.release_date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
              {m.stats.avg_rating != null && (
                <span className="ml-auto flex items-center gap-1">
                  <StarRating rating={Number(m.stats.avg_rating)} size="text-xs" />
                  <span>({m.stats.review_count})</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {filtered.length > shown.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + 48)}
          className="w-full rounded-sm border border-edge bg-surface px-4 py-3 text-sm font-medium text-muted hover:border-muted hover:text-foreground"
        >
          Show more ({filtered.length - shown.length} left)
        </button>
      )}
      {filtered.length === 0 && (
        <p className="py-10 text-center text-muted">No models match your filters.</p>
      )}
    </div>
  );
}
