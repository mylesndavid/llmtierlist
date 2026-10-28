import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import {
  SEND_COUNT,
  applyJevAnswers,
  buildJevRequest,
  buildQuery,
  buildResult,
  normalizeSearch,
  selectPosts,
  type XPanelResult,
  type XPost,
} from "./xPosts";

export const SEARCH_URL = "https://treg.to/call/treg.x.search.posts";
export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

const TTL_S = 12 * 60 * 60;
/**
 * Unscored results expire sooner so sentiment is retried. Empty results keep the
 * full TTL: a miss bills about $0.0016, and crawlers walk every model page.
 */
const SHORT_TTL_S = 60 * 60;
const TIMEOUT_MS = 15_000;

/** Secrets: process.env (local dev, and OpenNext's copy of the bindings), else the Worker env. */
function secret(name: string): string | null {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  try {
    const { env } = getCloudflareContext();
    const v = (env as unknown as Record<string, unknown>)[name];
    return typeof v === "string" && v ? v : null;
  } catch {
    return null; // not running on Workers
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

export async function searchX(query: string): Promise<XPost[]> {
  const token = secret("TREG_TOKEN");
  if (!token) throw new Error("TREG_TOKEN is not set");
  const json = await postJson(
    SEARCH_URL,
    { "X-Treg-Token": token, "X-Treg-Route-Max-Cost": "0.02" },
    { q: query }
  );
  return normalizeSearch(json);
}

/** Relevance and sentiment from Jev; null without a key or on any failure. */
export async function scoreWithJev(modelLabel: string, posts: XPost[]) {
  const key = secret("OPENROUTER_API_KEY");
  if (!key || posts.length === 0) return null;
  try {
    const json = await postJson(
      DECISIONS_URL,
      { Authorization: `Bearer ${key}` },
      buildJevRequest(modelLabel, posts)
    );
    return applyJevAnswers(json, posts);
  } catch (err) {
    unstable_rethrow(err);
    console.error("x posts: sentiment unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchPanel(model: { id: string; name: string }): Promise<XPanelResult> {
  const found = await searchX(buildQuery(model.name, model.id));
  const selected = selectPosts(found, Date.now() / 1000);
  const scored = await scoreWithJev(`${model.name} (${model.id})`, selected.slice(0, SEND_COUNT));
  if (scored) return buildResult(scored, true);
  return buildResult(selected.map((p) => ({ ...p, sentiment: null })), false);
}

export function panelTtl(r: XPanelResult): number {
  return r.posts.length > 0 && !r.scored ? SHORT_TTL_S : TTL_S;
}

// Per-isolate memory in front of the colo cache (also the only cache in local dev).
const memory = new Map<string, { data: XPanelResult; expires: number }>();

export function resetXPostsMemoryCache() {
  memory.clear();
}

export type XPanelLoad = ({ ok: true } & XPanelResult) | { ok: false; error: string };

/** Recent X posts about a model, scored when possible. Never throws; failures are not cached. */
export async function loadXPosts(model: { id: string; name: string }): Promise<XPanelLoad> {
  const key = `x-posts:v1:${model.id}`;
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return { ok: true, ...hit.data };
  try {
    const data = await cachedJson(key, panelTtl, () => fetchPanel(model));
    memory.set(key, { data, expires: Date.now() + panelTtl(data) * 1000 });
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error(`x posts: search failed for ${model.id}:`, error);
    return { ok: false, error };
  }
}
