import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import page from "./fixtures/arena-rows-sample.json";
import catalog from "./fixtures/or-catalog-sample.json";
import { bestRatings, buildArenaSnapshot, ciHalfWidth, parseArenaPage } from "../arena";
import { buildMatchIndex } from "../modelMatch";
import { getArenaRatings, loadArena, peekArenaRatings, resetArenaMemoryCache } from "../arenaData";
import { resetCatalogMemoryCache } from "../openrouterCatalog";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("parseArenaPage", () => {
  it("reads rows and the total", () => {
    const { rows, total } = parseArenaPage(page);
    expect(total).toBe(11099);
    expect(rows.length).toBe(page.rows.length);
    const opus = rows.find((r) => r.model_name === "Claude Opus 4.5 (20251101)")!;
    expect(opus.category).toBe("overall");
    expect(opus.rating).toBeGreaterThan(1000);
    expect(opus.vote_count).toBeGreaterThan(0);
    expect(opus.leaderboard_publish_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("throws on a datasets-server error payload", () => {
    expect(() => parseArenaPage({ error: "Authentication check on the Hugging Face Hub failed" })).toThrow(
      /datasets-server/
    );
    expect(() => parseArenaPage({})).toThrow();
  });

  it("skips rows without a numeric rating", () => {
    const { rows } = parseArenaPage({ rows: [{ row: { model_name: "x", category: "overall", rating: null } }] });
    expect(rows).toEqual([]);
  });
});

describe("buildArenaSnapshot", () => {
  const index = buildMatchIndex(catalog.data);
  const { rows } = parseArenaPage(page);

  it("keeps overall rows only and groups them by OpenRouter id", () => {
    const snap = buildArenaSnapshot({ text: rows }, index);
    const opus = snap.byModel["anthropic/claude-opus-4.5"];
    expect(opus.map((e) => e.name)).toEqual(
      expect.arrayContaining(["Claude Opus 4.5 (20251101)", "Claude Opus 4.5 (High, 32K, 20251101)"])
    );
    expect(opus.every((e) => e.category === "text")).toBe(true);
    // best rating first
    expect(opus[0].rating).toBeGreaterThanOrEqual(opus[1].rating);
    const overall = rows.filter((r) => r.category === "overall").length;
    expect(snap.coverage.text!.rows).toBe(overall);
    expect(snap.coverage.text!.unmatched).toEqual(expect.arrayContaining(["DeepSeek-R1", "Mistral Large (2411)"]));
  });

  it("gives the best rating per category", () => {
    const snap = buildArenaSnapshot({ text: rows }, index);
    const opus = snap.byModel["anthropic/claude-opus-4.5"];
    expect(bestRatings(opus).text).toBe(Math.max(...opus.map((e) => e.rating)));
    expect(ciHalfWidth(opus[0])).toBeGreaterThan(0);
    expect(ciHalfWidth({ ratingLower: null, ratingUpper: 1 })).toBeNull();
  });
});

describe("loadArena", () => {
  beforeEach(() => {
    resetArenaMemoryCache();
    resetCatalogMemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads every category and exposes ratings by OpenRouter id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://openrouter.ai/api/v1/models")) return jsonResponse(catalog);
      return jsonResponse(page); // page ends with non-overall rows, so paging stops
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadArena();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.partial).toBe(false);
    expect(Object.keys(res.coverage).sort()).toEqual(["search", "text", "vision", "webdev"]);
    const ratings = await getArenaRatings();
    expect(ratings.get("openai/gpt-5")?.text).toBeGreaterThan(1000);
    // one /rows page per category plus the catalog
    expect(fetchMock.mock.calls.length).toBe(5);
  });

  it("returns an error state when the text leaderboard fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://openrouter.ai") ? jsonResponse(catalog) : jsonResponse({ error: "down" })
      )
    );
    const res = await loadArena();
    expect(res.ok).toBe(false);
    expect((await getArenaRatings()).size).toBe(0);
  });

  it("marks the result partial when another category fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://openrouter.ai")) return jsonResponse(catalog);
        if (url.includes("config=vision")) return jsonResponse({}, 500);
        return jsonResponse(page);
      })
    );
    const res = await loadArena();
    expect(res.ok && res.partial).toBe(true);
  });

  it("never throws when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    expect(await loadArena()).toEqual({ ok: false, error: "network down" });
  });

  it("peeks at cached ratings without fetching", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://openrouter.ai/api/v1/models") ? jsonResponse(catalog) : jsonResponse(page)
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await peekArenaRatings()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await loadArena();
    const calls = fetchMock.mock.calls.length;
    const peeked = await peekArenaRatings();
    expect(peeked?.get("openai/gpt-5")?.text).toBeGreaterThan(1000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
