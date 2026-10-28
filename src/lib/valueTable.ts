import { DEFAULT_TIERS } from "./types";
import type { BenchmarkKey, ScoredModel, ValueModel } from "./value";

/**
 * Pure helpers for the all-models table on the home page: filtering,
 * sorting and pagination. No React, no I/O.
 */

export type ValueRow = ScoredModel<ValueModel>;

export type SortKey =
  | "rank"
  | "tier"
  | "name"
  | "score"
  | "quality"
  | "gpqa"
  | "tau"
  | "cost"
  | "time"
  | "usage"
  | "sentiment"
  | "arena"
  | "status";

export interface SortState {
  key: SortKey;
  asc: boolean;
}

export const DEFAULT_SORT: SortState = { key: "rank", asc: true };

/** Cost/task threshold for the "cheap" chip, in USD. */
export const CHEAP_COST = 0.02;

export const PAGE_SIZE = 25;

export interface TableFilters {
  query: string;
  openWeights: boolean;
  cheap: boolean;
  fast: boolean;
  frontierOnly: boolean;
  /** vendorSlug, or "" for every lab */
  lab: string;
}

export const EMPTY_FILTERS: TableFilters = {
  query: "",
  openWeights: false,
  cheap: false,
  fast: false,
  frontierOnly: false,
  lab: "",
};

export function hasActiveFilters(f: TableFilters): boolean {
  return (
    f.query.trim() !== "" || f.openWeights || f.cheap || f.fast || f.frontierOnly || f.lab !== ""
  );
}

/** Lower-case, accent-free text for matching. */
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True when every whitespace-separated term appears in the name, vendor or id. */
export function matchesQuery(m: Pick<ValueModel, "name" | "vendor" | "id">, query: string): boolean {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = norm(`${m.name} ${m.vendor} ${m.id}`);
  return terms.every((t) => hay.includes(t));
}

/**
 * Apply the table filters. "Fast" means time per task below `medianTimeS`;
 * with no median, or for models without time data, it excludes them.
 */
export function filterRows<R extends ValueRow>(
  rows: R[],
  f: TableFilters,
  medianTimeS: number | null
): R[] {
  return rows.filter((r) => {
    if (!matchesQuery(r.model, f.query)) return false;
    if (f.openWeights && r.model.openWeights !== true) return false;
    if (f.cheap && !(r.cost != null && r.cost < CHEAP_COST)) return false;
    if (f.fast && !(r.timeS != null && medianTimeS != null && r.timeS < medianTimeS)) return false;
    if (f.frontierOnly && !r.frontier) return false;
    if (f.lab && r.model.vendorSlug !== f.lab) return false;
    return true;
  });
}

export interface LabOption {
  slug: string;
  name: string;
  count: number;
}

/** Labs present in the rows, most models first, then by name. */
export function labOptions(rows: ValueRow[]): LabOption[] {
  const by = new Map<string, LabOption>();
  for (const r of rows) {
    const slug = r.model.vendorSlug;
    if (!slug) continue;
    const cur = by.get(slug);
    if (cur) cur.count++;
    else by.set(slug, { slug, name: r.model.vendor || slug, count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const TIER_INDEX = new Map(DEFAULT_TIERS.map((t, i) => [t.key, i]));

const acc = (r: ValueRow, k: BenchmarkKey) => r.model.metrics[k]?.accuracy ?? null;

export const SORT_VALUE: Record<SortKey, (r: ValueRow) => number | string | null> = {
  rank: (r) => r.rank,
  tier: (r) => TIER_INDEX.get(r.tier) ?? DEFAULT_TIERS.length,
  name: (r) => r.model.name.toLowerCase(),
  score: (r) => r.score,
  quality: (r) => r.quality,
  gpqa: (r) => acc(r, "gpqa_diamond"),
  tau: (r) => acc(r, "tau_bench_verified_airline"),
  cost: (r) => r.cost,
  time: (r) => r.timeS,
  usage: (r) => r.model.usage?.rank ?? null,
  sentiment: (r) => r.model.sentiment?.positivePct ?? null,
  arena: (r) => r.model.arena ?? null,
  status: (r) => (r.frontier ? 0 : r.dominatedBy ? 1 : 2),
};

/** Lower-is-better columns sort ascending first; everything else descending. */
export const ASC_FIRST = new Set<SortKey>(["rank", "tier", "name", "cost", "time", "usage", "status"]);

/** Clicking a column: flip direction if it is already the sort, else start in its natural direction. */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, asc: !cur.asc } : { key, asc: ASC_FIRST.has(key) };
}

/** Sort a copy of the rows. Missing values always sink to the bottom; ties fall back to rank. */
export function sortRows<R extends ValueRow>(rows: R[], sort: SortState): R[] {
  const get = SORT_VALUE[sort.key];
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return a.rank - b.rank;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return (sort.asc ? cmp : -cmp) || a.rank - b.rank;
  });
}

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to the valid range */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first item shown; 0 when empty */
  from: number;
  /** 1-based index of the last item shown; 0 when empty */
  to: number;
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: p,
    pageCount,
    total,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
  };
}

/**
 * Page numbers to show in the pager: first, last, and a window around the
 * current page, with null marking a gap. e.g. [1, null, 4, 5, 6, null, 10].
 */
export function pageList(page: number, pageCount: number, around = 1): Array<number | null> {
  const keep = new Set<number>([1, pageCount]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pageCount) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev === 2) out.push(p - 1);
    else if (typeof prev === "number" && p - prev > 2) out.push(null);
    out.push(p);
  }
  return out;
}
