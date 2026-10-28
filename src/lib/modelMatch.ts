/**
 * Map model names from outside sources (LMArena, Epoch AI) to OpenRouter ids
 * such as "anthropic/claude-opus-4.5".
 *
 * Matching runs in three passes and stops at the first one that finds exactly
 * one candidate:
 *   1. explicit alias table
 *   2. full key (name plus any date suffix)
 *   3. base key (dates dropped), only when the source name carries a date,
 *      so an undated name never lands on a dated snapshot
 * A pass that finds two or more candidates returns no match: the matcher never
 * picks between ambiguous candidates.
 */

export interface MatchCandidate {
  /** OpenRouter id, "vendor/model" */
  id: string;
  /** OpenRouter display name, e.g. "Anthropic: Claude Opus 4.5" */
  name?: string;
}

export type MatchResult =
  | { id: string; via: "alias" | "full" | "base" }
  | { id: null; reason: "none" | "ambiguous"; candidates?: string[] };

/**
 * Hand-checked names the key rules cannot resolve. Keys are lowercased source
 * names exactly as the source spells them (after trimming). Map to null to
 * mark a source name as deliberately unmatched.
 */
export const MATCH_ALIASES: Record<string, string | null> = {
  // LMArena
  "llama 4 maverick 17b 128e instruct": "meta-llama/llama-4-maverick",
  "llama 4 scout 17b 16e instruct": "meta-llama/llama-4-scout",
  "llama-4-maverick-17b-128e-instruct": "meta-llama/llama-4-maverick",
  "llama-4-scout-17b-16e-instruct": "meta-llama/llama-4-scout",
  "qwen3-235b-a22b-instruct (2507)": "qwen/qwen3-235b-a22b-2507",
  // Google ships these as previews; OpenRouter keeps the "-preview" id.
  "gemini 3 flash": "google/gemini-3-flash-preview",
  "gemini 3 flash (minimal)": "google/gemini-3-flash-preview",
  "gemini-3-flash-grounding": "google/gemini-3-flash-preview",
  "gemini-3.1-pro-grounding": "google/gemini-3.1-pro-preview",
  // Epoch AI
  "qwen3-235b-a22b-instruct-2507": "qwen/qwen3-235b-a22b-2507",
  "qwen3-235b-a22b-instruct (jul 2025)": "qwen/qwen3-235b-a22b-2507",
  "qwen3-coder-480b-a35b-instruct": "qwen/qwen3-coder",
  "llama 3.3 70b": "meta-llama/llama-3.3-70b-instruct",
  "mistral small 3.1": "mistralai/mistral-small-3.1-24b-instruct",
  "mistral-small-3.1-2503": "mistralai/mistral-small-3.1-24b-instruct",
  "mistral-small-3.2-2506": "mistralai/mistral-small-3.2-24b-instruct",
  "gemini 3.1 pro": "google/gemini-3.1-pro-preview",
};

/** Provider prefixes that differ between sources and OpenRouter. */
const VENDOR_ALIASES: Record<string, string> = {
  xai: "x-ai",
  "x-ai": "x-ai",
  moonshot: "moonshotai",
  moonshotai: "moonshotai",
  zai: "z-ai",
  "z-ai": "z-ai",
  "z.ai (zhipu ai)": "z-ai",
  zhipu: "z-ai",
  meta: "meta-llama",
  "meta ai": "meta-llama",
  "meta-llama": "meta-llama",
  alibaba: "qwen",
  qwen: "qwen",
  mistral: "mistralai",
  "mistral ai": "mistralai",
  mistralai: "mistralai",
  google: "google",
  "google deepmind": "google",
  openai: "openai",
  anthropic: "anthropic",
  deepseek: "deepseek",
  minimax: "minimax",
  xiaomi: "xiaomi",
  amazon: "amazon",
  nvidia: "nvidia",
  cohere: "cohere",
  microsoft: "microsoft",
  tencent: "tencent",
  stepfun: "stepfun",
  meituan: "meituan",
  ibm: "ibm-granite",
};

export function normalizeVendor(org: string | null | undefined): string | null {
  if (!org) return null;
  const first = org.split(",")[0].trim().toLowerCase();
  return VENDOR_ALIASES[first] ?? first.replace(/[^a-z0-9]+/g, "-");
}

/**
 * Trailing words stripped only on a second try: effort levels, and LMArena's
 * "-search"/"-grounding" suffix for a model run with web search. "max" is left
 * alone because it is part of real names such as "qwen3-max".
 */
const TRAILING_SETTINGS = new Set(["minimal", "low", "medium", "high", "xhigh", "search", "grounding"]);

