import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import type { MatchCandidate } from "./modelMatch";
import { dedupeListings, isoDay, perMillion, slugify, splitDisplayName, type ORModel } from "./newReleases";
import type { ModelWithStats } from "./types";

/**
 * OpenRouter's public model list (no auth). D1's catalog is synced from the
 * same list. One fetch and one cache entry serve every use: /new and the
 * D1-less catalog fallback read the trimmed models, and the outside-source
 * matchers (Arena, Epoch) read them as match candidates.
 */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const CACHE_KEY = "openrouter-models-v2";
const TTL_S = 6 * 60 * 60;

export type ORModelsLoad = { ok: true; models: ORModel[] } | { ok: false; error: string };

/** Keep only the fields we use, so the cached payload stays small. */
function trim(m: ORModel): ORModel {
  return {
    id: m.id,
    name: m.name,
    created: m.created,
    context_length: m.context_length ?? null,
    hugging_face_id: m.hugging_face_id ?? null,
    description: (m.description ?? "").slice(0, 600),
    pricing: { prompt: m.pricing?.prompt ?? null, completion: m.pricing?.completion ?? null },
    architecture: {
      input_modalities: m.architecture?.input_modalities ?? [],
      output_modalities: m.architecture?.output_modalities ?? [],
    },
  };
}

async function fetchModels(): Promise<ORModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: TTL_S },
  });
  if (!res.ok) throw new Error(`${OPENROUTER_MODELS_URL} returned ${res.status}`);
  const body = (await res.json()) as { data?: ORModel[] };
  if (!Array.isArray(body.data)) throw new Error("OpenRouter model list has no data");
  const models = body.data.filter((m) => m && typeof m.id === "string" && typeof m.name === "string").map(trim);
  if (models.length === 0) throw new Error("OpenRouter model list is empty");
  return models;
}

let memory: { data: ORModel[]; ts: number } | null = null;

export function resetCatalogMemoryCache() {
  memory = null;
}

/** The trimmed OpenRouter model list, cached 6h. Throws on failure. */
async function getModels(): Promise<ORModel[]> {
  if (memory && Date.now() - memory.ts < TTL_S * 1000) return memory.data;
  const data = await cachedJson(CACHE_KEY, TTL_S, fetchModels);
  memory = { data, ts: Date.now() };
  return data;
}

/** The OpenRouter model list, cached 6h. Never throws. */
export async function loadOpenRouterModels(): Promise<ORModelsLoad> {
  try {
    return { ok: true, models: await getModels() };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error("openrouter catalog unavailable:", error);
    return { ok: false, error };
  }
}

/**
 * The OpenRouter list as match candidates for outside sources. Throws on
 * failure; callers catch.
 */
export async function loadMatchCandidates(): Promise<MatchCandidate[]> {
  return (await getModels()).map((m) => ({ id: m.id, name: m.name }));
}

/**
 * A stand-in for the D1 catalog built from the OpenRouter list, used when D1
 * is unreachable (and in local dev without credentials). No vote or review
 * data; slugs follow the sync's rule so links still match the real catalog.
 */
export function catalogFromOpenRouter(models: ORModel[]): ModelWithStats[] {
  return dedupeListings(models).map((m) => {
    const vendorSlug = m.id.split("/")[0].replace(/^~/, "");
    const [prefix, name] = splitDisplayName(m.name);
    return {
      id: m.id,
      slug: slugify(m.id),
      name,
      vendor: prefix ?? vendorSlug,
      vendor_slug: vendorSlug,
      description: m.description ?? "",
      license: m.hugging_face_id ? "open-weights" : "proprietary",
      release_date: Number.isFinite(m.created) ? isoDay(m.created) : null,
      context_window: m.context_length ?? null,
      base_model_id: null,
      variant: null,
      price_in: perMillion(m.pricing?.prompt),
      price_out: perMillion(m.pricing?.completion),
      input_modalities: (m.architecture?.input_modalities ?? []).join(","),
      output_modalities: (m.architecture?.output_modalities ?? []).join(","),
      params_b: null,
      active_params_b: null,
      is_moe: 0,
      hf_id: m.hugging_face_id ?? null,
      experts: null,
      experts_active: null,
      stats: {
        model_id: m.id,
        upvotes: 0,
        downvotes: 0,
        net_score: 0,
        review_count: 0,
        avg_rating: null,
        placement_count: null,
        avg_tier_value: null,
      },
    };
  });
}
