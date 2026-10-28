import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cachedJson } from "./edgeCache";
import { buildMatchIndex } from "./modelMatch";
import { loadMatchCandidates } from "./openrouterCatalog";
import {
  ARENA_CATEGORIES,
  bestRatings,
  buildArenaSnapshot,
  parseArenaPage,
  type ArenaCategory,
  type ArenaEntry,
  type ArenaRatings,
  type ArenaRow,
  type ArenaSnapshot,
} from "./arena";

const DATASET = "lmarena-ai/leaderboard-dataset";
const API = "https://datasets-server.huggingface.co";
const PAGE = 100;
const MAX_PAGES = 12;
const CACHE_KEY = "arena-v1";
const TTL_S = 12 * 60 * 60;
/** Shorter TTL when some (not all) categories failed to load. */
const PARTIAL_TTL_S = 60 * 60;

export function arenaRowsUrl(config: string, offset: number): string {
  return `${API}/rows?dataset=${encodeURIComponent(DATASET)}&config=${config}&split=latest&offset=${offset}&length=${PAGE}`;
}

export function arenaFilterUrl(config: string, offset: number): string {
  const where = encodeURIComponent(`"category"='overall'`);
  return `${API}/filter?dataset=${encodeURIComponent(DATASET)}&config=${config}&split=latest&where=${where}&offset=${offset}&length=${PAGE}`;
}

/** datasets-server fails transiently now and then, so each page gets one retry. */
async function getPage(url: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return parseArenaPage(await res.json());
    } catch (err) {
      unstable_rethrow(err);
      last = err;
    }
  }
  throw last;
}

/**
 * The latest split lists the "overall" rows first, ranked. Page /rows until the
 * overall block ends; if that ordering ever changes and the first page has no
 * overall rows, fall back to /filter.
 */
export async function fetchArenaCategory(config: ArenaCategory): Promise<ArenaRow[]> {
  const out: ArenaRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { rows, total } = await getPage(arenaRowsUrl(config, page * PAGE));
    const overall = rows.filter((r) => r.category === "overall");
    out.push(...overall);
    const ended = overall.length < rows.length || rows.length < PAGE;
    if (ended || (total != null && (page + 1) * PAGE >= total)) break;
  }
  if (out.length > 0) return out;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { rows, total } = await getPage(arenaFilterUrl(config, page * PAGE));
    out.push(...rows.filter((r) => r.category === "overall"));
    if (rows.length < PAGE || (total != null && (page + 1) * PAGE >= total)) break;
  }
  if (out.length === 0) throw new Error(`arena ${config}: no overall rows`);
  return out;
}

interface CachedArena extends ArenaSnapshot {
  partial: boolean;
}

async function fetchArena(): Promise<CachedArena> {
  const [catalog, ...results] = await Promise.all([
    loadMatchCandidates(),
    ...ARENA_CATEGORIES.map((c) =>
      fetchArenaCategory(c).then(
        (rows) => ({ ok: true as const, rows }),
        (err: unknown) => {
          unstable_rethrow(err);
          console.error(`arena: ${c} unavailable:`, err instanceof Error ? err.message : err);
          return { ok: false as const };
        }
      )
    ),
  ]);
  const byCategory: Partial<Record<ArenaCategory, ArenaRow[]>> = {};
  ARENA_CATEGORIES.forEach((c, i) => {
    const r = results[i];
    if (r.ok) byCategory[c] = r.rows;
  });
  // Text is the main leaderboard; without it the result is not worth caching.
  if (!byCategory.text) throw new Error("arena text leaderboard unavailable");
  const snap = buildArenaSnapshot(byCategory, buildMatchIndex(catalog));
  return { ...snap, partial: results.some((r) => !r.ok) };
}

let memory: { data: CachedArena; ts: number } | null = null;

export function resetArenaMemoryCache() {
  memory = null;
}

export type ArenaLoad = ({ ok: true } & CachedArena) | { ok: false; error: string };

/** Load and match the latest LMArena leaderboards. Never throws. */
export async function loadArena(): Promise<ArenaLoad> {
  if (memory) {
    const ttl = (memory.data.partial ? PARTIAL_TTL_S : TTL_S) * 1000;
    if (Date.now() - memory.ts < ttl) return { ok: true, ...memory.data };
  }
  try {
    const data = await cachedJson(CACHE_KEY, (d: CachedArena) => (d.partial ? PARTIAL_TTL_S : TTL_S), fetchArena);
    memory = { data, ts: Date.now() };
    return { ok: true, ...data };
  } catch (err) {
    unstable_rethrow(err);
    const error = err instanceof Error ? err.message : String(err);
    console.error("arena: data unavailable:", error);
    return { ok: false, error };
  }
}

/** LMArena entries for one OpenRouter id; empty when unknown or unavailable. */
export async function getArenaForModel(id: string): Promise<{ entries: ArenaEntry[]; dates: ArenaSnapshot["dates"] }> {
  const res = await loadArena();
  if (!res.ok) return { entries: [], dates: {} };
  return { entries: res.byModel[id] ?? [], dates: res.dates };
}

/**
 * Best LMArena rating per category for every matched OpenRouter id. When a
 * model has several arena rows (modes such as thinking on/off), the highest
 * rating is used. Empty map when the data is unavailable.
 */
export async function getArenaRatings(): Promise<Map<string, ArenaRatings>> {
  const res = await loadArena();
  const out = new Map<string, ArenaRatings>();
  if (!res.ok) return out;
  for (const [id, entries] of Object.entries(res.byModel)) out.set(id, bestRatings(entries));
  return out;
}
