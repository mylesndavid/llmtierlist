import { ImageResponse } from "next/og";
import { getModelsWithStats, getTierListBySlug } from "@/lib/data";
import { TIER_COLORS } from "@/lib/tiers";
import { TIERS, type Model, type Tier } from "@/lib/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tier list";

const MAX_PER_ROW = 6;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [list, models] = await Promise.all([
    getTierListBySlug(slug),
    getModelsWithStats(),
  ]);

  const modelById = new Map(models.map((m) => [m.id, m]));
  const placements = new Map<Tier, Model[]>(TIERS.map((t) => [t, []]));
  if (list) {
    for (const item of list.items) {
      const m = modelById.get(item.model_id);
      if (m) placements.get(item.tier)!.push(m);
    }
  }

  const title = list?.title ?? "LLM Tier List";
  const author = list?.profiles?.display_name || list?.profiles?.username;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#121212",
          fontFamily: "sans-serif",
        }}
      >
        {/* tier rows */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          {TIERS.map((tier) => {
            const rowModels = placements.get(tier) ?? [];
            const shown = rowModels.slice(0, MAX_PER_ROW);
            const overflow = rowModels.length - shown.length;
            return (
              <div
                key={tier}
                style={{
                  display: "flex",
                  flexGrow: 1,
                  borderBottom: "2px solid #000",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 92,
                    backgroundColor: TIER_COLORS[tier],
                    color: "#000",
                    fontSize: 40,
                    fontWeight: 700,
                  }}
                >
                  {tier}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexGrow: 1,
                    backgroundColor: "#1a1a1a",
                    paddingLeft: 8,
                    gap: 8,
                  }}
                >
                  {shown.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 158,
                        height: 62,
                        backgroundColor: "#242424",
                        border: "1px solid #000",
                        color: "#f2f2f2",
                        fontSize: 16,
                        fontWeight: 600,
                        padding: "0 10px",
                        textAlign: "center",
                        overflow: "hidden",
                      }}
                    >
                      {m.name.length > 34 ? `${m.name.slice(0, 33)}…` : m.name}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        color: "#9a9a9a",
                        fontSize: 20,
                        fontWeight: 600,
                        paddingLeft: 4,
                      }}
                    >
                      +{overflow}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* gray name bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 84,
            backgroundColor: "#2e2e2e",
            padding: "0 32px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#f2f2f2",
              fontSize: 34,
              fontWeight: 700,
              overflow: "hidden",
            }}
          >
            {title.length > 44 ? `${title.slice(0, 43)}…` : title}
          </div>
          {author && (
            <div style={{ display: "flex", color: "#9a9a9a", fontSize: 22, marginLeft: 16 }}>
              by {author}
            </div>
          )}
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              color: "#9a9a9a",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            llmtierlist.com
          </div>
        </div>
      </div>
    ),
    size
  );
}
