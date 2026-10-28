import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import { buildMatchIndex } from "./modelMatch";
import { loadMatchCandidates } from "./openrouterCatalog";
import {
  buildEpochSnapshot,
  EPOCH_ZIP_URL,
  readZipText,
  wantedEpochFile,
  type EpochScore,
  type EpochSnapshot,
} from "./epoch";

const CACHE_KEY = "epoch-v1";
const TTL_S = 12 * 60 * 60;

async function fetchEpoch(): Promise<EpochSnapshot> {
  const [catalog, res] = await Promise.all([
    loadMatchCandidates(),
    fetch(EPOCH_ZIP_URL, { headers: { Accept: "application/zip" } }),
  ]);
  if (!res.ok) throw new Error(`${EPOCH_ZIP_URL} returned ${res.status}`);
  const files = await readZipText(await res.arrayBuffer(), wantedEpochFile);
  const metadata = files.get("benchmark_metadata.csv");
  if (!metadata) throw new Error("Epoch archive has no benchmark_metadata.csv");
  const snap = buildEpochSnapshot(
    {
      metadata,
      files,
      eci: files.get("epoch_capabilities_index/eci_scores.csv"),
      modelMetadata: files.get("model_metadata.csv"),
    },
    buildMatchIndex(catalog)
  );
  if (Object.keys(snap.byModel).length === 0) throw new Error("Epoch data matched no models");
  return snap;
}

let memory: { data: EpochSnapshot; ts: number } | null = null;

export function resetEpochMemoryCache() {
  memory = null;
}

export type EpochLoad = ({ ok: true } & EpochSnapshot) | { ok: false; error: string };

/** Load Epoch's own benchmark runs, matched to OpenRouter ids. Never throws. */
export async function loadEpoch(): Promise<EpochLoad> {
  if (memory && Date.now() - memory.ts < TTL_S * 1000) return { ok: true, ...memory.data };
  try {
    const data = await cachedJson(CACHE_KEY, TTL_S, fetchEpoch);
    memory = { data, ts: Date.now() };
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error("epoch: data unavailable:", error);
    return { ok: false, error };
  }
}

/** Epoch scores for one OpenRouter id; empty when unknown or unavailable. */
export async function getEpochForModel(id: string): Promise<EpochScore[]> {
  const res = await loadEpoch();
  return res.ok ? (res.byModel[id] ?? []) : [];
}
