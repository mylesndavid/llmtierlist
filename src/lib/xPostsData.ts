import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import { readStoredPanel, readStoredPanels, writeStoredPanel } from "./xPanelStore";
import {
  SEARCH_LADDER,
  SEND_COUNT,
  SHOW_COUNT,
  ENOUGH_CANDIDATES,
  applyJevAnswers,
  applyLookup,
  buildJevRequest,
  buildQuery,
  buildResult,
  mergePosts,
  normalizeSearch,
  parsePostLookup,
  selectPosts,
  sentimentSummary,
  usablePosts,
  type PostLookup,
  type QueryType,
  type ShownPost,
  type XPanelResult,
  type XPost,
} from "./xPosts";

/** AnyAPI's X search through treg: advanced-search operators in `query`, Top or Latest ranking. */
export const SEARCH_URL = "https://treg.to/call/anyapi.x.search.posts";
/** TikHub's post detail through treg (GET ?tweet_id=): quoted post, reply target, expanded links. */
export const LOOKUP_URL = "https://treg.to/call/tikhub.x.twitter-web-fetch-tweet-detail";
export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export const CACHE_VERSION = "v2";
const TTL_S = 12 * 60 * 60;
/**
 * Unscored results expire sooner so sentiment is retried. Empty results keep the
 * full TTL: crawlers walk every model page.
 */
const SHORT_TTL_S = 60 * 60;
const TIMEOUT_MS = 15_000;
const LOOKUP_TIMEOUT_MS = 8_000;
/** A stored panel older than this is not shown by cache-only readers at all. */
const PEEK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

async function requestJson(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function tregToken(): string {
  const token = secret("TREG_TOKEN");
  if (!token) throw new Error("TREG_TOKEN is not set");
  return token;
}

export async function searchX(query: string, queryType: QueryType): Promise<XPost[]> {
  const json = await requestJson(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Treg-Token": tregToken() },
    body: JSON.stringify({ query, queryType, limit: 20 }),
  });
  return normalizeSearch(json);
}

/**
 * Walk the search ladder (popular first, then wider) until there are enough
 * usable posts. A failed first step fails the search; a failed later step
 * keeps what earlier steps found.
 */
export async function searchLadder(model: { id: string; name: string }): Promise<XPost[]> {
  let found: XPost[] = [];
  for (const [i, step] of SEARCH_LADDER.entries()) {
    try {
      const posts = await searchX(buildQuery(model.name, model.id, step.minFaves), step.queryType);
      found = mergePosts(found, posts);
    } catch (err) {
      unstable_rethrow(err);
      if (i === 0) throw err;
      console.error(`x posts: search step ${i + 1} failed for ${model.id}:`, err instanceof Error ? err.message : err);
      break;
    }
    if (usablePosts(found).length >= ENOUGH_CANDIDATES) break;
  }
  return found;
}

