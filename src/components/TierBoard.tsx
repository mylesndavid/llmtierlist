import { TIER_COLORS } from "@/lib/tiers";
import { TIERS, type Model, type Tier } from "@/lib/types";
import ModelChip from "./ModelChip";
import Link from "next/link";

interface Props {
  placements: Map<Tier, Model[]>;
  linkModels?: boolean;
  emptyHint?: string;
}

/** Read-only tier board used on the community page and shared tier lists. */
export default function TierBoard({ placements, linkModels = true, emptyHint }: Props) {
  return (
    <div className="border border-black/60 bg-black/60">
      {TIERS.map((tier) => {
        const models = placements.get(tier) ?? [];
        return (
          <div key={tier} className="flex min-h-20 border-b border-black/60 last:border-b-0">
            <div
              className="flex w-20 shrink-0 items-center justify-center p-2 text-center text-lg font-bold text-black sm:w-24"
              style={{ backgroundColor: TIER_COLORS[tier] }}
            >
              {tier}
            </div>
            <div className="flex flex-1 flex-wrap content-start bg-surface">
              {models.length === 0 && emptyHint ? (
                <span className="self-center px-3 text-xs text-muted">{emptyHint}</span>
              ) : (
                models.map((m) =>
                  linkModels ? (
                    <Link key={m.id} href={`/models/${m.slug}`} className="w-36 hover:brightness-125">
                      <ModelChip model={m} />
                    </Link>
                  ) : (
                    <div key={m.id} className="w-36">
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
