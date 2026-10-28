import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import lookupFixture from "./fixtures/x-post-lookup-quote.json";
import {
  applyJevAnswers,
  applyLookup,
  avatarUrl,
  buildJevRequest,
  buildQuery,
  buildResult,
  compactCount,
  decodeEntities,
  mediaUrl,
  mergePosts,
  normalizeSearch,
  parsePostLookup,
  postAge,
  rankScore,
  selectPosts,
  sentimentSummary,
  splitPostText,
  splitReplyMentions,
  tallySentiment,
  type XPost,
} from "@/lib/xPosts";
import {
  DECISIONS_URL,
  LOOKUP_URL,
  SEARCH_URL,
  loadXPosts,
  panelTtl,
  resetXPostsMemoryCache,
} from "@/lib/xPostsData";

const NOW = 1_793_200_000;
const DAY = 86400;

function raw(over: Record<string, unknown> = {}) {
  return {
    id: "2115381905931788437",
    url: "https://x.com/i/web/status/2115381905931788437",
    text: "GLM 5.3 Flash is fast",
    createdUtc: NOW - 3600,
    lang: "en",
    isReply: false,
    inReplyToId: null,
    conversationId: "2115381905931788437",
    authorName: "Jane",
    authorUsername: "jane",
    authorImage: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
    authorVerified: true,
    authorFollowers: 10,
    likeCount: 1,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    bookmarkCount: 0,
    viewCount: 50,
    media: [],
    ...over,
  };
}

/** AnyAPI's search shape, as served through treg. */
const anyapi = (items: unknown[]) => ({ output: { data: { items, nextCursor: null }, found: items.length > 0 } });

function post(over: Partial<XPost> = {}): XPost {
  return { ...normalizeSearch(anyapi([raw()]))[0], ...over };
}

describe("buildQuery", () => {
  it("quotes the display name and ORs the id tail when different", () => {
    expect(buildQuery("GLM 5.3 Flash", "z-ai/glm-5.3-flash")).toBe(
      '("GLM 5.3 Flash" OR "glm-5.3-flash") -is:retweet lang:en'
    );
  });

  it("adds a minimum like count", () => {
    expect(buildQuery("GLM 5.3 Flash", "z-ai/glm-5.3-flash", 20)).toBe(
      '("GLM 5.3 Flash" OR "glm-5.3-flash") min_faves:20 -is:retweet lang:en'
    );
  });

  it("uses only the name when the tail matches it", () => {
    expect(buildQuery("gpt-oss-120b", "openai/gpt-oss-120b", 5)).toBe('"gpt-oss-120b" min_faves:5 -is:retweet lang:en');
  });

  it("strips quotes from names and variant suffixes from ids", () => {
    expect(buildQuery('Model "X"', "lab/model-x:free")).toBe('("Model X" OR "model-x") -is:retweet lang:en');
  });
});

