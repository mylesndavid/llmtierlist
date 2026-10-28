import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import { endpointsUrl, parseEndpoints, PROVIDER_STATS_ENABLED, type ProviderStat } from "./providers";

const TTL_S = 6 * 60 * 60;
/** OpenRouter has no endpoints for this id; check again sooner. */
const EMPTY_TTL_S = 60 * 60;

export interface ProviderSnapshot {
  providers: ProviderStat[];
  fetchedAt: string;
}

async function fetchProviders(url: string): Promise<ProviderSnapshot> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const fetchedAt = new Date().toISOString();
  if (res.status === 404) return { providers: [], fetchedAt };
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return { providers: parseEndpoints(await res.json()), fetchedAt };
}

const memory = new Map<string, { data: ProviderSnapshot; ts: number }>();

export function resetProviderMemoryCache() {
  memory.clear();
}

/**
 * Per-provider stats for one OpenRouter id. Returns null when the section is
 * switched off or the data could not be loaded. Never throws.
 */
export async function loadProviders(modelId: string): Promise<ProviderSnapshot | null> {
  if (!PROVIDER_STATS_ENABLED) return null;
  const url = endpointsUrl(modelId);
  if (!url) return null;
  const hit = memory.get(modelId);
  if (hit && Date.now() - hit.ts < (hit.data.providers.length ? TTL_S : EMPTY_TTL_S) * 1000) return hit.data;
  try {
    const data = await cachedJson(
      `providers-v1:${modelId}`,
      (d: ProviderSnapshot) => (d.providers.length ? TTL_S : EMPTY_TTL_S),
      () => fetchProviders(url)
    );
    if (memory.size > 500) memory.clear();
    memory.set(modelId, { data, ts: Date.now() });
    return data;
  } catch (err) {
    unstable_rethrow(err);
    console.error(`providers: ${modelId} unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}
