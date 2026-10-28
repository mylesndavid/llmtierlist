import { matchModel, type MatchIndex } from "./modelMatch";

/**
 * Epoch AI Benchmarking Hub (https://epoch.ai/benchmarks). Epoch's data is
 * CC BY; rows Epoch copies from outside sources keep their own licenses, so
 * only the benchmarks Epoch runs itself are used here, plus the Epoch
 * Capabilities Index.
 */
export const EPOCH_ZIP_URL = "https://epoch.ai/data/benchmark_data.zip";
export const EPOCH_CREDIT = "Benchmarks run by Epoch AI, CC BY";
export const EPOCH_HUB_URL = "https://epoch.ai/benchmarks";

// ---------------------------------------------------------------- zip

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read selected text files from a zip archive using the runtime's built-in
 * DecompressionStream (stored and deflate entries only, no zip64).
 */
export async function readZipText(
  buf: ArrayBuffer,
  wanted: (name: string) => boolean
): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: end of central directory not found");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const out = new Map<string, string>();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CEN_SIG) throw new Error("zip: bad central directory entry");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;

    if (view.getUint32(localOffset, true) !== LOC_SIG) throw new Error(`zip: bad local header for ${name}`);
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) out.set(name, decoder.decode(raw));
    else if (method === 8) out.set(name, decoder.decode(await inflateRaw(raw)));
    else throw new Error(`zip: unsupported compression ${method} for ${name}`);
  }
  return out;
}

// ---------------------------------------------------------------- csv

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function csvHeader(text: string): string[] {
  return parseCsv(text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "")[0] ?? [];
}

// ---------------------------------------------------------------- benchmarks

export interface EpochBenchmark {
  name: string;
  file: string;
  scoreColumn: string;
  scale: number;
}

/**
 * Benchmarks Epoch runs itself, from benchmark_metadata.csv. The dataset marks
 * copied results by naming their files "*_external.csv"; Epoch's own runs are
 * the other files, whose rows carry Epoch's run fields ("Log viewer",
 * "Started at"). Superseded benchmark versions are dropped.
 */
export function epochRunBenchmarks(
  metadataCsv: string,
  headers: Map<string, string[]>
): EpochBenchmark[] {
  const out: EpochBenchmark[] = [];
  for (const r of csvObjects(metadataCsv)) {
    const file = r.source_file;
    if (!file || /_external\.csv$/.test(file)) continue;
    if (r.superseded_by) continue;
    const header = headers.get(file);
    if (!header || !header.includes("Started at") || !header.includes("Log viewer")) continue;
    const scale = Number(r.scale);
    if (!r.score_column || !header.includes(r.score_column)) continue;
    out.push({ name: r.benchmark, file, scoreColumn: r.score_column, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 });
  }
  return out;
}

/** Epoch benchmark pages; anything not listed links to the hub. */
const BENCHMARK_PAGES: Record<string, string> = {
  "GPQA diamond": "gpqa-diamond",
  "SWE-Bench verified": "swe-bench-verified",
  "SimpleQA Verified": "simple-qa-verified",
  "EBR-bench": "ebr-bench",
  "FrontierMath-Tiers-1-3-v2-Private": "frontiermath",
  "FrontierMath-Tier-4-v2-Private": "frontiermath",
};

export function benchmarkUrl(name: string): string {
  const slug = BENCHMARK_PAGES[name];
  return slug ? `${EPOCH_HUB_URL}/${slug}` : EPOCH_HUB_URL;
}

/** Plain labels for Epoch's benchmark ids. */
const BENCHMARK_LABELS: Record<string, string> = {
  "GPQA diamond": "GPQA Diamond",
  "SWE-Bench verified": "SWE-bench Verified",
  "FrontierMath-Tiers-1-3-v2-Private": "FrontierMath Tiers 1-3",
  "FrontierMath-Tier-4-v2-Private": "FrontierMath Tier 4",
  "MATH level 5": "MATH Level 5",
};