/** Quoted post, reply target and expanded links for one post; null on any failure. */
export async function lookupPost(id: string): Promise<PostLookup | null> {
  try {
    const json = await requestJson(
      `${LOOKUP_URL}?tweet_id=${encodeURIComponent(id)}`,
      { method: "GET", headers: { "X-Treg-Token": tregToken() } },
      LOOKUP_TIMEOUT_MS
    );
    return parsePostLookup(json);
  } catch (err) {
    unstable_rethrow(err);
    console.error(`x posts: lookup failed for ${id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Relevance and sentiment from Jev; null without a key or on any failure. */
export async function scoreWithJev(modelLabel: string, posts: XPost[]): Promise<ShownPost[] | null> {
  const key = secret("OPENROUTER_API_KEY");
  if (!key || posts.length === 0) return null;
  try {
    const json = await requestJson(DECISIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildJevRequest(modelLabel, posts)),
    });
    return applyJevAnswers(json, posts);
  } catch (err) {
    unstable_rethrow(err);
    console.error("x posts: sentiment unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchPanel(model: { id: string; name: string }): Promise<XPanelResult> {
  const found = await searchLadder(model);
  const selected = selectPosts(found, Date.now() / 1000, SEND_COUNT);
  const scored = await scoreWithJev(`${model.name} (${model.id})`, selected);
  if (!scored) {
    // Unscored panels live 1h; skip the paid lookups for them.
    return buildResult(selected.map((p) => ({ ...p, sentiment: null })), false, Date.now());
  }
  const shown = scored.slice(0, SHOW_COUNT);
  const lookups = await Promise.all(shown.map((p) => lookupPost(p.id)));
  const withLookups = [...shown.map((p, i) => applyLookup(p, lookups[i])), ...scored.slice(SHOW_COUNT)];
  return buildResult(withLookups, true, Date.now());
}

export function panelTtl(r: Pick<XPanelResult, "posts" | "scored">): number {
  return r.posts.length > 0 && !r.scored ? SHORT_TTL_S : TTL_S;
}

/** Seconds a panel has left by the TTL rules, given when it was fetched. */
export function remainingTtl(r: XPanelResult, nowMs = Date.now()): number {
  return Math.floor(panelTtl(r) - (nowMs - r.fetchedAt) / 1000);
}

export function isFresh(r: XPanelResult, nowMs = Date.now()): boolean {
  return remainingTtl(r, nowMs) > 0;
}

const cacheKey = (modelId: string) => `x-posts:${CACHE_VERSION}:${modelId}`;

// Per-isolate memory in front of the colo cache (also the only cache in local dev).
const memory = new Map<string, XPanelResult>();

export function resetXPostsMemoryCache() {
  memory.clear();
  inFlight.clear();
}

function remember(modelId: string, data: XPanelResult) {
  memory.set(cacheKey(modelId), data);
}

function fromMemory(modelId: string): XPanelResult | null {
  const hit = memory.get(cacheKey(modelId));
  return hit && isFresh(hit) ? hit : null;
}

export type XPanelLoad = ({ ok: true } & XPanelResult) | { ok: false; error: string };

/** Edge TTL is what is left of the panel's own TTL, so a stored row is not kept past it. */
const edgeTtl = (r: XPanelResult) => Math.max(60, remainingTtl(r));

/**
 * A model's panel: memory, then the colo cache, then a fresh D1 row, then a
 * live search and score that is stored back to D1. Never throws; failures
 * are not cached anywhere.
 */
export async function loadXPosts(model: { id: string; name: string }): Promise<XPanelLoad> {
  const hit = fromMemory(model.id);
  if (hit) return { ok: true, ...hit };
  try {
    const data = await cachedJson(cacheKey(model.id), edgeTtl, async () => {
      const stored = await readStoredPanel(model.id);
      if (stored && isFresh(stored)) return stored;
      const live = await fetchPanel(model);
      await writeStoredPanel(model.id, live);
      return live;
    });
    remember(model.id, data);
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error(`x posts: search failed for ${model.id}:`, error);
    return { ok: false, error };
  }
}

class CacheMiss extends Error {}

/** The colo cache entry for a model, without loading anything on a miss. */
async function peekEdge(modelId: string): Promise<XPanelResult | null> {
  try {
    return await cachedJson<XPanelResult>(cacheKey(modelId), 60, async () => {
      throw new CacheMiss();
    });
  } catch (err) {
    if (!(err instanceof CacheMiss)) unstable_rethrow(err);
    return null;
  }
}

export interface PeekedPanel {
  panel: XPanelResult;
  /** false for a D1 row past its TTL, shown until a refresh replaces it */
  fresh: boolean;
}

/**
 * Stored panels for many models from memory, the colo cache and D1 only.
 * Never searches or scores. D1 rows past their TTL are returned with
 * `fresh: false` (up to a week old); missing models are left out.
 *
 * `edge: false` skips the colo cache, which is one lookup per model; for a
 * long list (the home table) one batched D1 query is cheaper.
 */
export async function peekPanels(
  modelIds: string[],
  { edge: useEdge = true }: { edge?: boolean } = {}
): Promise<Map<string, PeekedPanel>> {
  const out = new Map<string, PeekedPanel>();
  const ids = [...new Set(modelIds)];
  const edge = await Promise.all(
    ids.map(async (id) => [id, fromMemory(id) ?? (useEdge ? await peekEdge(id) : null)] as const)
  );
  const rest: string[] = [];
  for (const [id, panel] of edge) {
    if (panel && isFresh(panel)) {
      remember(id, panel);
      out.set(id, { panel, fresh: true });
    } else rest.push(id);
  }
  if (rest.length === 0) return out;
  const stored = await readStoredPanels(rest);
  const now = Date.now();
  for (const [id, panel] of stored) {
    if (now - panel.fetchedAt > PEEK_MAX_AGE_MS) continue;
    const fresh = isFresh(panel, now);
    if (fresh) remember(id, panel);
    out.set(id, { panel, fresh });
  }
  return out;
}

/**
 * Sentiment from a stored panel only (memory, colo cache, D1); never searches.
 * null when there is no stored scored panel with labeled posts.
 */
export async function getCachedSentiment(
  modelId: string
): Promise<{ positivePct: number; neutralPct: number; negativePct: number; n: number } | null> {
  const peeked = (await peekPanels([modelId])).get(modelId);
  if (!peeked?.panel.scored) return null;
  return sentimentSummary(peeked.panel.counts);
}

// Models being refreshed by this isolate, so overlapping requests do not search twice.
const inFlight = new Set<string>();

/**
 * Load panels for models in the background, `concurrency` at a time, at
 * most `max` per call. Meant for `after()`: it never throws.
 */
export async function fillPanels(
  models: Array<{ id: string; name: string }>,
  { concurrency = 2, max = 4 }: { concurrency?: number; max?: number } = {}
): Promise<void> {
  const queue = models.filter((m) => !inFlight.has(m.id)).slice(0, max);
  for (const m of queue) inFlight.add(m.id);
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      try {
        await loadXPosts(m);
      } finally {
        inFlight.delete(m.id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
