import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import {
  aggregateRows,
  isEligible,
  latestUsageRows,
  type BenchModel,
  type BenchRow,
  type UsageRow,
} from "./value";

/**
 * OpenRouter's daily benchmark-leaderboard export (CC BY 4.0, no auth).
 * The manifest points at the dated JSON file for the latest snapshot.
 */
export const MANIFEST_URL =
  "https://openrouter.ai/api/v1/datasets/exports/benchmark-leaderboard/latest.manifest.json";

// v2: metrics carry runs/tasks and the snapshot carries permaslugs.
const CACHE_KEY = "value-benchmarks-v2";
const TTL_S = 6 * 60 * 60;

export interface BenchmarkSnapshot {
  snapshotDate: string;
  retrievedAt: string | null;
  /** models with results on both benchmarks */
  models: BenchModel[];
  /** model_permaslug -> model_slug pairs from every row, for mapping usage data */
  permaslugs: Record<string, string>;
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
  const permaslugs: Record<string, string> = {};
  for (const r of data.rows) {
    if (r.model_permaslug && r.model_slug) permaslugs[r.model_permaslug] = r.model_slug;
  }
  return {
    snapshotDate: data.snapshot_date,
    retrievedAt: data.retrieved_at ?? null,
    models,
    permaslugs,
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

/**
 * OpenRouter's daily rankings export (CC BY 4.0, no auth): tokens per model
 * per day for the top models over the trailing 30 days.
 */
export const USAGE_MANIFEST_URL =
  "https://openrouter.ai/api/v1/datasets/exports/rankings-daily/latest.manifest.json";

const USAGE_CACHE_KEY = "value-usage-v1";

export interface UsageSnapshot {
  snapshotDate: string;
  /** rows from the latest 7 dates only */
  rows: UsageRow[];
}

export type UsageLoad = ({ ok: true } & UsageSnapshot) | { ok: false; error: string };

async function fetchUsage(): Promise<UsageSnapshot> {
  const manifest = await getJson<Manifest>(USAGE_MANIFEST_URL);
  const url = manifest.files?.json?.url;
  if (!url) throw new Error("usage manifest has no files.json.url");
  const data = await getJson<{ snapshot_date?: string; rows?: UsageRow[] }>(url);
  if (!Array.isArray(data.rows) || !data.snapshot_date) {
    throw new Error("usage export is missing rows or snapshot_date");
  }
  const rows = latestUsageRows(data.rows);
  if (rows.length === 0) throw new Error("usage export has no model rows");
  return { snapshotDate: data.snapshot_date, rows };
}

let usageMemory: { data: UsageSnapshot; ts: number } | null = null;

export function resetUsageMemoryCache() {
  usageMemory = null;
}

/** Load the latest 7 days of usage rankings. Never throws. */
export async function loadUsage(): Promise<UsageLoad> {
  if (usageMemory && Date.now() - usageMemory.ts < TTL_S * 1000) {
    return { ok: true, ...usageMemory.data };
  }
  try {
    const data = await cachedJson(USAGE_CACHE_KEY, TTL_S, fetchUsage);
    usageMemory = { data, ts: Date.now() };
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error("value tier list: usage data unavailable:", error);
    return { ok: false, error };
  }
}
