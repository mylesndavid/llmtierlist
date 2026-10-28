import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/or-bench-sample.json";
import {
  loadBenchmarks,
  loadUsage,
  MANIFEST_URL,
  resetBenchmarkMemoryCache,
  resetUsageMemoryCache,
  USAGE_MANIFEST_URL,
} from "../valueData";

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

  it("carries model_permaslug -> model_slug pairs", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === MANIFEST_URL ? jsonResponse({ files: { json: { url: DATA_URL } } }) : jsonResponse(fixture)
    ));
    const res = await loadBenchmarks();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pair = fixture.rows.find((r) => r.model_permaslug && r.model_slug)!;
    expect(res.permaslugs[pair.model_permaslug!]).toBe(pair.model_slug);
  });
});

describe("loadUsage", () => {
  const USAGE_DATA_URL = "https://openrouter.ai/api/v1/datasets/exports/rankings-daily/2026-10-28.json";
  const usageRows = Array.from({ length: 9 }, (_, i) => ({
    date: `2026-10-${19 + i}`,
    model_permaslug: "z-ai/glm-5.3-flash-20260826",
    rank: 1,
    total_tokens: 1e12,
    share_of_daily_tokens: 0.1,
  }));
  const ok = (rows: unknown[]) =>
    vi.fn(async (url: string) =>
      url === USAGE_MANIFEST_URL
        ? jsonResponse({ files: { json: { url: USAGE_DATA_URL } } })
        : jsonResponse({ snapshot_date: "2026-10-28", rows })
    );

  beforeEach(() => {
    resetUsageMemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows the manifest and keeps the latest 7 dates", async () => {
    const fetchMock = ok(usageRows);
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadUsage();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshotDate).toBe("2026-10-28");
    expect(res.rows).toHaveLength(7);
    expect(res.rows[0].date).toBe("2026-10-21");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([USAGE_MANIFEST_URL, USAGE_DATA_URL]);
  });

  it("returns an error state and does not cache a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 502)));
    expect((await loadUsage()).ok).toBe(false);
    vi.stubGlobal("fetch", ok(usageRows));
    expect((await loadUsage()).ok).toBe(true);
  });

  it("returns an error state for an export with no model rows", async () => {
    vi.stubGlobal("fetch", ok([{ date: "2026-10-27", model_permaslug: "other", rank: 51, total_tokens: 5 }]));
    expect((await loadUsage()).ok).toBe(false);
  });
});
