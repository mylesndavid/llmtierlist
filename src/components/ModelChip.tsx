import type { Model } from "@/lib/types";
import VendorLogo from "./VendorLogo";

/**
 * Rectangular tile used in tier rows and the builder pool.
 * Exactly 80px (h-20) tall — tier rows are min-h-20, so tiles fill the full
 * row height until they wrap onto a second line.
 */
export default function ModelChip({ model }: { model: Model }) {
  return (
    <div
      className="flex h-20 w-full select-none items-center gap-2 bg-surface-2 px-2.5 outline outline-1 outline-black/60"
      title={`${model.name} — ${model.vendor}`}
    >
      <VendorLogo vendorSlug={model.vendor_slug} className="h-8 w-8 shrink-0" />
      <span className="line-clamp-3 min-w-0 flex-1 text-left text-[10.5px] font-semibold leading-[1.2] text-foreground">
        {model.name}
      </span>
    </div>
  );
}
