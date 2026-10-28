import "server-only";
import { cachedJson } from "./edgeCache";
import type { MatchCandidate } from "./modelMatch";

/**
 * OpenRouter's public model list, used as the set of ids that outside sources
 * are matched against. D1's catalog is synced from the same list.
 */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "openrouter-catalog-v1";
const TTL_S = 12 * 60 * 60;

async function fetchCatalog(): Promise<MatchCandidate[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${OPENROUTER_MODELS_URL} returned ${res.status}`);
  const body = (await res.json()) as { data?: { id?: unknown; name?: unknown }[] };
  if (!Array.isArray(body.data)) throw new Error("OpenRouter model list has no data");
  const out: MatchCandidate[] = [];
  for (const m of body.data) {
    if (typeof m.id !== "string") continue;
    out.push({ id: m.id, name: typeof m.name === "string" ? m.name : undefined });
  }
  if (out.length === 0) throw new Error("OpenRouter model list is empty");
  return out;
}

let memory: { data: MatchCandidate[]; ts: number } | null = null;

export function resetCatalogMemoryCache() {
  memory = null;
}

/** The OpenRouter catalog as match candidates. Throws on failure; callers catch. */
export async function loadCatalog(): Promise<MatchCandidate[]> {
  if (memory && Date.now() - memory.ts < TTL_S * 1000) return memory.data;
  const data = await cachedJson(CACHE_KEY, TTL_S, fetchCatalog);
  memory = { data, ts: Date.now() };
  return data;
}
