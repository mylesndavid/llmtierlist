import { ImageResponse } from "next/og";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Query } from "./d1";
import { getTierListBySlug } from "./data";
import type { Model, TierDef } from "./types";

const SIZE = { width: 1200, height: 630 };
const MAX_PER_ROW = 6;

// vendor_slug -> SVG data URI, cached per isolate
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

type OgModel = Pick<Model, "id" | "name" | "vendor_slug">;

/** Render a tier list's OG/share image and return the PNG bytes. */
export async function renderListOgPng(slug: string): Promise<Uint8Array | null> {
  const list = await getTierListBySlug(slug);
  if (!list || !list.is_public) return null;

  const tiers: TierDef[] = list.tiers;
  const ids = list.items.map((i) => i.model_id);
  const models: OgModel[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    models.push(
      ...(await d1Query<OgModel>(
        `select id, name, vendor_slug from models where id in (${chunk.map(() => "?").join(",")})`,
        chunk
      ))
    );
  }
  const modelById = new Map(models.map((m) => [m.id, m]));
  const placements = new Map<string, OgModel[]>(tiers.map((t) => [t.key, []]));
  for (const item of list.items) {
    const m = modelById.get(item.model_id);
    if (m) placements.get(item.tier)?.push(m);
  }

  const shown = tiers.flatMap((t) => (placements.get(t.key) ?? []).slice(0, MAX_PER_ROW));
  const logoBySlug = new Map<string, string | null>();
  await Promise.all(
    [...new Set(shown.map((m) => m.vendor_slug))].map(async (vs) => {
      logoBySlug.set(vs, await logoDataUri(vs));
    })
  );

  const author = list.profiles?.display_name || list.profiles?.username;

  const image = new ImageResponse(
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
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          {tiers.map((tier) => {
            const rowModels = placements.get(tier.key) ?? [];
            const rowShown = rowModels.slice(0, MAX_PER_ROW);
            const overflow = rowModels.length - rowShown.length;
            return (
              <div key={tier.key} style={{ display: "flex", flexGrow: 1, borderBottom: "2px solid #000" }}>
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
                <div style={{ display: "flex", alignItems: "stretch", flexGrow: 1, backgroundColor: "#1a1a1a" }}>
                  {rowShown.map((m) => {
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
                    <div style={{ display: "flex", alignItems: "center", color: "#9a9a9a", fontSize: 20, fontWeight: 600, paddingLeft: 10 }}>
                      +{overflow}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", height: 84, backgroundColor: "#2e2e2e", padding: "0 32px" }}>
          <div style={{ display: "flex", color: "#f2f2f2", fontSize: 34, fontWeight: 700, overflow: "hidden" }}>
            {list.title.length > 44 ? `${list.title.slice(0, 43)}…` : list.title}
          </div>
          {author && (
            <div style={{ display: "flex", color: "#9a9a9a", fontSize: 22, marginLeft: 16 }}>
              by {author}
            </div>
          )}
          {list.rank_modes && (
            <div style={{ display: "flex", color: "#6a6a6a", fontSize: 18, marginLeft: 16 }}>
              · thinking modes
            </div>
          )}
          <div style={{ display: "flex", marginLeft: "auto", color: "#9a9a9a", fontSize: 22, fontWeight: 600 }}>
            llmtierlist.com
          </div>
        </div>
      </div>
    ),
    SIZE
  );
  return new Uint8Array(await image.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Render and persist a list's OG image so crawlers get it instantly. */
export async function generateAndStoreOg(listId: string, slug: string): Promise<Uint8Array | null> {
  const png = await renderListOgPng(slug);
  if (!png) return null;
  await d1Query(
    `insert into og_cache (tier_list_id, png, updated_at) values (?, ?, datetime('now'))
     on conflict (tier_list_id) do update set png = excluded.png, updated_at = datetime('now')`,
    [listId, toBase64(png)]
  );
  return png;
}
