import "server-only";

/**
 * Colo-wide cache for expensive read-only payloads.
 *
 * The per-isolate memory cache only helps repeat hits on the same instance;
 * this shares the result across every isolate in a Cloudflare location, so a
 * cold isolate still answers without touching D1.
 */
const ORIGIN = "https://cache.llmtierlist.internal";

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
};

function edgeCache(): CacheLike | null {
  const c = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;
  return c?.default ?? null;
}

function keyFor(key: string): Request {
  return new Request(`${ORIGIN}/${encodeURIComponent(key)}`);
}

export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>
): Promise<T> {
  const cache = edgeCache();
  if (!cache) return load();

  try {
    const hit = await cache.match(keyFor(key));
    if (hit) return (await hit.json()) as T;
  } catch {
    // fall through to a live load
  }

  const data = await load();
  try {
    await cache.put(
      keyFor(key),
      new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttlSeconds}`,
        },
      })
    );
  } catch {
    // caching is best effort
  }
  return data;
}

export async function invalidateJson(key: string): Promise<void> {
  try {
    await edgeCache()?.delete(keyFor(key));
  } catch {
    // ignore
  }
}
