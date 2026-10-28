import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1", () => ({ d1Query: vi.fn() }));

import { d1Query } from "@/lib/d1";
import { buildResult, normalizeSearch, type ShownPost, type XPanelResult } from "@/lib/xPosts";
import {
  DECISIONS_URL,
  LOOKUP_URL,
  SEARCH_URL,
  fillPanels,
  getCachedSentiment,
  loadXPosts,
  peekPanels,
  resetXPostsMemoryCache,
} from "@/lib/xPostsData";

const d1 = vi.mocked(d1Query);
const HOUR = 3600 * 1000;
const model = { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" };

function shown(id: string, sentiment: ShownPost["sentiment"]): ShownPost {
  const [p] = normalizeSearch({
    output: {
      data: {
        items: [
          {
            id,
            text: `post ${id}`,
            createdUtc: Math.floor(Date.now() / 1000) - 600,
            lang: "en",
            authorUsername: "jane",
            likeCount: 50,
          },
        ],
      },
    },
  });
  return { ...p, sentiment };
}

function panel(ageMs: number, scored = true): XPanelResult {
  return buildResult(
    [shown("1", "positive"), shown("2", "positive"), shown("3", "negative"), shown("4", "neutral")],
    scored,
    Date.now() - ageMs
  );
}

function row(id: string, p: XPanelResult) {
  return { model_id: id, fetched_at: new Date(p.fetchedAt).toISOString(), scored: p.scored ? 1 : 0, payload: JSON.stringify(p) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Live search + Jev + lookups for one relevant positive post. */
function stubLive() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === SEARCH_URL) {
      return json({
        output: {
          data: {
            items: Array.from({ length: 12 }, (_, i) => ({
              id: String(500 + i),
              text: "GLM 5.3 Flash rocks",
              createdUtc: Math.floor(Date.now() / 1000) - 60,
              lang: "en",
              authorUsername: "bob",
              likeCount: 40 - i,
            })),
          },
          found: true,
        },
      });
    }
    if (url === DECISIONS_URL) {
      return json({
        answers: Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => [
            [`about__p${i}`, { score: 0.9 }],
            [`sentiment__p${i}`, { choice: "positive" }],
          ]).flat()
        ),
      });
    }
    if (url.startsWith(LOOKUP_URL)) return json({ data: { quoted: null } });
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A stand-in for the Workers colo cache (caches.default). */
function stubEdge() {
  const store = new Map<string, { body: string; maxAge: string | null }>();
  vi.stubGlobal("caches", {
    default: {
      async match(req: Request) {
        const hit = store.get(req.url);
        return hit ? new Response(hit.body) : undefined;
      },
      async put(req: Request, res: Response) {
        store.set(req.url, { body: await res.text(), maxAge: res.headers.get("Cache-Control") });
      },
      async delete(req: Request) {
        return store.delete(req.url);
      },
    },
  });
  return store;
}

describe("panel read path with D1", () => {
  beforeEach(() => {
    resetXPostsMemoryCache();
    d1.mockReset();
    vi.stubEnv("TREG_TOKEN", "test-treg");
    vi.stubEnv("OPENROUTER_API_KEY", "test-or");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("serves a fresh D1 row without searching, then from memory", async () => {
    const stored = panel(2 * HOUR);
    d1.mockResolvedValueOnce([row(model.id, stored)]);
    const fetchMock = stubLive();
    const res = await loadXPosts(model);
    expect(res.ok && res.posts.map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d1).toHaveBeenCalledTimes(1);
    expect(d1.mock.calls[0][0]).toMatch(/from x_panels where model_id in \(\?\)/);
    expect(d1.mock.calls[0][1]).toEqual([model.id]);

    await loadXPosts(model);
    expect(d1).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale row and writes the new panel back", async () => {
    d1.mockResolvedValueOnce([row(model.id, panel(13 * HOUR))]).mockResolvedValueOnce([]);
    const fetchMock = stubLive();
    const res = await loadXPosts(model);
    expect(res.ok && res.posts[0].id).toBe("500");
    expect(fetchMock).toHaveBeenCalled();
    const [sql, params] = d1.mock.calls[1];
    expect(sql).toMatch(/insert into x_panels [\s\S]* on conflict \(model_id\) do update/);
    expect(params![0]).toBe(model.id);
    expect(params![2]).toBe(1);
    const written = JSON.parse(params![3] as string) as XPanelResult;
    expect(written.posts).toHaveLength(6);
    expect(new Date(params![1] as string).getTime()).toBe(written.fetchedAt);
  });

  it("treats an unscored row as stale after 1h", async () => {
    d1.mockResolvedValueOnce([row(model.id, panel(2 * HOUR, false))]).mockResolvedValueOnce([]);
    const fetchMock = stubLive();
    await loadXPosts(model);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to a live load when D1 fails, and still answers when the write fails", async () => {
    d1.mockRejectedValueOnce(new Error("D1 down")).mockRejectedValueOnce(new Error("D1 down"));
    stubLive();
    const res = await loadXPosts(model);
    expect(res.ok && res.scored).toBe(true);
    expect(d1).toHaveBeenCalledTimes(2);
  });

  it("does not touch D1 when it is not configured", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    stubLive();
    expect((await loadXPosts(model)).ok).toBe(true);
    expect(d1).not.toHaveBeenCalled();
  });

  it("does not store failures", async () => {
    d1.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 502)));
    expect((await loadXPosts(model)).ok).toBe(false);
    expect(d1.mock.calls.filter(([sql]) => /insert/.test(sql))).toHaveLength(0);
  });

  it("checks the colo cache before D1 and caches a D1 row only for its remaining TTL", async () => {
    const edge = stubEdge();
    d1.mockResolvedValueOnce([row(model.id, panel(10 * HOUR))]);
    stubLive();
    await loadXPosts(model);
    const [entry] = [...edge.values()];
    const maxAge = Number(entry.maxAge!.match(/max-age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(2 * 3600 - 60);
    expect(maxAge).toBeLessThanOrEqual(2 * 3600);

    // a new isolate: memory is empty, the colo cache answers, D1 is not read
    resetXPostsMemoryCache();
    d1.mockClear();
    expect((await loadXPosts(model)).ok).toBe(true);
    expect(d1).not.toHaveBeenCalled();
  });
});

