import { d1Query } from "@/lib/d1";
import { fromBase64, generateAndStoreOg } from "@/lib/og";

/**
 * Serves the pre-rendered OG image for a tier list. Rendering happens at save
 * time (and lazily here on a miss) so crawlers with tight timeouts — X, Slack,
 * iMessage — always get a fast response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const rows = await d1Query<{ id: string; updated_at: string; png: string | null; og_updated: string | null }>(
    `select tl.id, tl.updated_at, oc.png, oc.updated_at as og_updated
     from tier_lists tl left join og_cache oc on oc.tier_list_id = tl.id
     where tl.slug = ? and tl.is_public = 1`,
    [slug]
  );
  if (!rows.length) return new Response("Not found", { status: 404 });
  const row = rows[0];

  let png: Uint8Array | null = null;
  if (row.png && row.og_updated && row.og_updated >= row.updated_at) {
    png = fromBase64(row.png);
  } else {
    png = await generateAndStoreOg(row.id, slug);
  }
  if (!png) return new Response("Not found", { status: 404 });

  return new Response(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}
