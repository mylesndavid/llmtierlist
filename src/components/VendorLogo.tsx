/* eslint-disable @next/next/no-img-element */

/** Lab logo SVG synced into public/logos/ by scripts/sync-models.mjs. */
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
    />
  );
}