describe("normalizeSearch", () => {
  it("normalizes an AnyAPI post and builds its x.com URL", () => {
    const [p] = normalizeSearch(anyapi([raw()]));
    expect(p).toMatchObject({
      id: "2115381905931788437",
      url: "https://x.com/jane/status/2115381905931788437",
      authorUsername: "jane",
      authorVerified: true,
      likeCount: 1,
      media: [],
      replyTo: [],
      quoted: null,
      links: [],
    });
  });

  it("still reads treg's routed shape", () => {
    expect(normalizeSearch({ output: { posts: [raw()], next_cursor: null } })).toHaveLength(1);
  });

  it("returns [] for a miss", () => {
    expect(normalizeSearch(anyapi([]))).toEqual([]);
    expect(normalizeSearch({ output: { data: null, found: false } })).toEqual([]);
    expect(
      normalizeSearch({ output: { posts: null, next_cursor: null }, raw: null, _treg: { outcome: "miss" } })
    ).toEqual([]);
  });

  it("throws when the response is not a search result", () => {
    expect(() => normalizeSearch({ error: "nope" })).toThrow();
    expect(() => normalizeSearch(null)).toThrow();
    expect(() => normalizeSearch({ output: { posts: null }, _treg: { outcome: "error" } })).toThrow();
  });

  it("skips posts missing required fields and fills optional ones", () => {
    const posts = normalizeSearch(
      anyapi([
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
          media: "nope",
        }),
        raw({ id: "6" }), // duplicate
      ])
    );
    expect(posts.map((p) => p.id)).toEqual(["6"]);
    expect(posts[0]).toMatchObject({
      authorName: "jane",
      authorImage: null,
      likeCount: 0,
      retweetCount: 0,
      viewCount: null,
      lang: "",
      media: [],
    });
  });

  it("decodes X's escaped entities", () => {
    expect(decodeEntities("a &amp; b &lt;3 &gt; &amp;lt;")).toBe("a & b <3 > &lt;");
    expect(normalizeSearch(anyapi([raw({ text: "R&amp;D" })]))[0].text).toBe("R&D");
  });

  it("keeps photos and video thumbnails from X's image host and hides the media link", () => {
    const [p] = normalizeSearch(
      anyapi([
        raw({
          text: "live at https://t.co/HlC3SrGOoI https://t.co/cx6VwHBjTQ",
          media: [
            { height: 718, type: "photo", url: "https://pbs.twimg.com/media/HTqoHBsagAAfCd6.jpg", width: 1200 },
            {
              height: 900,
              type: "video",
              url: "https://pbs.twimg.com/amplify_video_thumb/2113146608363683840/img/J2E7YifwdIcDqGUH.jpg",
              videoUrl: "https://video.twimg.com/amplify_video/2113146608363683840/vid/avc1/1600x900/x.mp4?tag=29",
              width: 1600,
            },
            { type: "animated_gif", url: "https://pbs.twimg.com/tweet_video_thumb/abc.jpg" },
            { type: "photo", url: "https://evil.example/x.jpg" },
            { type: "sticker", url: "https://pbs.twimg.com/media/s.jpg" },
          ],
        }),
      ])
    );
    expect(p.media).toEqual([
      { type: "photo", url: "https://pbs.twimg.com/media/HTqoHBsagAAfCd6.jpg", width: 1200, height: 718 },
      {
        type: "video",
        url: "https://pbs.twimg.com/amplify_video_thumb/2113146608363683840/img/J2E7YifwdIcDqGUH.jpg",
        width: 1600,
        height: 900,
      },
      { type: "gif", url: "https://pbs.twimg.com/tweet_video_thumb/abc.jpg", width: null, height: null },
    ]);
    // the first link stays; the trailing media link is removed, as on X
    expect(p.text).toBe("live at https://t.co/HlC3SrGOoI");
  });

  it("moves a reply's leading mentions to replyTo", () => {
    const [p] = normalizeSearch(
      anyapi([raw({ isReply: true, likeCount: 3, text: "@lasse_ai @MiaAI_lab I run GLM 5.3 Flash on @MiaAI_lab" })])
    );
    expect(p.replyTo).toEqual(["lasse_ai", "MiaAI_lab"]);
    expect(p.text).toBe("I run GLM 5.3 Flash on @MiaAI_lab");
    // a non-reply keeps its mentions in the text
    expect(normalizeSearch(anyapi([raw({ text: "@jane hi" })]))[0].text).toBe("@jane hi");
    // a reply that is only mentions keeps its text
    expect(splitReplyMentions("@a @b ")).toEqual({ replyTo: [], text: "@a @b " });
  });
});

