import { d1Query } from "@/lib/d1";
import { checkActionRateLimit, getAnonIdentity, ipBucket } from "@/lib/anon";

const BOT_RE = /bot|crawl|spider|slurp|preview|externalhit|scrape|curl|wget|python|headless/i;

/** First-party page view beacon: one visits row per (day, visitor hash). */
export async function POST(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });

  // Issue the signed voting identity here so it is already persisted by the
  // time anyone votes (votes refuse identities minted in the same request).
  await getAnonIdentity();

  const day = new Date().toISOString().slice(0, 10);
  // Keyed on the Cloudflare-provided IP only. The User-Agent is client
  // controlled, so including it let one host mint unlimited visitor rows.
  const visitor = (await ipBucket("visit")).split(":")[1];

  if (!(await checkActionRateLimit(`hit:${visitor}`, 100))) {
    return new Response(null, { status: 204 });
  }
  await d1Query(
    `insert into visits (day, visitor) values (?, ?)
     on conflict (day, visitor) do update set views = views + 1`,
    [day, visitor]
  );
  return new Response(null, { status: 204 });
}
