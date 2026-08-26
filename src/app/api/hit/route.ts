import { d1Query } from "@/lib/d1";
import { checkActionRateLimit } from "@/lib/anon";

const BOT_RE = /bot|crawl|spider|slurp|preview|externalhit|scrape|curl|wget|python|headless/i;

/** First-party page view beacon: one visits row per (day, visitor hash). */
export async function POST(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const day = new Date().toISOString().slice(0, 10);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${day}|${ip}|${ua}`)
  );
  const visitor = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // one visitor row per browser per day; cap writes so the beacon can't be
  // used to bloat the table
  if (!(await checkActionRateLimit(`hit:${visitor}`, 200))) {
    return new Response(null, { status: 204 });
  }
  await d1Query(
    `insert into visits (day, visitor) values (?, ?)
     on conflict (day, visitor) do update set views = views + 1`,
    [day, visitor]
  );
  return new Response(null, { status: 204 });
}