describe("ranking", () => {
  it("drops non-English posts and replies with no engagement", () => {
    const out = selectPosts(
      [
        post({ id: "1", lang: "ja" }),
        post({ id: "2", lang: "" }),
        post({ id: "3", isReply: true, likeCount: 0 }),
        post({ id: "4", isReply: true, likeCount: 0, quoteCount: 1 }),
        post({ id: "5", likeCount: 2 }),
      ],
      NOW
    );
    expect(out.map((p) => p.id)).toEqual(["5", "4"]);
  });

  it("ranks by engagement, halving it for each week of age", () => {
    const out = selectPosts(
      [
        post({ id: "launch", likeCount: 4000, createdUtc: NOW - 28 * DAY }), // 4000 / 16 = 250
        post({ id: "fresh", likeCount: 300, createdUtc: NOW }), // 300
        post({ id: "week", likeCount: 200, retweetCount: 100, createdUtc: NOW - 7 * DAY }), // 400 / 2 = 200
        post({ id: "small", likeCount: 3, replyCount: 1, createdUtc: NOW }), // 4
      ],
      NOW
    );
    expect(out.map((p) => p.id)).toEqual(["fresh", "launch", "week", "small"]);
    expect(rankScore(post({ likeCount: 100, createdUtc: NOW - 7 * DAY }), NOW)).toBeCloseTo(50);
  });

  it("limits how many are sent", () => {
    const many = Array.from({ length: 30 }, (_, i) => post({ id: String(i), likeCount: i }));
    const out = selectPosts(many, NOW);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("29");
  });

  it("merges search steps without duplicates", () => {
    const merged = mergePosts([post({ id: "1" }), post({ id: "2" })], [post({ id: "2", likeCount: 9 }), post({ id: "3" })]);
    expect(merged.map((p) => [p.id, p.likeCount])).toEqual([
      ["1", 1],
      ["2", 1],
      ["3", 1],
    ]);
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
    expect(Object.keys(sentiment.criteria).sort()).toEqual(["negative", "neutral", "positive"]);
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
          sentiment__p2: { type: "choice", choice: "mixed" },
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
    expect(tallySentiment(shown)).toEqual({ positive: 3, neutral: 0, negative: 3 });
    const res = buildResult(shown, true, 123);
    expect(res.posts).toHaveLength(6);
    expect(res.counts.positive).toBe(3);
    expect(res.fetchedAt).toBe(123);
  });
});

describe("sentimentSummary", () => {
  it("gives whole percentages that add up to 100", () => {
    expect(sentimentSummary({ positive: 8, neutral: 3, negative: 2 })).toEqual({
      positivePct: 62,
      neutralPct: 23,
      negativePct: 15,
      n: 13,
    });
    const third = sentimentSummary({ positive: 1, neutral: 1, negative: 1 })!;
    expect(third.positivePct + third.neutralPct + third.negativePct).toBe(100);
    expect(sentimentSummary({ positive: 0, neutral: 0, negative: 0 })).toBeNull();
  });
});

describe("post lookups", () => {
  it("reads the quoted post from a real lookup response", () => {
    const l = parsePostLookup(lookupFixture);
    expect(l.replyTo).toBeNull();
    expect(l.links).toEqual([]);
    expect(l.quoted).toMatchObject({
      id: "2114031665899081732",
      url: "https://x.com/niklaslenz_ai/status/2114031665899081732",
      authorName: "Niklas",
      authorUsername: "niklaslenz_ai",
      authorImage: "https://pbs.twimg.com/profile_images/2108625696088113152/uVudOEyp_normal.jpg",
      authorVerified: true,
      createdUtc: Date.parse("Sat Oct 24 16:30:00 +0000 2026") / 1000,
    });
    expect(l.quoted!.text).toMatch(/^GLM-5.3-Flash on two DGX Sparks built this voxel sky kingdom/);
    expect(l.quoted!.media).toEqual([
      {
        type: "video",
        url: "https://pbs.twimg.com/amplify_video_thumb/2113960283324465152/img/m21V2tTJ8MhqSy0H.jpg",
        width: 1080,
        height: 1350,
      },
    ]);
  });

  it("reads the reply target and expanded links, and throws without data", () => {
    const l = parsePostLookup({
      data: {
        in_reply_to_screen_name: "TechMDAI",
        quoted: null,
        entities: {
          urls: [
            { url: "https://t.co/abc", expanded_url: "https://github.com/x/y", display_url: "github.com/x/y" },
            { url: "https://t.co/bad", expanded_url: "javascript:alert(1)" },
          ],
        },
      },
    });
    expect(l).toEqual({
      quoted: null,
      replyTo: "TechMDAI",
      links: [{ url: "https://t.co/abc", expanded: "https://github.com/x/y", display: "github.com/x/y" }],
    });
    expect(() => parsePostLookup({ detail: "nope" })).toThrow();
  });

  it("folds a lookup into a post", () => {
    const quotedLookup = parsePostLookup(lookupFixture);
    const p = applyLookup({ ...post({ text: "so good https://t.co/q1" }), sentiment: "positive" as const }, quotedLookup);
    expect(p.quoted?.id).toBe("2114031665899081732");
    expect(p.text).toBe("so good"); // the trailing link to the quoted post is hidden
    expect(p.sentiment).toBe("positive");

    const reply = applyLookup(post({ isReply: true, replyTo: [] }), { quoted: null, replyTo: "bob", links: [] });
    expect(reply.replyTo).toEqual(["bob"]);
    expect(applyLookup(post(), null)).toEqual(post());
  });
});

