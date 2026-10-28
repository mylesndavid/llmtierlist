import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getModelsByIds } from "./data";
import { loadBenchmarks, loadUsage } from "./valueData";
import { rankUsage } from "./value";
import { peekPanels } from "./xPostsData";
import { d1Available } from "./xPanelStore";
import { rankScore, type ShownPost } from "./xPosts";

export const BUZZ_MODEL_COUNT = 30;
const MAX_ITEMS = 90;

export interface BuzzModel {
  id: string;
  name: string;
  /** catalog slug for /models/<slug>; null when the model is not in the catalog */
  slug: string | null;
  vendorSlug: string | null;
  usageRank: number;
}

export interface BuzzItem {
  modelId: string;
  post: ShownPost;
}

export interface BuzzData {
  models: BuzzModel[];
  items: BuzzItem[];
  /** models with no stored panel, or a stored panel past its TTL, to refresh in the background */
  toFill: BuzzModel[];
  /** models with nothing stored at all */
  missing: number;
}

function nameFromSlug(id: string): string {
  return id.slice(id.indexOf("/") + 1).replace(/-/g, " ");
}

/** The most-used models on OpenRouter over 7 days, with catalog names where the catalog has them. */
export async function topModels(count = BUZZ_MODEL_COUNT): Promise<BuzzModel[]> {
  const [bench, usage] = await Promise.all([loadBenchmarks(), loadUsage()]);
  if (!usage.ok) return [];
  const ranked = [...rankUsage(usage.rows, bench.ok ? bench.permaslugs : {})].slice(0, count);
  const benchNames = new Map(bench.ok ? bench.models.map((m) => [m.id, m]) : []);
  let catalog = new Map<string, { name: string; slug: string; vendor_slug: string }>();
  try {
    if (!d1Available()) throw new Error("D1 is not configured");
    const rows = await getModelsByIds(ranked.map(([id]) => id));
    catalog = new Map(rows.filter((m) => !m.is_custom).map((m) => [m.id, m]));
  } catch (err) {
    unstable_rethrow(err);
    // local dev without D1: fall back to benchmark names
    console.error("buzz: catalog unavailable:", err instanceof Error ? err.message : err);
  }
  return ranked.map(([id, stat]) => {
    const c = catalog.get(id);
    const b = benchNames.get(id);
    return {
      id,
      name: c?.name ?? b?.name ?? nameFromSlug(id),
      slug: c?.slug ?? null,
      vendorSlug: c?.vendor_slug ?? b?.vendorSlug ?? null,
      usageRank: stat.rank,
    };
  });
}

/**
 * Stored posts for the top models, best first by engagement weighted by
 * recency. Reads memory, the colo cache and D1 only; models without a fresh
 * panel are returned in `toFill` for the caller to refresh in the background.
 */
export async function loadBuzz(): Promise<BuzzData> {
  const models = await topModels();
  const panels = await peekPanels(models.map((m) => m.id));
  const nowS = Date.now() / 1000;
  const items: BuzzItem[] = [];
  const toFill: BuzzModel[] = [];
  let missing = 0;
  for (const m of models) {
    const peeked = panels.get(m.id);
    if (!peeked) missing++;
    if (!peeked?.fresh) toFill.push(m);
    for (const post of peeked?.panel.posts ?? []) items.push({ modelId: m.id, post });
  }
  // a post that names two models appears once, under the first (most-used) model
  const seen = new Set<string>();
  const unique = items.filter((it) => !seen.has(it.post.id) && seen.add(it.post.id));
  unique.sort((a, b) => rankScore(b.post, nowS) - rankScore(a.post, nowS));
  return { models, items: unique.slice(0, MAX_ITEMS), toFill, missing };
}
