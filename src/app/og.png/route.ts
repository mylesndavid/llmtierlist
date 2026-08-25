import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Query } from "@/lib/d1";
import { fromBase64, renderHomeOgPng } from "@/lib/og";

const TTL_MS = 60 * 60 * 1000; // refresh the board snapshot hourly

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function regenerate(): Promise<Uint8Array> {
  const png = await renderHomeOgPng();
  await d1Query(
    `insert into og_home_cache (id, png, updated_at) values (1, ?, datetime('now'))
     on conflict (id) do update set png = excluded.png, updated_at = datetime('now')`,
    [toBase64(png)]
  );
  return png;
}

/**
 * The site-wide OG image: always serves instantly from the cached snapshot
 * (crawlers time out on live renders), refreshing in the background when the
 * snapshot is over an hour old — so it tracks the current community board.
 */
export async function GET() {
  const rows = await d1Query<{ png: string; updated_at: string }>(
    "select png, updated_at from og_home_cache where id = 1"
  );

  let png: Uint8Array;
  if (rows.length === 0) {
    png = await regenerate(); // first ever hit
  } else {
    png = fromBase64(rows[0].png);
    const age = Date.now() - new Date(rows[0].updated_at + "Z").getTime();
    if (age > TTL_MS) {
      try {
        const { ctx } = getCloudflareContext();
        ctx.waitUntil(regenerate());
      } catch {
        // local dev: refresh on the next request instead
        regenerate().catch(() => {});
      }
    }
  }

  return new Response(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}
