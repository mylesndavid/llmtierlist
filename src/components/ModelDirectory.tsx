"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ModelWithStats } from "@/lib/types";
import { formatContextWindow } from "@/lib/tiers";
import VoteButtons from "./VoteButtons";
import StarRating from "./StarRating";
import VendorLogo from "./VendorLogo";

interface Props {
  models: ModelWithStats[];
  userVotes: Record<string, number>;
  signedIn: boolean;
}

export default function ModelDirectory({ models, userVotes, signedIn }: Props) {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("all");
  const [license, setLicense] = useState("all");
  const [maxAgeMonths, setMaxAgeMonths] = useState<number | null>(12);
  const [visible, setVisible] = useState(48);

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

  const selectCls =
    "rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-muted";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(48);
          }}
          placeholder="Search models…"
          className={`${selectCls} flex-1 min-w-48 placeholder:text-muted`}
        />
        <select
          value={vendor}
          onChange={(e) => {
            setVendor(e.target.value);
            setVisible(48);
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
          }}
          className={selectCls}
        >
          <option value="3">Last 3 months</option>
          <option value="6">Last 6 months</option>
          <option value="12">Last 12 months</option>
          <option value="24">Last 2 years</option>
          <option value="all">All time</option>
        </select>
        <span className="self-center text-xs text-muted">{filtered.length} models</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => (
          <div
            key={m.id}
            className="flex min-w-0 flex-col gap-3 border border-edge bg-surface p-4 transition-colors hover:border-muted"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-surface-2 p-1.5">
                <VendorLogo vendorSlug={m.vendor_slug} className="h-full w-full" />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/models/${m.slug}`} className="block truncate font-semibold hover:underline">
                  {m.name}
                </Link>
                <div className="text-xs text-muted">{m.vendor}</div>
              </div>
              <VoteButtons
                modelId={m.id}
                netScore={m.stats.net_score}
                userVote={userVotes[m.id] ?? 0}
                signedIn={signedIn}
              />
            </div>
            <p className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{m.description}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              <span className="border border-edge px-2 py-0.5">
                {m.license === "open-weights" ? "Open weights" : "Proprietary"}
              </span>
              <span>{formatContextWindow(m.context_window)}</span>
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
