import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1", () => ({ d1Query: vi.fn() }));

import catalog from "./fixtures/or-catalog-sample.json";
import { d1Query } from "@/lib/d1";
import {
  buildEpochSnapshot,
  csvObjects,
  ECI_NAME,
  epochRows,
  epochRunBenchmarks,
  epochSnapshotFromZip,
  csvHeader,
  parseCsv,
  parseEpochScores,
  readZipText,
  wantedEpochFile,
} from "../epoch";
import { buildMatchIndex } from "../modelMatch";
import { getEpochForModel } from "../epochData";

const d1 = vi.mocked(d1Query);

const zipPath = fileURLToPath(new URL("./fixtures/epoch-sample.zip", import.meta.url));
function zipBuffer(): ArrayBuffer {
  const b = readFileSync(zipPath);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and newlines in fields", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n"multi\nline",2\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["multi\nline", "2"],
    ]);
    expect(csvObjects("h1,h2\n1\n")).toEqual([{ h1: "1", h2: "" }]);
  });
});

describe("readZipText", () => {
  it("reads deflated and stored entries", async () => {
    const files = await readZipText(zipBuffer(), () => true);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["benchmark_metadata.csv", "gpqa_diamond.csv", "epoch_capabilities_index/eci_scores.csv", "README.md"])
    );
    expect(files.get("README.md")).toBe("stored entry\n");
    expect(files.get("gpqa_diamond.csv")).toMatch(/^Model version,mean_score/);
  });

  it("skips entries it was not asked for", async () => {
    const files = await readZipText(zipBuffer(), wantedEpochFile);
    expect(files.has("aider_polyglot_external.csv")).toBe(false);
    expect(files.has("README.md")).toBe(false);
  });

  it("throws on data that is not a zip", async () => {
    await expect(readZipText(new TextEncoder().encode("not a zip at all, just text").buffer, () => true)).rejects.toThrow();
  });
});

describe("epochRunBenchmarks", () => {
  it("keeps Epoch's own, current runs", async () => {
    const files = await readZipText(zipBuffer(), () => true);
    const headers = new Map([...files].map(([k, v]) => [k, csvHeader(v)]));
    const names = epochRunBenchmarks(files.get("benchmark_metadata.csv")!, headers).map((b) => b.name);
    expect(names).toEqual(["GPQA diamond", "SWE-Bench verified"]);
    // external copy and superseded FrontierMath version are dropped
    expect(names).not.toContain("Aider polyglot");
    expect(names).not.toContain("FrontierMath-2025-02-28-Private");
  });
});

describe("buildEpochSnapshot", () => {
  it("matches rows to OpenRouter ids and keeps the best run", async () => {
    const files = await readZipText(zipBuffer(), () => true);
    const snap = buildEpochSnapshot(
      { metadata: files.get("benchmark_metadata.csv")!, files, eci: files.get("epoch_capabilities_index/eci_scores.csv") },
      buildMatchIndex(catalog.data)
    );
    const gpt5 = snap.byModel["openai/gpt-5"];
    expect(gpt5.map((s) => s.benchmark)).toEqual([ECI_NAME, "GPQA diamond", "SWE-Bench verified"]);
    const gpqa = gpt5.find((s) => s.benchmark === "GPQA diamond")!;
    // high beats medium
    expect(gpqa.version).toBe("gpt-5-2025-08-07_high");
    expect(gpqa.score).toBeCloseTo(0.8617, 3);
    expect(gpqa.kind).toBe("fraction");
    expect(gpqa.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(gpqa.url).toBe("https://epoch.ai/benchmarks/gpqa-diamond");
    const eci = gpt5.find((s) => s.benchmark === ECI_NAME)!;
    expect(eci.kind).toBe("index");
    expect(eci.score).toBeGreaterThan(100);
    // GPT-5 anchors the index, so Epoch gives it no interval
    expect(eci.ciLow).toBeNull();

    const opusEci = snap.byModel["anthropic/claude-opus-4.5"].find((s) => s.benchmark === ECI_NAME)!;
    expect(opusEci.ciLow).toBeLessThan(opusEci.score);
    expect(opusEci.ciHigh).toBeGreaterThan(opusEci.score);
    expect(snap.coverage["GPQA diamond"].unmatched).toEqual(expect.arrayContaining(["muse-spark", "DeepSeek-R1"]));
    // Kimi K2 (Jul 2025) is ambiguous between kimi-k2 and kimi-k2-0905
    expect(snap.coverage[ECI_NAME].unmatched).toContain("Kimi K2 (Jul 2025)");
  });
});

describe("epochSnapshotFromZip", () => {
  it("unzips the archive and returns scores per model", async () => {
    const snap = await epochSnapshotFromZip(zipBuffer(), buildMatchIndex(catalog.data));
    expect(snap.byModel["google/gemini-2.5-pro"].length).toBeGreaterThan(0);
    expect(snap.byModel["nobody/nothing"]).toBeUndefined();
  });

  it("throws on an archive that is not Epoch's", async () => {
    await expect(
      epochSnapshotFromZip(new TextEncoder().encode("nope").buffer as ArrayBuffer, buildMatchIndex(catalog.data))
    ).rejects.toThrow();
  });

  it("throws when nothing matches the catalog", async () => {
    await expect(epochSnapshotFromZip(zipBuffer(), buildMatchIndex([]))).rejects.toThrow(/matched no models/);
  });
});

describe("epochRows and parseEpochScores", () => {
  it("round-trips a model's scores through the stored row", async () => {
    const snap = await epochSnapshotFromZip(zipBuffer(), buildMatchIndex(catalog.data));
    const rows = epochRows(snap);
    expect(rows.map((r) => r.model_id)).toEqual(Object.keys(snap.byModel).sort());
    const gpt5 = rows.find((r) => r.model_id === "openai/gpt-5")!;
    expect(parseEpochScores(gpt5.scores)).toEqual(snap.byModel["openai/gpt-5"]);
  });

  it("returns an empty list for unreadable values", () => {
    expect(parseEpochScores(undefined)).toEqual([]);
    expect(parseEpochScores("not json")).toEqual([]);
    expect(parseEpochScores('{"a":1}')).toEqual([]);
    expect(parseEpochScores('[{"benchmark":1}]')).toEqual([]);
  });
});

describe("getEpochForModel", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    d1.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads one stored row and never downloads the archive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const snap = await epochSnapshotFromZip(zipBuffer(), buildMatchIndex(catalog.data));
    d1.mockResolvedValueOnce([{ scores: JSON.stringify(snap.byModel["google/gemini-2.5-pro"]) }]);
    expect(await getEpochForModel("google/gemini-2.5-pro")).toEqual(snap.byModel["google/gemini-2.5-pro"]);
    expect(d1).toHaveBeenCalledWith("select scores from epoch_scores where model_id = ?", ["google/gemini-2.5-pro"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty list for an unknown model or a D1 error", async () => {
    d1.mockResolvedValueOnce([]);
    expect(await getEpochForModel("nobody/nothing")).toEqual([]);
    d1.mockRejectedValueOnce(new Error("no such table: epoch_scores"));
    expect(await getEpochForModel("openai/gpt-5")).toEqual([]);
  });

  it("skips D1 when it is not configured", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    expect(await getEpochForModel("openai/gpt-5")).toEqual([]);
    expect(d1).not.toHaveBeenCalled();
  });
});
