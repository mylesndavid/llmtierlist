import type { Model } from "@/lib/types";
import VendorLogo from "./VendorLogo";
import { SparkIcon } from "./icons";

/**
 * Rectangular tile used in tier rows and the builder pool.
 * Exactly 80px (h-20) tall — tier rows are min-h-20, so tiles fill the full
 * row height until they wrap onto a second line.
 */
export default function ModelChip({ model }: { model: Model }) {
  const isThinking = model.variant === "thinking";
  return (
    <div
      className="relative flex h-20 w-full select-none items-center gap-2 bg-surface-2 px-2.5 outline outline-1 outline-black/60"
      title={`${model.name} — ${model.vendor}${isThinking ? " (thinking mode)" : ""}`}
    >
      <VendorLogo vendorSlug={model.vendor_slug} className="h-8 w-8 shrink-0" />
      <span className="line-clamp-3 min-w-0 flex-1 text-left text-[10.5px] font-semibold leading-[1.2] text-foreground">
        {isThinking ? model.name.replace(/ \(Thinking\)$/, "") : model.name}
      </span>
      {isThinking && (
        <span className="absolute right-1 top-1 text-violet-300/90" aria-label="Thinking mode">
          <SparkIcon />
        </span>
      )}
    </div>
  );
}
