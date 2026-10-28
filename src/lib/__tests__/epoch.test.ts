import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "./fixtures/or-catalog-sample.json";
import {
  buildEpochSnapshot,
  csvObjects,
  ECI_NAME,
  EPOCH_ZIP_URL,
  epochRunBenchmarks,
  csvHeader,
  parseCsv,
  readZipText,
  wantedEpochFile,
} from "../epoch";
import { buildMatchIndex } from "../modelMatch";
import { getEpochForModel, loadEpoch, resetEpochMemoryCache } from "../epochData";
import { resetCatalogMemoryCache } from "../openrouterCatalog";

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

describe("loadEpoch", () => {
  beforeEach(() => {
    resetEpochMemoryCache();
    resetCatalogMemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads the archive and returns scores per model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === EPOCH_ZIP_URL
          ? new Response(zipBuffer(), { status: 200 })
          : new Response(JSON.stringify(catalog), { status: 200 })
      )
    );
    const res = await loadEpoch();
    expect(res.ok).toBe(true);
    expect((await getEpochForModel("google/gemini-2.5-pro")).length).toBeGreaterThan(0);
    expect(await getEpochForModel("nobody/nothing")).toEqual([]);
  });

  it("returns an error state on a failed download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === EPOCH_ZIP_URL ? new Response("nope", { status: 503 }) : new Response(JSON.stringify(catalog))
      )
    );
    const res = await loadEpoch();
    expect(res.ok).toBe(false);
    expect(await getEpochForModel("openai/gpt-5")).toEqual([]);
  });
});
