import { ImageResponse } from "next/og";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getModelsWithStats, getTierListBySlug } from "@/lib/data";
import { DEFAULT_TIERS, type Model } from "@/lib/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tier list";

const MAX_PER_ROW = 6;

// vendor_slug -> SVG data URI, cached per isolate so repeat renders skip fetches
const logoCache = new Map<string, string>();

async function logoDataUri(slug: string): Promise<string | null> {
  const cached = logoCache.get(slug);
  if (cached !== undefined) return cached || null;
  try {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/logos/${slug}.svg`;
    // A Worker can't fetch its own hostname; read static files via the
    // assets binding in production, plain fetch in local dev.
    let res: Response;
    try {
      const { env } = getCloudflareContext();
      const assets = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
      res = assets ? await assets.fetch(url) : await fetch(url);
    } catch {
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(String(res.status));
    const svg = await res.text();
    const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    logoCache.set(slug, uri);
    return uri;
  } catch {
    logoCache.set(slug, "");
    return null;
  }
}

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

  const tiers = list?.tiers ?? DEFAULT_TIERS;
  const modelById = new Map(models.map((m) => [m.id, m]));
  const placements = new Map<string, Model[]>(tiers.map((t) => [t.key, []]));
  if (list) {
    for (const item of list.items) {
      const m = modelById.get(item.model_id);
      if (m) placements.get(item.tier)?.push(m);
    }
  }

  const title = list?.title ?? "LLM Tier List";
  const author = list?.profiles?.display_name || list?.profiles?.username;

  // resolve logos for every tile we'll draw (deduped by vendor)
  const shownModels = tiers.flatMap((t) => (placements.get(t.key) ?? []).slice(0, MAX_PER_ROW));
  const logoBySlug = new Map<string, string | null>();
  await Promise.all(
    [...new Set(shownModels.map((m) => m.vendor_slug))].map(async (vs) => {
      logoBySlug.set(vs, await logoDataUri(vs));
    })
  );

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
          {tiers.map((tier) => {
            const rowModels = placements.get(tier.key) ?? [];
            const shown = rowModels.slice(0, MAX_PER_ROW);
            const overflow = rowModels.length - shown.length;
            return (
              <div
                key={tier.key}
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
                    backgroundColor: tier.color,
                    color: "#000",
                    fontSize: tier.label.length > 3 ? 20 : 40,
                    fontWeight: 700,
                    padding: "0 6px",
                    textAlign: "center",
                  }}
                >
                  {tier.label.length > 12 ? `${tier.label.slice(0, 11)}…` : tier.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    flexGrow: 1,
                    backgroundColor: "#1a1a1a",
                  }}
                >
                  {shown.map((m) => {
                    const logo = logoBySlug.get(m.vendor_slug);
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: 168,
                          backgroundColor: "#242424",
                          borderRight: "2px solid #121212",
                          color: "#f2f2f2",
                          fontSize: 15,
                          fontWeight: 600,
                          padding: "0 10px",
                          gap: 9,
                          overflow: "hidden",
                        }}
                      >
                        {logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} width={30} height={30} alt="" />
                        )}
                        <div style={{ display: "flex", overflow: "hidden" }}>
                          {m.name.length > 28 ? `${m.name.slice(0, 27)}…` : m.name}
                        </div>
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        color: "#9a9a9a",
                        fontSize: 20,
                        fontWeight: 600,
                        paddingLeft: 10,
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
          {list?.rank_modes && (
            <div style={{ display: "flex", color: "#6a6a6a", fontSize: 18, marginLeft: 16 }}>
              · thinking modes
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
