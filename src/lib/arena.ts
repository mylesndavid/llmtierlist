import { matchAll, type MatchIndex } from "./modelMatch";

/**
 * LMArena leaderboard dataset (lmarena-ai/leaderboard-dataset on Hugging
 * Face, CC BY 4.0), read through the datasets-server JSON API.
 */
export const ARENA_CREDIT =
  "Human preference ratings: LMArena (lmarena-ai/leaderboard-dataset), CC BY 4.0";
export const ARENA_DATASET_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";

/** Dataset configs shown on model pages, in display order. */
export const ARENA_CATEGORIES = ["text", "webdev", "vision", "search"] as const;
export type ArenaCategory = (typeof ARENA_CATEGORIES)[number];

export const ARENA_CATEGORY_LABEL: Record<ArenaCategory, string> = {
  text: "Text",
  webdev: "WebDev",
  vision: "Vision",
  search: "Search",
};

/** One row of the dataset as datasets-server returns it. */
export interface ArenaRow {
  model_name: string;
  organization: string | null;
  license?: string | null;
  rating: number;
  rating_lower: number | null;
  rating_upper: number | null;
  variance?: number | null;
  vote_count: number | null;
  rank: number | null;
  category: string;
  leaderboard_publish_date: string | null;
}

export interface ArenaEntry {
  category: ArenaCategory;
  /** the name LMArena uses, which may carry a mode such as "(Thinking)" */
  name: string;
  rating: number;
  ratingLower: number | null;
  ratingUpper: number | null;
  rank: number | null;
  votes: number | null;
  date: string | null;
}

export type ArenaRatings = Partial<Record<ArenaCategory, number>>;

export interface ArenaPage {
  rows: ArenaRow[];
  total: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Parse one datasets-server /rows or /filter response. Throws on an error payload. */
export function parseArenaPage(json: unknown): ArenaPage {
  const d = json as { error?: string; rows?: { row?: Record<string, unknown> }[]; num_rows_total?: number };
  if (!d || typeof d !== "object") throw new Error("arena page is not an object");
  if (d.error) throw new Error(`datasets-server: ${d.error}`);
  if (!Array.isArray(d.rows)) throw new Error("arena page has no rows");
  const rows: ArenaRow[] = [];
  for (const r of d.rows) {
    const x = r?.row;
    if (!x || typeof x.model_name !== "string" || typeof x.category !== "string") continue;
    const rating = num(x.rating);
    if (rating == null) continue;
    rows.push({
      model_name: x.model_name,
      organization: typeof x.organization === "string" ? x.organization : null,
      license: typeof x.license === "string" ? x.license : null,
      rating,
      rating_lower: num(x.rating_lower),
      rating_upper: num(x.rating_upper),
      variance: num(x.variance),
      vote_count: num(x.vote_count),
      rank: num(x.rank),
      category: x.category,
      leaderboard_publish_date:
        typeof x.leaderboard_publish_date === "string" ? x.leaderboard_publish_date.slice(0, 10) : null,
    });
  }
  return { rows, total: num(d.num_rows_total) };
}

export interface ArenaSnapshot {
  /** publish date per category from the latest split */
  dates: Partial<Record<ArenaCategory, string>>;
  /** OpenRouter id -> entries, best rating first within each category */
  byModel: Record<string, ArenaEntry[]>;
  /** rows and matches per category, for reporting */
  coverage: Partial<Record<ArenaCategory, { rows: number; matched: number; unmatched: string[] }>>;
}

/** Match each category's "overall" rows to OpenRouter ids. */
export function buildArenaSnapshot(
  byCategory: Partial<Record<ArenaCategory, ArenaRow[]>>,
  index: MatchIndex
): ArenaSnapshot {
  const snap: ArenaSnapshot = { dates: {}, byModel: {}, coverage: {} };
  for (const category of ARENA_CATEGORIES) {
    const rows = (byCategory[category] ?? []).filter((r) => r.category === "overall");
    if (rows.length === 0) continue;
    const date = rows.find((r) => r.leaderboard_publish_date)?.leaderboard_publish_date;
    if (date) snap.dates[category] = date;
    const report = matchAll(rows, (r) => r.model_name, (r) => r.organization, index);
    for (const { item, id } of report.matched) {
      (snap.byModel[id] ??= []).push({
        category,
        name: item.model_name,
        rating: item.rating,
        ratingLower: item.rating_lower,
        ratingUpper: item.rating_upper,
        rank: item.rank,
        votes: item.vote_count,
        date: item.leaderboard_publish_date,
      });
    }
    snap.coverage[category] = {
      rows: rows.length,
      matched: report.matched.length,
      unmatched: report.unmatched.map((u) => u.item.model_name),
    };
  }
  const order = new Map(ARENA_CATEGORIES.map((c, i) => [c, i]));
  for (const entries of Object.values(snap.byModel)) {
    entries.sort((a, b) => order.get(a.category)! - order.get(b.category)! || b.rating - a.rating);
  }
  return snap;
}

/** Best rating per category, for one model's entries. */
export function bestRatings(entries: ArenaEntry[]): ArenaRatings {
  const out: ArenaRatings = {};
  for (const e of entries) {
    const cur = out[e.category];
    if (cur == null || e.rating > cur) out[e.category] = e.rating;
  }
  return out;
}

/** Half-width of the confidence interval, when the row has both bounds. */
export function ciHalfWidth(e: Pick<ArenaEntry, "ratingLower" | "ratingUpper">): number | null {
  if (e.ratingLower == null || e.ratingUpper == null) return null;
  return (e.ratingUpper - e.ratingLower) / 2;
}
