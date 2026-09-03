import type { Model } from "@/lib/types";
import VendorLogo from "./VendorLogo";
import { SparkIcon } from "./icons";

/**
 * Model tile for tier rows and the builder pool.
 * Mobile: compact vertical tile (logo over name) so four fit per lane.
 * Desktop: wider horizontal tile (logo beside name).
 * Height matches the tier rows exactly so tiles fill the lane.
 */
export default function ModelChip({ model }: { model: Model }) {
  const isThinking = model.variant === "thinking";
  const name = model.name;
  return (
    <div
      className="relative flex h-16 w-full select-none flex-col items-center justify-center gap-0.5 bg-surface-2 px-1 text-center outline outline-1 outline-black/60 sm:h-20 sm:flex-row sm:justify-start sm:gap-2 sm:px-2.5 sm:text-left"
      title={`${model.name} — ${model.vendor}${isThinking ? " (thinking mode)" : ""}`}
    >
      <VendorLogo vendorSlug={model.vendor_slug} className="h-5 w-5 shrink-0 sm:h-8 sm:w-8" />
      <span className="line-clamp-2 w-full min-w-0 text-[9px] font-semibold leading-[1.15] text-foreground sm:line-clamp-3 sm:flex-1 sm:text-[10.5px] sm:leading-[1.2]">
        {name}
      </span>
      {isThinking && (
        <span className="absolute right-0.5 top-0.5 text-violet-300/90 sm:right-1 sm:top-1" aria-label="Thinking mode">
          <SparkIcon />
        </span>
      )}
    </div>
  );
}
