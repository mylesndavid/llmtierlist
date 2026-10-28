import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyJevAnswers,
  buildJevRequest,
  buildQuery,
  buildResult,
  compactCount,
  decodeEntities,
  normalizeSearch,
  selectPosts,
  splitPostText,
  tallySentiment,
  type XPost,
} from "@/lib/xPosts";
import {
  DECISIONS_URL,
  SEARCH_URL,
  loadXPosts,
  panelTtl,
  resetXPostsMemoryCache,
} from "@/lib/xPostsData";

const NOW = 1_793_200_000;

function raw(over: Record<string, unknown> = {}) {
  return {
    id: "2115381905931788437",
    url: "https://x.com/i/web/status/2115381905931788437",
    text: "GLM 5.3 Flash is fast",
    createdUtc: NOW - 3600,
    lang: "en",
    isReply: false,
    authorName: "Jane",
    authorUsername: "jane",
    authorImage: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
    authorVerified: true,
    authorFollowers: 10,
    likeCount: 1,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    viewCount: 50,
    media: [],
    ...over,
  };
}

function post(over: Partial<XPost> = {}): XPost {
  return { ...normalizeSearch({ output: { posts: [raw()] } })[0], ...over };
}

describe("buildQuery", () => {
  it("quotes the display name and ORs the id tail when different", () => {
    expect(buildQuery("GLM 5.3 Flash", "z-ai/glm-5.3-flash")).toBe(
      '("GLM 5.3 Flash" OR "glm-5.3-flash") -is:retweet lang:en'
    );
  });

  it("uses only the name when the tail matches it", () => {
    expect(buildQuery("gpt-oss-120b", "openai/gpt-oss-120b")).toBe('"gpt-oss-120b" -is:retweet lang:en');
  });

  it("strips quotes from names and variant suffixes from ids", () => {
    expect(buildQuery('Model "X"', "lab/model-x:free")).toBe('("Model X" OR "model-x") -is:retweet lang:en');
  });
});

describe("normalizeSearch", () => {
  it("normalizes a post and builds its x.com URL", () => {
    const [p] = normalizeSearch({ output: { posts: [raw()], next_cursor: "abc" }, raw: {}, _treg: {} });
    expect(p).toMatchObject({
      id: "2115381905931788437",
      url: "https://x.com/jane/status/2115381905931788437",
      authorUsername: "jane",
      authorVerified: true,
      likeCount: 1,
    });
  });

  it("returns [] for a miss", () => {
    expect(normalizeSearch({ output: { posts: [] } })).toEqual([]);
    // treg's real miss when every provider comes back empty
    expect(
      normalizeSearch({
        output: { posts: null, next_cursor: null },
        raw: null,
        _treg: { served_by: null, outcome: "miss", charged_micro: 1600 },
      })
    ).toEqual([]);
  });

  it("throws when the response is not a search result", () => {
    expect(() => normalizeSearch({ error: "nope" })).toThrow();
    expect(() => normalizeSearch(null)).toThrow();
    // null posts without a miss outcome is an error, not an empty result
    expect(() => normalizeSearch({ output: { posts: null }, _treg: { outcome: "error" } })).toThrow();
  });

  it("skips posts missing required fields and fills optional ones", () => {
    const posts = normalizeSearch({
      output: {
        posts: [
          raw({ id: undefined }),
          raw({ id: "2", text: "" }),
          raw({ id: "3", authorUsername: undefined }),
          raw({ id: "4", createdUtc: "yesterday" }),
          raw({ id: "5", authorUsername: "bad handle" }),
          raw({ id: "abc" }),
          null,
          "junk",
          raw({
            id: "6",
            authorName: undefined,
            authorImage: "https://evil.example/a.png",
            likeCount: undefined,
            retweetCount: -3,
            viewCount: undefined,
            lang: undefined,
          }),
          raw({ id: "6" }), // duplicate
        ],
      },
    });
    expect(posts.map((p) => p.id)).toEqual(["6"]);
    expect(posts[0]).toMatchObject({
      authorName: "jane",
      authorImage: null,
      likeCount: 0,
      retweetCount: 0,
      viewCount: null,
      lang: "",
    });
  });

  it("decodes X's escaped entities", () => {
    expect(decodeEntities("a &amp; b &lt;3 &gt; &amp;lt;")).toBe("a & b <3 > &lt;");
    expect(normalizeSearch({ output: { posts: [raw({ text: "R&amp;D" })] } })[0].text).toBe("R&D");
  });
});