const MONTHS = "(0[1-9]|1[0-2])";
const DATE_PATTERNS = [
  new RegExp(`^20\\d\\d${MONTHS}\\d\\d$`), // 20250805
  new RegExp(`^20\\d\\d-${MONTHS}-\\d\\d$`), // 2025-04-16
  new RegExp(`^${MONTHS}-20\\d\\d$`), // 09-2025
  new RegExp(`^${MONTHS}-\\d\\d$`), // 02-24
  new RegExp(`^${MONTHS}[0-3]\\d$`), // 0528 (mmdd)
  new RegExp(`^2[3-9]${MONTHS}$`), // 2507 (yymm)
];

const MONTH_NAMES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "Jul 2025", "Sept 2024", "October 2024" -> "2507" (yymm, OpenRouter's form) */
function monthYear(text: string): string | null {
  const m = text.trim().match(/^([a-z]{3,9})\.?\s+(20\d\d)$/);
  if (!m) return null;
  const mm = MONTH_NAMES[m[1].slice(0, 3)];
  return mm ? `${m[2].slice(2)}${mm}` : null;
}

function isDate(token: string): boolean {
  return DATE_PATTERNS.some((re) => re.test(token));
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface DateParts {
  y?: number;
  m: number;
  d?: number;
}

/** Every reading of a compact date token (4-digit tokens may be mmdd or yymm). */
function dateReadings(t: string): DateParts[] {
  const n = (a: number, b: number) => Number(t.slice(a, b));
  if (/^\d{8}$/.test(t)) return [{ y: n(0, 4), m: n(4, 6), d: n(6, 8) }];
  if (/^\d{6}$/.test(t)) return [{ m: n(0, 2), y: n(2, 6) }]; // mmyyyy
  if (/^\d{4}$/.test(t)) {
    const out: DateParts[] = [];
    if (n(0, 2) >= 1 && n(0, 2) <= 12) out.push({ m: n(0, 2), d: n(2, 4) });
    if (n(2, 4) >= 1 && n(2, 4) <= 12) out.push({ y: 2000 + n(0, 2), m: n(2, 4) });
    return out;
  }
  return [];
}

/** Two dates agree when no field both of them state differs. */
export function datesCompatible(a: string, b: string): boolean {
  for (const x of dateReadings(a)) {
    for (const y of dateReadings(b)) {
      if (x.m !== y.m) continue;
      if (x.y != null && y.y != null && x.y !== y.y) continue;
      if (x.d != null && y.d != null && x.d !== y.d) continue;
      return true;
    }
  }
  return false;
}

export interface NameKeys {
  /** date tokens found in the name, compact form */
  dates: string[];
  full: string;
  base: string;
  /** the same name with the date in other common forms (20261017 -> 1017) */
  alt: string[];
}

/**
 * Split a source name into keys. Parentheticals and "_effort" suffixes are
 * settings unless they look like a date; trailing date parts of the name are
 * moved into the date as well.
 */
export function nameKeys(raw: string, opts: { stripTrailingSetting?: boolean } = {}): NameKeys {
  let s = raw.trim().toLowerCase();
  // "Anthropic: Claude Opus 4.5" -> "claude opus 4.5"
  s = s.replace(/^[^:/()]+:\s+/, "");
  // "vendor/model" -> "model"
  if (/^[a-z0-9._-]+\/[^\s]+$/.test(s)) s = s.slice(s.indexOf("/") + 1);
  // OpenRouter variant suffixes such as ":free" or ":thinking"
  s = s.replace(/:[a-z0-9-]+$/, "");
  // Epoch effort suffix: "claude-opus-4-8_max"
  s = s.replace(/_[a-z0-9-]+$/, "");

  const dates: string[] = [];
  s = s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const my = monthYear(inner);
    if (my) {
      dates.push(my);
      return " ";
    }
    for (const part of inner.split(/[,\s]+/)) {
      const p = part.trim();
      if (p && isDate(p)) dates.push(p.replace(/-/g, ""));
    }
    return " ";
  });

  // Split on separators but keep "4.5"-style versions as one token for now.
  let tokens = s.split(/[\s_/-]+/).filter(Boolean);

  // trailing date parts: "...-2024-11-20", "...-20250219", "...-0528", "...-2507"
  const tail3 = tokens.slice(-3).join("-");
  const tail2 = tokens.slice(-2).join("-");
  if (tokens.length > 3 && isDate(tail3)) {
    dates.push(tail3.replace(/-/g, ""));
    tokens = tokens.slice(0, -3);
  } else if (tokens.length > 2 && isDate(tail2)) {
    dates.push(tail2.replace(/-/g, ""));
    tokens = tokens.slice(0, -2);
  } else if (tokens.length > 1 && isDate(tokens[tokens.length - 1])) {
    dates.push(tokens[tokens.length - 1]);
    tokens = tokens.slice(0, -1);
  }

  if (opts.stripTrailingSetting) {
    while (tokens.length > 1 && TRAILING_SETTINGS.has(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  }
  const base = slug(tokens.join("-"));
  const full = dates.length ? `${base}-${dates.join("-")}` : base;
  const alt: string[] = [];
  // yyyymmdd -> mmdd ("deepseek-v4.1-flash-20261017" vs "deepseek-v4.1-flash-1017")
  if (dates.length === 1 && /^20\d{6}$/.test(dates[0])) alt.push(`${base}-${dates[0].slice(4)}`);
  return { dates, full, base, alt };
}

export interface MatchIndex {
  aliases: Map<string, string | null>;
  full: Map<string, Set<string>>;
  base: Map<string, Set<string>>;
  vendorOf: Map<string, string>;
  /** date carried by each candidate's id, if any */
  dateOf: Map<string, string>;
}

function add(map: Map<string, Set<string>>, key: string, id: string) {
  if (!key) return;
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(id);
}

/** Build the lookup index from OpenRouter models. Variant ids ("x:free") are skipped. */
export function buildMatchIndex(
  candidates: MatchCandidate[],
  aliases: Record<string, string | null> = MATCH_ALIASES
): MatchIndex {
  const index: MatchIndex = {
    aliases: new Map(Object.entries(aliases).map(([k, v]) => [k.trim().toLowerCase(), v])),
    full: new Map(),
    base: new Map(),
    vendorOf: new Map(),
    dateOf: new Map(),
  };
  for (const c of candidates) {
    if (!c.id || c.id.includes(":") || !c.id.includes("/")) continue;
    index.vendorOf.set(c.id, c.id.slice(0, c.id.indexOf("/")));
    const idDates = nameKeys(c.id).dates;
    if (idDates.length === 1) index.dateOf.set(c.id, idDates[0]);
    for (const src of [c.id, c.name]) {
      if (!src) continue;
      const k = nameKeys(src);
      add(index.full, k.full, c.id);
      add(index.base, k.base, c.id);
    }
  }
  return index;
}

function pick(
  set: Set<string> | undefined,
  vendor: string | null,
  index: MatchIndex
): { id: string } | { ambiguous: string[] } | null {
  if (!set || set.size === 0) return null;
  const ids = [...set];
  if (ids.length === 1) return { id: ids[0] };
  if (vendor) {
    const same = ids.filter((id) => index.vendorOf.get(id) === vendor);
    if (same.length === 1) return { id: same[0] };
  }
  return { ambiguous: ids.sort() };
}

/**
 * Match one source model name. `org` is the source's organization field, used
 * only to break ties between candidates from different vendors.
 */
export function matchModel(name: string, org: string | null | undefined, index: MatchIndex): MatchResult {
  const lower = name.trim().toLowerCase();
  if (index.aliases.has(lower)) {
    const id = index.aliases.get(lower) ?? null;
    return id ? { id, via: "alias" } : { id: null, reason: "none" };
  }
  const vendor = normalizeVendor(org);

  for (const stripTrailingSetting of [false, true]) {
    const keys = nameKeys(name, { stripTrailingSetting });
    for (const key of [keys.full, ...keys.alt]) {
      const full = pick(index.full.get(key), vendor, index);
      if (full && "id" in full) return { id: full.id, via: "full" };
      if (full) return { id: null, reason: "ambiguous", candidates: full.ambiguous };
    }
    if (keys.full === keys.base) continue;
    // A dated candidate only counts when its date agrees with the source's.
    // An undated id that has dated siblings may point at any of those
    // snapshots, so it does not count either.
    const all = [...(index.base.get(keys.base) ?? [])];
    const hasDatedSibling = all.some((id) => index.dateOf.has(id));
    const pool = all.filter((id) => {
      const d = index.dateOf.get(id);
      if (!d) return !hasDatedSibling;
      return keys.dates.every((sd) => datesCompatible(sd, d));
    });
    if (pool.length === 0 && all.length > 0 && hasDatedSibling) {
      return { id: null, reason: "ambiguous", candidates: all.sort() };
    }
    const base = pick(new Set(pool), vendor, index);
    if (base && "id" in base) return { id: base.id, via: "base" };
    if (base) return { id: null, reason: "ambiguous", candidates: base.ambiguous };
  }
  return { id: null, reason: "none" };
}

export interface MatchReport<T> {
  matched: { item: T; id: string }[];
  unmatched: { item: T; reason: "none" | "ambiguous"; candidates?: string[] }[];
}

/** Match many items, keeping the unmatched ones for reporting. */
export function matchAll<T>(
  items: T[],
  nameOf: (t: T) => string,
  orgOf: (t: T) => string | null | undefined,
  index: MatchIndex
): MatchReport<T> {
  const report: MatchReport<T> = { matched: [], unmatched: [] };
  for (const item of items) {
    const r = matchModel(nameOf(item), orgOf(item), index);
    if (r.id !== null) report.matched.push({ item, id: r.id });
    else report.unmatched.push({ item, reason: r.reason, candidates: r.candidates });
  }
  return report;
}
