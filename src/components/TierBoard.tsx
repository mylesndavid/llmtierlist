import { DEFAULT_TIERS, type Model, type TierDef } from "@/lib/types";
import ModelChip from "./ModelChip";
import Link from "next/link";

interface Props {
  placements: Map<string, Model[]>;
  tiers?: TierDef[];
  linkModels?: boolean;
  emptyHint?: string;
}

/** Read-only tier board used on the community page and shared tier lists. */
export default function TierBoard({
  placements,
  tiers = DEFAULT_TIERS,
  linkModels = true,
  emptyHint,
}: Props) {
  return (
    <div data-export-board className="border border-black/60 bg-black/60">
      {tiers.map((tier) => {
        const models = placements.get(tier.key) ?? [];
        return (
          <div key={tier.key} className="flex min-h-16 border-b border-black/60 last:border-b-0 sm:min-h-20">
            <div
              className="flex w-10 shrink-0 items-center justify-center break-words p-1 text-center text-sm font-bold leading-tight text-black sm:w-24 sm:p-2 sm:text-lg"
              style={{ backgroundColor: tier.color }}
            >
              {tier.label}
            </div>
            <div className="flex flex-1 flex-wrap content-start bg-surface">
              {models.length === 0 && emptyHint ? (
                <span className="self-center px-3 text-xs text-muted">{emptyHint}</span>
              ) : (
                models.map((m) =>
                  linkModels ? (
                    <Link key={m.id} href={`/models/${m.slug}`} className="w-1/4 hover:brightness-125 sm:w-36">
                      <ModelChip model={m} />
                    </Link>
                  ) : (
                    <div key={m.id} className="w-1/4 sm:w-36">
                      <ModelChip model={m} />
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