describe("selectPosts", () => {
  it("drops non-English posts and replies with no engagement", () => {
    const out = selectPosts(
      [
        post({ id: "1", lang: "ja" }),
        post({ id: "2", lang: "" }),
        post({ id: "3", isReply: true, likeCount: 0 }),
        post({ id: "4", isReply: true, likeCount: 0, quoteCount: 1 }),
        post({ id: "5" }),
      ],
      NOW
    );
    // a quote counts as engagement for the reply filter, not for ranking
    expect(out.map((p) => p.id)).toEqual(["5", "4"]);
  });

  it("ranks by likes + 2×reposts + replies with a small recency boost", () => {
    const week = 7 * 24 * 3600;
    const out = selectPosts(
      [
        post({ id: "likes", likeCount: 10, createdUtc: NOW - 2 * week }), // 10
        post({ id: "reposts", likeCount: 0, retweetCount: 6, createdUtc: NOW - 2 * week }), // 12
        post({ id: "fresh", likeCount: 8, createdUtc: NOW }), // 8 + 5
        post({ id: "old", likeCount: 1, replyCount: 1, createdUtc: NOW - 2 * week }), // 2
      ],
      NOW
    );
    expect(out.map((p) => p.id)).toEqual(["fresh", "reposts", "likes", "old"]);
  });

  it("limits how many are sent", () => {
    const many = Array.from({ length: 30 }, (_, i) => post({ id: String(i), likeCount: i }));
    const out = selectPosts(many, NOW);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("29");
  });
});

describe("Jev request and answers", () => {
  const posts = [post({ id: "1" }), post({ id: "2" }), post({ id: "3" }), post({ id: "4" })];

  it("asks an about score and a sentiment choice per post", () => {
    const body = buildJevRequest("GLM 5.3 Flash (z-ai/glm-5.3-flash)", posts.slice(0, 2));
    expect(body.model).toBe("~typesafe/jev-latest");
    expect(body.state.model).toBe("GLM 5.3 Flash (z-ai/glm-5.3-flash)");
    expect(body.state.posts.p1).toEqual({ text: "GLM 5.3 Flash is fast", author: "@jane" });
    expect(Object.keys(body.questions)).toEqual(["about__p0", "sentiment__p0", "about__p1", "sentiment__p1"]);
    const about = body.questions.about__p0 as { type: string; criteria: string[] };
    expect(about.type).toBe("score");
    expect(about.criteria).toHaveLength(2); // anchors for 0 and 1
    expect(about.criteria[1]).toMatch(/^About this AI model/);
    const sentiment = body.questions.sentiment__p0 as { type: string; criteria: Record<string, string> };
    expect(sentiment.type).toBe("choice");
    expect(Object.keys(sentiment.criteria).sort()).toEqual(["mixed", "negative", "neutral", "positive"]);
  });

  it("drops posts scored below 0.5 and labels the rest", () => {
    const out = applyJevAnswers(
      {
        answers: {
          about__p0: { type: "score", score: 0.92 },
          sentiment__p0: { type: "choice", choice: "positive", probabilities: {}, confidence: 0.8 },
          about__p1: { type: "score", score: 0.11 },
          sentiment__p1: { type: "choice", choice: "neutral" },
          about__p2: { type: "score", score: 0.5 },
          sentiment__p2: { type: "choice", choice: "angry" },
          // p3: no answers at all
        },
        model: "typesafe/jev-1.14-20261014",
        usage: {},
      },
      posts
    );
    expect(out.map((p) => [p.id, p.sentiment])).toEqual([
      ["1", "positive"],
      ["3", null],
      ["4", null],
    ]);
  });

  it("throws on a response without answers", () => {
    expect(() => applyJevAnswers({ error: { message: "bad" } }, posts)).toThrow();
  });

  it("tallies sentiment and keeps the top 6", () => {
    const shown = Array.from({ length: 8 }, (_, i) => ({
      ...post({ id: String(i) }),
      sentiment: (["positive", "negative", null] as const)[i % 3],
    }));
    expect(tallySentiment(shown)).toEqual({ positive: 3, mixed: 0, neutral: 0, negative: 3 });
    const res = buildResult(shown, true);
    expect(res.posts).toHaveLength(6);
    expect(res.counts.positive).toBe(3);
  });
});