describe("cache-only readers", () => {
  beforeEach(() => {
    resetXPostsMemoryCache();
    d1.mockReset();
    vi.stubEnv("TREG_TOKEN", "test-treg");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("getCachedSentiment reads D1 and never searches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    d1.mockResolvedValueOnce([row(model.id, panel(HOUR))]);
    expect(await getCachedSentiment(model.id)).toEqual({ positivePct: 50, neutralPct: 25, negativePct: 25, n: 4 });

    d1.mockResolvedValueOnce([]);
    expect(await getCachedSentiment("other/model")).toBeNull();

    d1.mockResolvedValueOnce([row("u/m", panel(10 * 60 * 1000, false))]);
    expect(await getCachedSentiment("u/m")).toBeNull(); // unscored

    d1.mockRejectedValueOnce(new Error("D1 down"));
    expect(await getCachedSentiment("x/y")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("peekPanels batches D1, marks stale rows and drops week-old ones", async () => {
    d1.mockResolvedValueOnce([
      row("a/fresh", panel(HOUR)),
      row("b/stale", panel(20 * HOUR)),
      row("c/old", panel(8 * 24 * HOUR)),
    ]);
    const out = await peekPanels(["a/fresh", "b/stale", "c/old", "d/none"]);
    expect(d1).toHaveBeenCalledTimes(1);
    expect(d1.mock.calls[0][1]).toEqual(["a/fresh", "b/stale", "c/old", "d/none"]);
    expect([...out].map(([id, p]) => [id, p.fresh])).toEqual([
      ["a/fresh", true],
      ["b/stale", false],
    ]);
    // fresh panels are now in memory; only the others go to D1 again
    d1.mockResolvedValueOnce([]);
    await peekPanels(["a/fresh", "b/stale"]);
    expect(d1.mock.calls[1][1]).toEqual(["b/stale"]);
  });

  it("peekPanels with edge: false skips the colo cache and still batches D1", async () => {
    const match = vi.fn(async () => undefined);
    vi.stubGlobal("caches", { default: { match, put: vi.fn(), delete: vi.fn() } });
    d1.mockResolvedValueOnce([row("a/fresh", panel(HOUR))]);
    const out = await peekPanels(["a/fresh", "d/none"], { edge: false });
    expect(match).not.toHaveBeenCalled();
    expect(d1).toHaveBeenCalledTimes(1);
    expect([...out.keys()]).toEqual(["a/fresh"]);
    // the default still looks in the colo cache first
    d1.mockResolvedValueOnce([]);
    await peekPanels(["d/none"]);
    expect(match).toHaveBeenCalledTimes(1);
  });

  it("fillPanels loads at most `max` models, `concurrency` at a time", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    let active = 0;
    let peak = 0;
    const searched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== SEARCH_URL) throw new Error(`unexpected ${url}`);
        searched.push(JSON.parse(init!.body as string).query);
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return json({ output: { data: { items: [] }, found: false } });
      })
    );
    const models = ["a", "b", "c", "d", "e", "f"].map((x) => ({ id: `lab/${x}`, name: x.toUpperCase() }));
    await fillPanels(models, { concurrency: 2, max: 3 });
    expect(peak).toBe(2);
    // three models, four empty ladder steps each
    expect(new Set(searched.map((q) => q.match(/^"(\w)"/)![1]))).toEqual(new Set(["A", "B", "C"]));
    expect(searched).toHaveLength(12);
  });
});
