/**
 * New-release tracking from OpenRouter's public model list. Pure functions
 * only (no I/O); the loader lives in openrouterCatalog.ts.
 */

/** The fields we use from https://openrouter.ai/api/v1/models. */
export interface ORModel {
  id: string;
  name: string;
  created: number; // unix seconds
  context_length?: number | null;
  hugging_face_id?: string | null;
  description?: string | null;
  pricing?: { prompt?: string | number | null; completion?: string | number | null } | null;
  architecture?: { input_modalities?: string[] | null; output_modalities?: string[] | null } | null;
}

/** "~vendor/x" mirrors and "…-latest" pointers, as scripts/sync-models.mjs skips them. */
export const ALIAS_RE = /(^~|-latest$|\/[a-z0-9.-]*-latest$)/i;

/**
 * True when a listing duplicates another model: a rolling alias, or a
 * ":variant" (":free", ":batch", ":thinking", …) whose bare id is also listed.
 * Matches how scripts/sync-models.mjs collapses them.
 */
export function isDuplicateListing(id: string, ids: Set<string>): boolean {
  if (ALIAS_RE.test(id)) return true;
  const colon = id.indexOf(":");
  return colon > 0 && ids.has(id.slice(0, colon));
}

export function dedupeListings<T extends { id: string }>(models: T[]): T[] {
  const ids = new Set(models.map((m) => m.id));
  const seen = new Set<string>();
  return models.filter((m) => {
    if (isDuplicateListing(m.id, ids)) return false;
    const slug = slugify(m.id);
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}

/** Same slug rule as scripts/sync-models.mjs. */
export function slugify(orId: string): string {
  return orId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Per-token price string to USD per 1M tokens; null for zero or missing, as the sync does. */
export function perMillion(raw: string | number | null | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000 * 1e5) / 1e5 : null;
}

/** "Anthropic: Claude Haiku 5.5" -> ["Anthropic", "Claude Haiku 5.5"] */
export function splitDisplayName(raw: string): [string | null, string] {
  const i = raw.indexOf(": ");
  return i > 0 ? [raw.slice(0, i), raw.slice(i + 2)] : [null, raw];
}

export function isoDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Catalog fields /new prefers over the OpenRouter listing when D1 has them. */
export interface ReleaseCatalogRef {
  slug: string;
  name: string;
  vendor: string;
  vendor_slug: string;
  release_date: string | null;
  license: "proprietary" | "open-weights";
  price_in: number | null;
  price_out: number | null;
  context_window: number | null;
}

export interface ReleaseValue {
  tier: string;
  quality: number;
  score: number;
}

export interface ReleaseEntry {
  id: string;
  /** catalog slug for /models/<slug>; null when the catalog does not list it */
  slug: string | null;
  name: string;
  vendor: string;
  vendorSlug: string;
  releaseDate: string; // YYYY-MM-DD
  priceIn: number | null;
  priceOut: number | null;
  context: number | null;
  inputModalities: string[];
  outputModalities: string[];
  openWeights: boolean;
  /** Balanced-preset value numbers; null when the model has no benchmark results yet */
  value: ReleaseValue | null;
}

export function toReleaseEntries(
  models: ORModel[],
  catalog: Map<string, ReleaseCatalogRef>,
  value: Map<string, ReleaseValue>
): ReleaseEntry[] {
  return dedupeListings(models).flatMap((m) => {
    if (!Number.isFinite(m.created)) return [];
    const c = catalog.get(m.id);
    const vendorSlug = m.id.split("/")[0].replace(/^~/, "");
    const [prefix, bare] = splitDisplayName(m.name);
    return [
      {
        id: m.id,
        slug: c?.slug ?? null,
        name: c?.name ?? bare,
        vendor: c?.vendor ?? prefix ?? vendorSlug,
        vendorSlug: c?.vendor_slug ?? vendorSlug,
        releaseDate: c?.release_date ?? isoDay(m.created),
        priceIn: c ? c.price_in : perMillion(m.pricing?.prompt),
        priceOut: c ? c.price_out : perMillion(m.pricing?.completion),
        context: c?.context_window ?? m.context_length ?? null,
        inputModalities: m.architecture?.input_modalities ?? [],
        outputModalities: m.architecture?.output_modalities ?? [],
        openWeights: c ? c.license === "open-weights" : !!m.hugging_face_id,
        value: value.get(m.id) ?? null,
      },
    ];
  });
}

const DAY_MS = 86_400_000;

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Entries released within the last `days` days of `now`, newest first. */
export function recentReleases(entries: ReleaseEntry[], now: Date, days = 30): ReleaseEntry[] {
  const today = dayMs(now.toISOString().slice(0, 10));
  const cutoff = today - (days - 1) * DAY_MS;
  return entries
    .filter((e) => {
      const t = dayMs(e.releaseDate);
      return Number.isFinite(t) && t >= cutoff && t <= today;
    })
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
}

/** Monday (UTC) of the week containing `day`, as YYYY-MM-DD. */
export function weekStart(day: string): string {
  const t = dayMs(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

export interface ReleaseWeek {
  start: string; // Monday, YYYY-MM-DD
  label: string;
  entries: ReleaseEntry[];
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Group entries by week (Monday start), newest week first, newest entry first. */
export function groupByWeek(entries: ReleaseEntry[], now: Date): ReleaseWeek[] {
  const thisWeek = weekStart(now.toISOString().slice(0, 10));
  const lastWeek = weekStart(new Date(dayMs(thisWeek) - DAY_MS).toISOString().slice(0, 10));
  const byWeek = new Map<string, ReleaseEntry[]>();
  for (const e of entries) {
    const w = weekStart(e.releaseDate);
    byWeek.set(w, [...(byWeek.get(w) ?? []), e]);
  }
  return [...byWeek]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([start, list]) => ({
      start,
      label:
        start === thisWeek ? "This week" : start === lastWeek ? "Last week" : `Week of ${shortDate(start)}`,
      entries: [...list].sort(
        (a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name)
      ),
    }));
}

export interface ReleaseFilters {
  lab?: string | null;
  open?: boolean;
  modality?: string | null;
}

export function filterReleases(entries: ReleaseEntry[], f: ReleaseFilters): ReleaseEntry[] {
  return entries.filter(
    (e) =>
      (!f.lab || e.vendorSlug === f.lab) &&
      (!f.open || e.openWeights) &&
      (!f.modality || e.inputModalities.includes(f.modality) || e.outputModalities.includes(f.modality))
  );
}

/** Labs present in `entries`, by name. */
export function labOptions(entries: ReleaseEntry[]): Array<{ slug: string; name: string; count: number }> {
  const labs = new Map<string, { slug: string; name: string; count: number }>();
  for (const e of entries) {
    const l = labs.get(e.vendorSlug);
    if (l) l.count++;
    else labs.set(e.vendorSlug, { slug: e.vendorSlug, name: e.vendor, count: 1 });
  }
  return [...labs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const MODALITY_ORDER = ["text", "image", "file", "audio", "video"];

export function modalityOptions(entries: ReleaseEntry[]): string[] {
  const all = new Set(entries.flatMap((e) => [...e.inputModalities, ...e.outputModalities]));
  return [...all].sort(
    (a, b) =>
      (MODALITY_ORDER.indexOf(a) + 1 || 99) - (MODALITY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b)
  );
}
