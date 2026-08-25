import type { Model } from "@/lib/types";
import VendorLogo from "./VendorLogo";
import { SparkIcon } from "./icons";

/**
 * Rectangular tile used in tier rows and the builder pool.
 * Matches the tier row height exactly (h-14 mobile / h-20 desktop) so tiles
 * fill the full lane until they wrap.
 */
export default function ModelChip({ model }: { model: Model }) {
  const isThinking = model.variant === "thinking";
  return (
    <div
      className="relative flex h-16 w-full select-none items-center gap-1.5 bg-surface-2 px-1.5 outline outline-1 outline-black/60 sm:h-20 sm:px-2.5"
      title={`${model.name} — ${model.vendor}${isThinking ? " (thinking mode)" : ""}`}
    >
      <VendorLogo vendorSlug={model.vendor_slug} className="h-5 w-5 shrink-0 sm:h-8 sm:w-8" />
      <span className="line-clamp-3 min-w-0 flex-1 text-left text-[10px] font-semibold leading-[1.2] text-foreground sm:text-[10.5px]">
        {isThinking ? model.name.replace(/ \(Thinking\)$/, "") : model.name}
      </span>
      {isThinking && (
        <span className="absolute right-0.5 top-0.5 text-violet-300/90 sm:right-1 sm:top-1" aria-label="Thinking mode">
          <SparkIcon />
        </span>
      )}
    </div>
  );
}
