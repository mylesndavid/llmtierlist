import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data", () => ({ getBaseModelsWithStats: vi.fn() }));

import benchFixture from "./fixtures/or-bench-sample.json";
import orCatalog from "./fixtures/or-catalog-sample.json";
import { getBaseModelsWithStats } from "@/lib/data";
import { aggregateRows, isEligible, presetWeights, scoreModels, type BenchRow } from "../value";
import { MANIFEST_URL, USAGE_MANIFEST_URL, resetBenchmarkMemoryCache, resetUsageMemoryCache } from "../valueData";
import { resetCatalogMemoryCache } from "../openrouterCatalog";
import { loadValueData } from "../valueLoad";
import { topModels } from "../buzzData";
import type { ModelWithStats } from "../types";

const getCatalog = vi.mocked(getBaseModelsWithStats);

const BENCH_DATA_URL = "https://openrouter.ai/api/v1/datasets/exports/benchmark-leaderboard/2026-10-28.json";
const USAGE_DATA_URL = "https://openrouter.ai/api/v1/datasets/exports/rankings-daily/2026-10-28.json";
const bench = aggregateRows(benchFixture.rows as BenchRow[]).filter(isEligible);
const [first, second] = bench;

// 7 days of usage: one benchmarked model and one that is not benchmarked
const usageRows = Array.from({ length: 7 }, (_, i) => [
  { date: `2026-10-${22 + i}`, model_permaslug: "acme/unbenchmarked", rank: 1, total_tokens: 3e12 },
  { date: `2026-10-${22 + i}`, model_permaslug: first.id, rank: 2, total_tokens: 1e12 },
]).flat();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch({ benchOk = true, orOk = true } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === MANIFEST_URL) return benchOk ? jsonResponse({ files: { json: { url: BENCH_DATA_URL } } }) : jsonResponse({}, 500);
    if (url === BENCH_DATA_URL) return jsonResponse(benchFixture);
    if (url === USAGE_MANIFEST_URL) return jsonResponse({ files: { json: { url: USAGE_DATA_URL } } });
    if (url === USAGE_DATA_URL) return jsonResponse({ snapshot_date: "2026-10-28", rows: usageRows });
    if (url.startsWith("https://openrouter.ai/api/v1/models")) return orOk ? jsonResponse(orCatalog) : jsonResponse({}, 503);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function catalogEntry(id: string, name: string, license: string): ModelWithStats {
  return {
    id,
    slug: id.replace(/[^a-z0-9]+/g, "-"),
    name,
    vendor: "Vendor",
    vendor_slug: id.split("/")[0],
    license,
  } as ModelWithStats;
}

describe("loadValueData", () => {
  beforeEach(() => {
    resetBenchmarkMemoryCache();
    resetUsageMemoryCache();
    resetCatalogMemoryCache();
    getCatalog.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("joins the D1 catalog and scores with the same Balanced weights the home page starts on", async () => {
    stubFetch();
    getCatalog.mockResolvedValueOnce([
      catalogEntry(first.id, "Catalog First", "open-weights"),
      catalogEntry(second.id, "Catalog Second", "proprietary"),
    ]);
    const v = await loadValueData();
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.catalog.source).toBe("d1");
    const byId = new Map(v.models.map((m) => [m.id, m]));
    expect(byId.get(first.id)).toMatchObject({ name: "Catalog First", openWeights: true });
    expect(byId.get(second.id)).toMatchObject({ name: "Catalog Second", openWeights: false });
    expect(v.showOpenWeights).toBe(true);
    // usage covers models outside the benchmark set too (/buzz ranks from it)
    expect(v.usage?.get("acme/unbenchmarked")?.rank).toBe(1);
    expect(byId.get(first.id)!.usage?.rank).toBe(2);
    expect(v.showUsage).toBe(true);
    // the client scores `models` with the preset weights; Balanced must match `result`
    const client = scoreModels(v.models, presetWeights("balanced"));
    expect(client.models.map((r) => [r.model.id, r.tier, r.score])).toEqual(
      v.result.models.map((r) => [r.model.id, r.tier, r.score])
    );
    expect(v.byId.get(first.id)!.score).toBe(v.result.models.find((r) => r.model.id === first.id)!.score);
  });

  it("falls back to the OpenRouter list when D1 is unreachable", async () => {
    stubFetch();
    getCatalog.mockRejectedValueOnce(new Error("D1 down"));
    const v = await loadValueData();
    expect(v.catalog.source).toBe("openrouter");
    expect(v.catalog.models.length).toBeGreaterThan(0);
    expect(v.ok).toBe(true);
  });

  it("still ranks usage when benchmarks are unavailable", async () => {
    stubFetch({ benchOk: false, orOk: false });
    getCatalog.mockRejectedValueOnce(new Error("D1 down"));
    const v = await loadValueData();
    expect(v.ok).toBe(false);
    expect(v.catalog.source).toBe("none");
    expect(v.usage?.get("acme/unbenchmarked")?.rank).toBe(1);
    const top = topModels(v, 5);
    expect(top.map((m) => m.id)).toEqual(["acme/unbenchmarked", first.id]);
    expect(top[0]).toMatchObject({ name: "unbenchmarked", slug: null, usageRank: 1 });
  });

  it("uses a catalog the caller already loaded", async () => {
    stubFetch();
    getCatalog.mockResolvedValueOnce([catalogEntry(first.id, "Catalog First", "open-weights")]);
    const first1 = await loadValueData();
    const again = await loadValueData(first1.catalog);
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(again.ok && again.byId.get(first.id)?.model.name).toBe("Catalog First");
  });
});
