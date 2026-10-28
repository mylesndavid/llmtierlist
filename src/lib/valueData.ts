import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import { aggregateRows, isEligible, type BenchModel, type BenchRow } from "./value";

/**
 * OpenRouter's daily benchmark-leaderboard export (CC BY 4.0, no auth).
 * The manifest points at the dated JSON file for the latest snapshot.
 */
export const MANIFEST_URL =
  "https://openrouter.ai/api/v1/datasets/exports/benchmark-leaderboard/latest.manifest.json";

const CACHE_KEY = "value-benchmarks-v1";
const TTL_S = 6 * 60 * 60;

export interface BenchmarkSnapshot {
  snapshotDate: string;
  retrievedAt: string | null;
  /** models with results on both benchmarks */
  models: BenchModel[];
}

export type BenchmarkLoad =
  | ({ ok: true } & BenchmarkSnapshot)
  | { ok: false; error: string };

interface Manifest {
  files?: { json?: { url?: string } };
}

interface Export {
  snapshot_date?: string;
  retrieved_at?: string;
  rows?: BenchRow[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: TTL_S },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

async function fetchSnapshot(): Promise<BenchmarkSnapshot> {
  const manifest = await getJson<Manifest>(MANIFEST_URL);
  const url = manifest.files?.json?.url;
  if (!url) throw new Error("manifest has no files.json.url");
  const data = await getJson<Export>(url);
  if (!Array.isArray(data.rows) || !data.snapshot_date) {
    throw new Error("benchmark export is missing rows or snapshot_date");
  }
  const models = aggregateRows(data.rows).filter(isEligible);
  if (models.length === 0) throw new Error("benchmark export has no models with both benchmarks");
  return {
    snapshotDate: data.snapshot_date,
    retrievedAt: data.retrieved_at ?? null,
    models,
  };
}

// Per-isolate memory first, then the colo-wide cache (which only stores
// successful loads, since a failed load throws before it is written).
let memory: { data: BenchmarkSnapshot; ts: number } | null = null;

export function resetBenchmarkMemoryCache() {
  memory = null;
}

/** Load and aggregate the latest snapshot. Never throws. */
export async function loadBenchmarks(): Promise<BenchmarkLoad> {
  if (memory && Date.now() - memory.ts < TTL_S * 1000) return { ok: true, ...memory.data };
  try {
    const data = await cachedJson(CACHE_KEY, TTL_S, fetchSnapshot);
    memory = { data, ts: Date.now() };
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err); // let Next's own control-flow errors through
    const error = err instanceof Error ? err.message : String(err);
    console.error("value tier list: benchmark data unavailable:", error);
    return { ok: false, error };
  }
}