describe("display helpers", () => {
  it("links URLs and @mentions and keeps every character", () => {
    const text = "sick! @dxcode_dev btw: glm-5.3-flash https://t.co/AuDIJ7CrpL. mail a@b.co";
    const parts = splitPostText(text);
    expect(parts.map((p) => p.value).join("")).toBe(text);
    expect(parts.filter((p) => p.type !== "text")).toEqual([
      { type: "mention", value: "@dxcode_dev", href: "https://x.com/dxcode_dev" },
      { type: "url", value: "https://t.co/AuDIJ7CrpL", href: "https://t.co/AuDIJ7CrpL" },
    ]);
  });

  it("shows expanded links when a lookup supplied them", () => {
    const parts = splitPostText("repo: https://t.co/abc", [
      { url: "https://t.co/abc", expanded: "https://github.com/x/y", display: "github.com/x/y" },
    ]);
    expect(parts[1]).toEqual({ type: "url", value: "github.com/x/y", href: "https://github.com/x/y" });
  });

  it("handles a mention at the start and text with no links", () => {
    expect(splitPostText("@pwn4tv hi")[0]).toEqual({ type: "mention", value: "@pwn4tv", href: "https://x.com/pwn4tv" });
    expect(splitPostText("plain")).toEqual([{ type: "text", value: "plain" }]);
  });

  it("formats counts compactly", () => {
    expect(compactCount(41)).toBe("41");
    expect(compactCount(1234)).toBe("1.2K");
    expect(compactCount(1000)).toBe("1K");
    expect(compactCount(25_000)).toBe("25K");
    expect(compactCount(3_400_000)).toBe("3.4M");
  });

  it("formats post ages like X", () => {
    expect(postAge(NOW - 30, NOW)).toBe("30s");
    expect(postAge(NOW - 600, NOW)).toBe("10m");
    expect(postAge(NOW - 5 * 3600, NOW)).toBe("5h");
    expect(postAge(Date.parse("2026-10-03T12:00:00Z") / 1000, NOW)).toBe("Oct 3");
    expect(postAge(Date.parse("2025-10-03T12:00:00Z") / 1000, NOW)).toBe("Oct 3, 2025");
  });

  it("picks image sizes on X's host", () => {
    expect(avatarUrl("https://pbs.twimg.com/profile_images/1/a_normal.jpg")).toBe(
      "https://pbs.twimg.com/profile_images/1/a_bigger.jpg"
    );
    expect(mediaUrl("https://pbs.twimg.com/media/HTqoHBsagAAfCd6.jpg", "small")).toBe(
      "https://pbs.twimg.com/media/HTqoHBsagAAfCd6.jpg?name=small"
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("loadXPosts (no D1)", () => {
  const model = { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" };
  const many = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => raw({ id: String(1000 + from + i), likeCount: 100 - i - from }));
  const jevFor = (n: number, irrelevant: number[] = []) => ({
    answers: Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        [`about__p${i}`, { score: irrelevant.includes(i) ? 0.1 : 0.9 }],
        [`sentiment__p${i}`, { choice: i % 2 ? "negative" : "positive" }],
      ]).flat()
    ),
  });

  let searches: Array<{ query: string; queryType: string }>;
  let lookups: string[];

  function stubFetch({
    pages,
    jev,
    lookup = () => jsonResponse({ data: { quoted: null } }),
  }: {
    pages: Array<unknown[] | Error>;
    jev: () => Response;
    lookup?: (id: string) => Response;
  }) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SEARCH_URL) {
        expect((init!.headers as Record<string, string>)["X-Treg-Token"]).toBe("test-treg");
        const body = JSON.parse(init!.body as string);
        searches.push({ query: body.query, queryType: body.queryType });
        const page = pages[searches.length - 1] ?? [];
        if (page instanceof Error) return jsonResponse({}, 502);
        return jsonResponse(anyapi(page));
      }
      if (url.startsWith(`${LOOKUP_URL}?tweet_id=`)) {
        expect(init!.method).toBe("GET");
        const id = url.slice(url.indexOf("=") + 1);
        lookups.push(id);
        return lookup(id);
      }
      if (url === DECISIONS_URL) {
        expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-or");
        return jev();
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    resetXPostsMemoryCache();
    searches = [];
    lookups = [];
    vi.stubEnv("TREG_TOKEN", "test-treg");
    vi.stubEnv("OPENROUTER_API_KEY", "test-or");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("searches popular posts first and stops once there are enough", async () => {
    const fetchMock = stubFetch({ pages: [many(14)], jev: () => jsonResponse(jevFor(14, [1])) });
    const res = await loadXPosts(model);
    expect(searches).toEqual([
      { query: '("GLM 5.3 Flash" OR "glm-5.3-flash") min_faves:20 -is:retweet lang:en', queryType: "Top" },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scored).toBe(true);
    expect(res.posts).toHaveLength(6);
    expect(res.posts.map((p) => p.id)).not.toContain("1001"); // scored irrelevant
    expect(res.counts).toEqual({ positive: 7, neutral: 0, negative: 6 });
    // lookups for the shown posts only
    expect(lookups).toEqual(res.posts.map((p) => p.id));

    // cached: nothing else is fetched
    const calls = fetchMock.mock.calls.length;
    await loadXPosts(model);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("widens the search step by step when results are thin", async () => {
    stubFetch({ pages: [many(2), many(3, 2), many(2, 5), many(9, 7)], jev: () => jsonResponse(jevFor(16)) });
    const res = await loadXPosts(model);
    expect(searches.map((s) => `${s.queryType} ${s.query.match(/min_faves:\d+/)?.[0] ?? "-"}`)).toEqual([
      "Top min_faves:20",
      "Top min_faves:5",
      "Top -",
      "Latest -",
    ]);
    expect(res.ok && res.posts).toHaveLength(6);
  });

  it("keeps what it found when a later step fails", async () => {
    stubFetch({ pages: [many(3), new Error("down")], jev: () => jsonResponse(jevFor(3)) });
    const res = await loadXPosts(model);
    expect(searches).toHaveLength(2);
    expect(res.ok && res.posts.map((p) => p.id)).toEqual(["1000", "1001", "1002"]);
  });

  it("nests quoted posts and survives failed lookups", async () => {
    stubFetch({
      pages: [many(2)],
      jev: () => jsonResponse(jevFor(2)),
      lookup: (id) => (id === "1000" ? jsonResponse(lookupFixture) : jsonResponse({}, 500)),
    });
    const res = await loadXPosts(model);
    if (!res.ok) throw new Error("expected ok");
    expect(res.posts[0].quoted?.authorUsername).toBe("niklaslenz_ai");
    expect(res.posts[1].quoted).toBeNull();
  });

  it("shows posts unscored, without lookups, when Jev fails", async () => {
    stubFetch({ pages: [many(13)], jev: () => jsonResponse({ error: { message: "bad" } }, 400) });
    const res = await loadXPosts(model);
    if (!res.ok) throw new Error("expected ok");
    expect(res.scored).toBe(false);
    expect(res.posts.every((p) => p.sentiment === null)).toBe(true);
    expect(lookups).toEqual([]);
  });

  it("shows posts unscored without an OpenRouter key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = stubFetch({ pages: [many(13)], jev: () => jsonResponse({}) });
    const res = await loadXPosts(model);
    expect(res.ok && res.scored).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an error state, uncached, when the first search fails", async () => {
    stubFetch({ pages: [new Error("down")], jev: () => jsonResponse({}) });
    expect((await loadXPosts(model)).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    expect(await loadXPosts(model)).toEqual({ ok: false, error: "network down" });
    searches = [];
    stubFetch({ pages: [many(13)], jev: () => jsonResponse(jevFor(13)) });
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
    stubFetch({ pages: [[], [], [], []], jev: () => jsonResponse({}) });
    const res = await loadXPosts(model);
    expect(res.ok && res.posts).toEqual([]);
    expect(searches).toHaveLength(4);
    expect(panelTtl({ posts: [], scored: true })).toBe(12 * 3600);
    expect(panelTtl({ posts: [], scored: false })).toBe(12 * 3600);
    const one = buildResult([{ ...post(), sentiment: "positive" }], true, 0);
    expect(panelTtl(one)).toBe(12 * 3600);
    expect(panelTtl({ ...one, scored: false })).toBe(3600);
  });
});
