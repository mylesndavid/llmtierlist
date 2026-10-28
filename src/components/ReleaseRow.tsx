import Link from "next/link";
import VendorLogo from "@/components/VendorLogo";
import ModalityIcon from "@/components/ModalityIcons";
import { DEFAULT_TIERS } from "@/lib/types";
import { formatContextWindow, formatPrice } from "@/lib/tiers";
import type { ReleaseEntry } from "@/lib/newReleases";

const TIER_COLOR = new Map(DEFAULT_TIERS.map((t) => [t.key, t.color]));

export function fmtReleaseDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function TierBadge({ tier, className = "" }: { tier: string; className?: string }) {
  return (
    <span
      className={`inline-block w-6 rounded-sm text-center text-xs font-bold text-black ${className}`}
      style={{ backgroundColor: TIER_COLOR.get(tier) }}
      title={`${tier} tier (Balanced value)`}
    >
      {tier}
    </span>
  );
}

function ValueCell({ e }: { e: ReleaseEntry }) {
  if (!e.value) return <span className="text-xs text-muted">Not benchmarked yet</span>;
  return (
    <span className="flex items-center gap-2 text-xs">
      <TierBadge tier={e.value.tier} />
      <span className="font-mono">
        <span className="text-muted">Q</span> {e.value.quality.toFixed(1)}
      </span>
      <span className="font-mono">
        <span className="text-muted">Value</span> {e.value.score.toFixed(1)}
      </span>
    </span>
  );
}

/** One release in the /new list. */
export default function ReleaseRow({ e }: { e: ReleaseEntry }) {
  const name = e.slug ? (
    <Link href={`/models/${e.slug}`} className="hover:underline">
      {e.name}
    </Link>
  ) : (
    e.name
  );
  return (
    <li className="flex flex-col gap-2 border-b border-edge bg-surface px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface-2 p-1.5">
          <VendorLogo vendorSlug={e.vendorSlug} className="h-full w-full" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold [overflow-wrap:anywhere]">{name}</span>
            {e.openWeights && (
              <span className="border border-edge px-1.5 py-0.5 text-[10px] text-muted">Open weights</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{e.vendor}</span>
            <span>{fmtReleaseDay(e.releaseDate)}</span>
            <span className="font-mono">
              {e.priceIn == null && e.priceOut == null
                ? "Price —"
                : `${formatPrice(e.priceIn)} / ${formatPrice(e.priceOut)} per 1M`}
            </span>
            <span>{formatContextWindow(e.context)}</span>
            {e.inputModalities.length > 0 && (
              <span className="flex items-center gap-1" aria-label="Modalities">
                {e.inputModalities.map((k) => (
                  <ModalityIcon key={k} kind={k} size={13} />
                ))}
                <span aria-hidden>→</span>
                {e.outputModalities.map((k) => (
                  <ModalityIcon key={`o-${k}`} kind={k} size={13} />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="pl-12 sm:pl-0">
        <ValueCell e={e} />
      </div>
    </li>
  );
}