export function benchmarkLabel(name: string): string {
  return BENCHMARK_LABELS[name] ?? name;
}

export const ECI_NAME = "Epoch Capabilities Index";

export interface EpochScore {
  benchmark: string;
  label: string;
  /** 0-1 fraction for benchmarks; index points for ECI */
  score: number;
  kind: "fraction" | "index";
  stderr: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  /** date Epoch ran the evaluation (or published the ECI), YYYY-MM-DD */
  date: string | null;
  url: string;
  logUrl: string | null;
  /** Epoch's model version string, e.g. "claude-opus-4-8_max" */
  version: string;
}

export interface EpochSnapshot {
  byModel: Record<string, EpochScore[]>;
  benchmarks: string[];
  coverage: Record<string, { rows: number; models: number; matchedModels: number; unmatched: string[] }>;
}

function numOrNull(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function day(s: string | undefined): string | null {
  const m = s?.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export interface EpochFiles {
  metadata: string;
  /** benchmark csv files by name */
  files: Map<string, string>;
  eci?: string;
  /** model_metadata.csv, used as a fallback name source */
  modelMetadata?: string;
}

/**
 * Turn the Epoch files into scores per OpenRouter id. For each benchmark the
 * best-scoring row per model is kept (a model is often run at several effort
 * settings).
 */
export function buildEpochSnapshot(input: EpochFiles, index: MatchIndex): EpochSnapshot {
  const headers = new Map([...input.files].map(([k, v]) => [k, csvHeader(v)]));
  const benchmarks = epochRunBenchmarks(input.metadata, headers);

  const altNames = new Map<string, string[]>();
  if (input.modelMetadata) {
    for (const r of csvObjects(input.modelMetadata)) {
      if (!r.model_version) continue;
      altNames.set(r.model_version, [r.display_name, r.model_group].filter(Boolean));
    }
  }
  const matchCache = new Map<string, string | null>();
  const resolve = (version: string, org: string): string | null => {
    const key = `${version}\u0000${org}`;
    if (matchCache.has(key)) return matchCache.get(key)!;
    let id: string | null = null;
    const first = matchModel(version, org, index);
    if (first.id !== null) id = first.id;
    else if (first.reason === "none") {
      for (const alt of altNames.get(version) ?? []) {
        const r = matchModel(alt, org, index);
        if (r.id !== null) {
          id = r.id;
          break;
        }
        if (r.reason === "ambiguous") break;
      }
    }
    matchCache.set(key, id);
    return id;
  };

  const snap: EpochSnapshot = { byModel: {}, benchmarks: [], coverage: {} };
  const best = new Map<string, EpochScore>();

  for (const b of benchmarks) {
    const text = input.files.get(b.file);
    if (!text) continue;
    snap.benchmarks.push(b.name);
    const rows = csvObjects(text);
    const versions = new Set<string>();
    const matchedVersions = new Set<string>();
    const unmatched = new Set<string>();
    for (const r of rows) {
      const version = r["Model version"];
      const raw = numOrNull(r[b.scoreColumn]);
      if (!version || raw == null) continue;
      versions.add(version);
      const id = resolve(version, r.Organization ?? "");
      if (!id) {
        unmatched.add(version);
        continue;
      }
      matchedVersions.add(version);
      const score: EpochScore = {
        benchmark: b.name,
        label: benchmarkLabel(b.name),
        score: raw * b.scale,
        kind: "fraction",
        stderr: numOrNull(r.stderr),
        ciLow: null,
        ciHigh: null,
        date: day(r["Started at"]) ?? day(r["Release date"]),
        url: benchmarkUrl(b.name),
        logUrl: /^https:\/\//.test(r["Log viewer"] ?? "") ? r["Log viewer"] : null,
        version,
      };
      const key = `${id}\u0000${b.name}`;
      const cur = best.get(key);
      if (!cur || score.score > cur.score) best.set(key, score);
    }
    snap.coverage[b.name] = {
      rows: rows.length,
      models: versions.size,
      matchedModels: matchedVersions.size,
      unmatched: [...unmatched],
    };
  }

  if (input.eci) {
    const rows = csvObjects(input.eci);
    const unmatched: string[] = [];
    let matched = 0;
    for (const r of rows) {
      const eci = numOrNull(r.eci);
      if (!r.Model || eci == null) continue;
      const id = resolve(r.Model, r.Organization ?? "");
      if (!id) {
        unmatched.push(r.Model);
        continue;
      }
      matched++;
      const key = `${id}\u0000${ECI_NAME}`;
      const score: EpochScore = {
        benchmark: ECI_NAME,
        label: "Epoch Capabilities Index (ECI)",
        score: eci,
        kind: "index",
        stderr: null,
        ciLow: numOrNull(r.eci_ci_low),
        ciHigh: numOrNull(r.eci_ci_high),
        date: day(r.date),
        url: `${EPOCH_HUB_URL}/eci`,
        logUrl: null,
        version: r.Model,
      };
      const cur = best.get(key);
      if (!cur || score.score > cur.score) best.set(key, score);
    }
    snap.benchmarks.unshift(ECI_NAME);
    snap.coverage[ECI_NAME] = { rows: rows.length, models: rows.length, matchedModels: matched, unmatched };
  }

  const order = new Map(snap.benchmarks.map((b, i) => [b, i]));
  for (const [key, score] of best) {
    const id = key.slice(0, key.indexOf("\u0000"));
    (snap.byModel[id] ??= []).push(score);
  }
  for (const list of Object.values(snap.byModel)) {
    list.sort((a, b) => order.get(a.benchmark)! - order.get(b.benchmark)!);
  }
  return snap;
}

/**
 * Unzip Epoch's archive and match its rows to OpenRouter ids. This is
 * CPU-bound (about 30-60 ms on the full 2.3 MB archive, measured locally), so
 * it runs in the daily sync (scripts/sync-epoch.mjs), not on a request. Pages
 * read the stored rows from D1. Throws when the archive is unusable.
 */
export async function epochSnapshotFromZip(buf: ArrayBuffer, index: MatchIndex): Promise<EpochSnapshot> {
  const files = await readZipText(buf, wantedEpochFile);
  const metadata = files.get("benchmark_metadata.csv");
  if (!metadata) throw new Error("Epoch archive has no benchmark_metadata.csv");
  const snap = buildEpochSnapshot(
    {
      metadata,
      files,
      eci: files.get("epoch_capabilities_index/eci_scores.csv"),
      modelMetadata: files.get("model_metadata.csv"),
    },
    index
  );
  if (Object.keys(snap.byModel).length === 0) throw new Error("Epoch data matched no models");
  return snap;
}

/** One row of the epoch_scores table per matched model. Column names match db/schema.sql. */
export function epochRows(snap: EpochSnapshot): Array<{ model_id: string; scores: string }> {
  return Object.entries(snap.byModel)
    .filter(([, scores]) => scores.length > 0)
    .map(([model_id, scores]) => ({ model_id, scores: JSON.stringify(scores) }))
    .sort((a, b) => a.model_id.localeCompare(b.model_id));
}

/** Parse a stored epoch_scores.scores value; empty for anything unreadable. */
export function parseEpochScores(json: unknown): EpochScore[] {
  if (typeof json !== "string") return [];
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (s): s is EpochScore =>
        !!s &&
        typeof s === "object" &&
        typeof (s as EpochScore).benchmark === "string" &&
        typeof (s as EpochScore).label === "string" &&
        typeof (s as EpochScore).score === "number" &&
        typeof (s as EpochScore).url === "string"
    );
  } catch {
    return [];
  }
}

/** Files the loader needs out of the archive. */
export function wantedEpochFile(name: string): boolean {
  return (
    name === "benchmark_metadata.csv" ||
    name === "model_metadata.csv" ||
    name === "epoch_capabilities_index/eci_scores.csv" ||
    (/^[a-z0-9_]+\.csv$/.test(name) && !name.endsWith("_external.csv"))
  );
}
