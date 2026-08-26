"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Lab logo SVG synced into public/logos/ by scripts/sync-models.mjs.
 * Falls back to the generic chip icon for vendors that appeared in the
 * catalog after the last deploy (their logo file isn't live yet).
 */
export default function VendorLogo({
  vendorSlug,
  className,
}: {
  vendorSlug: string;
  className?: string;
}) {
  return (
    <img
      src={`/logos/${vendorSlug || "default"}.svg`}
      alt=""
      loading="lazy"
      draggable={false}
      className={className}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fbk) {
          img.dataset.fbk = "1";
          img.src = "/logos/default.svg";
        }
      }}
    />
  );
}
