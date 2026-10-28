import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/or-bench-sample.json";
import { loadBenchmarks, MANIFEST_URL, resetBenchmarkMemoryCache } from "../valueData";

const DATA_URL = "https://openrouter.ai/api/v1/datasets/exports/benchmark-leaderboard/2026-10-28.json";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("loadBenchmarks", () => {
  beforeEach(() => {
    resetBenchmarkMemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows the manifest and returns eligible models", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MANIFEST_URL ? jsonResponse({ files: { json: { url: DATA_URL } } }) : jsonResponse(fixture)
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadBenchmarks();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshotDate).toBe("2026-10-28");
    expect(res.models.length).toBeGreaterThan(0);
    expect(res.models.every((m) => m.metrics.gpqa_diamond && m.metrics.tau_bench_verified_airline)).toBe(true);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([MANIFEST_URL, DATA_URL]);
  });

  it("returns an error state when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    const res = await loadBenchmarks();
    expect(res).toEqual({ ok: false, error: "network down" });
  });

  it("returns an error state on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 503)));
    const res = await loadBenchmarks();
    expect(res.ok).toBe(false);
  });

  it("returns an error state when the manifest or export is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ files: {} })));
    expect((await loadBenchmarks()).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === MANIFEST_URL ? jsonResponse({ files: { json: { url: DATA_URL } } }) : jsonResponse({ rows: "nope" })
    ));
    expect((await loadBenchmarks()).ok).toBe(false);
  });

  it("does not cache a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    expect((await loadBenchmarks()).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === MANIFEST_URL ? jsonResponse({ files: { json: { url: DATA_URL } } }) : jsonResponse(fixture)
    ));
    expect((await loadBenchmarks()).ok).toBe(true);
  });
});