describe("splitPostText", () => {
  it("links URLs and @mentions and keeps every character", () => {
    const text = "sick! @dxcode_dev btw: glm-5.3-flash https://t.co/AuDIJ7CrpL. mail a@b.co";
    const parts = splitPostText(text);
    expect(parts.map((p) => p.value).join("")).toBe(text);
    expect(parts.filter((p) => p.type !== "text")).toEqual([
      { type: "mention", value: "@dxcode_dev", href: "https://x.com/dxcode_dev" },
      { type: "url", value: "https://t.co/AuDIJ7CrpL", href: "https://t.co/AuDIJ7CrpL" },
    ]);
  });

  it("handles a mention at the start and text with no links", () => {
    expect(splitPostText("@pwn4tv hi")[0]).toEqual({ type: "mention", value: "@pwn4tv", href: "https://x.com/pwn4tv" });
    expect(splitPostText("plain")).toEqual([{ type: "text", value: "plain" }]);
    const quoted = splitPostText("see `https://t.co/jgc99a9J2h` (https://x.co/a).");
    expect(quoted.filter((p) => p.type === "url").map((p) => p.value)).toEqual([
      "https://t.co/jgc99a9J2h",
      "https://x.co/a",
    ]);
  });

  it("formats counts compactly", () => {
    expect(compactCount(41)).toBe("41");
    expect(compactCount(1234)).toBe("1.2K");
    expect(compactCount(25_000)).toBe("25K");
    expect(compactCount(3_400_000)).toBe("3.4M");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("loadXPosts", () => {
  const model = { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" };
  const search = { output: { posts: [raw({ id: "1", likeCount: 5 }), raw({ id: "2" })], next_cursor: null } };
  const jev = {
    answers: {
      about__p0: { score: 0.9 },
      sentiment__p0: { choice: "positive" },
      about__p1: { score: 0.2 },
      sentiment__p1: { choice: "neutral" },
    },
  };

  beforeEach(() => {
    resetXPostsMemoryCache();
    vi.stubEnv("TREG_TOKEN", "test-treg");
    vi.stubEnv("OPENROUTER_API_KEY", "test-or");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("searches, scores with Jev and keeps relevant posts", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SEARCH_URL) {
        const headers = init!.headers as Record<string, string>;
        expect(headers["X-Treg-Token"]).toBe("test-treg");
        expect(headers["X-Treg-Route-Max-Cost"]).toBe("0.02");
        expect(JSON.parse(init!.body as string)).toEqual({
          q: '("GLM 5.3 Flash" OR "glm-5.3-flash") -is:retweet lang:en',
        });
        return jsonResponse(search);
      }
      if (url === DECISIONS_URL) {
        expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-or");
        const body = JSON.parse(init!.body as string);
        expect(body.state.model).toBe("GLM 5.3 Flash (z-ai/glm-5.3-flash)");
        return jsonResponse(jev);
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadXPosts(model);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scored).toBe(true);
    expect(res.posts.map((p) => [p.id, p.sentiment])).toEqual([["1", "positive"]]);
    expect(res.counts.positive).toBe(1);

    // cached: no second search
    await loadXPosts(model);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows posts unscored without an OpenRouter key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = vi.fn(async () => jsonResponse(search));
    vi.stubGlobal("fetch", fetchMock);
    const res = await loadXPosts(model);
    expect(res.ok && res.scored).toBe(false);
    expect(res.ok && res.posts.map((p) => p.sentiment)).toEqual([null, null]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows posts unscored when Jev fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === SEARCH_URL ? jsonResponse(search) : jsonResponse({ error: { message: "bad" } }, 400)
    ));
    const res = await loadXPosts(model);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scored).toBe(false);
    expect(res.posts).toHaveLength(2);
  });

  it("returns an error state, uncached, when search fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 502)));
    expect((await loadXPosts(model)).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    expect(await loadXPosts(model)).toEqual({ ok: false, error: "network down" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === SEARCH_URL ? jsonResponse(search) : jsonResponse(jev))));
    expect((await loadXPosts(model)).ok).toBe(true);
  });

  it("returns an error state without a treg token, without fetching", async () => {
    vi.stubEnv("TREG_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await loadXPosts(model)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches misses and scored results for 12h, unscored results for 1h", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ output: { posts: [] } })));
    const res = await loadXPosts(model);
    expect(res.ok && res.posts).toEqual([]);
    expect(panelTtl({ posts: [], scored: true, counts: tallySentiment([]) })).toBe(12 * 3600);
    expect(panelTtl({ posts: [], scored: false, counts: tallySentiment([]) })).toBe(12 * 3600);
    const one = buildResult([{ ...post(), sentiment: "positive" }], true);
    expect(panelTtl(one)).toBe(12 * 3600);
    expect(panelTtl({ ...one, scored: false })).toBe(3600);
  });
});
