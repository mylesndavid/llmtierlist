/**
 * "What people are saying" panels for model pages and the /buzz feed.
 * Pure functions only (no I/O): query building, response normalization,
 * ranking, the Jev request and answer parsing, post lookups for quotes and
 * replies, sentiment summaries, and splitting post text into links.
 */

export type MediaType = "photo" | "video" | "gif";

export interface XMedia {
  type: MediaType;
  /** image URL on pbs.twimg.com: the photo itself, or a video's thumbnail */
  url: string;
  width: number | null;
  height: number | null;
}

/** A post quoted by another, as shown nested inside it. */
export interface QuotedPost {
  id: string;
  url: string;
  text: string;
  createdUtc: number | null;
  authorName: string;
  authorUsername: string;
  authorImage: string | null;
  authorVerified: boolean;
  media: XMedia[];
}

export interface PostLink {
  /** the t.co link as it appears in the text */
  url: string;
  expanded: string;
  display: string;
}

export interface XPost {
  id: string;
  url: string;
  /** text as X shows it: leading reply mentions and the trailing media link removed */
  text: string;
  createdUtc: number; // unix seconds
  lang: string;
  isReply: boolean;
  /** handles this post replies to ("Replying to @a"); [] for a non-reply */
  replyTo: string[];
  authorName: string;
  authorUsername: string;
  authorImage: string | null;
  authorVerified: boolean;
  authorFollowers: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number | null;
  media: XMedia[];
  /** filled by a post lookup for shown posts only */
  quoted: QuotedPost | null;
  links: PostLink[];
}

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface ShownPost extends XPost {
  /** null when Jev did not score this post */
  sentiment: Sentiment | null;
}

export interface XPanelResult {
  posts: ShownPost[]; // up to SHOW_COUNT, best first
  /** true when Jev scored the posts (relevance filtered, sentiment labeled) */
  scored: boolean;
  /** sentiment counts over every relevant scored post, not only those shown */
  counts: Record<Sentiment, number>;
  /** unix ms when the panel was fetched live */
  fetchedAt: number;
}

export const SEND_COUNT = 20;
export const SHOW_COUNT = 6;
export const ABOUT_MIN = 0.5;
/** Stop widening the search once this many usable posts are in hand. */
export const ENOUGH_CANDIDATES = 12;

export type QueryType = "Top" | "Latest";

export interface SearchStep {
  queryType: QueryType;
  minFaves: number | null;
}

/** Popular posts first, then widen: fewer likes required, then no minimum, then newest. */
export const SEARCH_LADDER: SearchStep[] = [
  { queryType: "Top", minFaves: 20 },
  { queryType: "Top", minFaves: 5 },
  { queryType: "Top", minFaves: null },
  { queryType: "Latest", minFaves: null },
];

/** `("GLM 5.3 Flash" OR "glm-5.3-flash") min_faves:20 -is:retweet lang:en` */
export function buildQuery(displayName: string, modelId: string, minFaves: number | null = null): string {
  const clean = (s: string) => s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const name = clean(displayName);
  const tail = clean(modelId.slice(modelId.lastIndexOf("/") + 1).replace(/:.*$/, ""));
  const terms = [name];
  if (tail && tail.toLowerCase() !== name.toLowerCase()) terms.push(tail);
  const quoted = terms.filter(Boolean).map((t) => `"${t}"`);
  const core = quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
  const faves = minFaves ? ` min_faves:${minFaves}` : "";
  return `${core}${faves} -is:retweet lang:en`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const count = (v: unknown): number => {
  const n = num(v);
  return n != null && n > 0 ? n : 0;
};
const isId = (v: string | null): v is string => v != null && /^\d{1,25}$/.test(v);
const isHandle = (v: string | null): v is string => v != null && /^\w{1,50}$/.test(v);
const twimg = (v: unknown): string | null => {
  const s = str(v);
  return s && s.startsWith("https://pbs.twimg.com/") ? s : null;
};

/** X returns text with &amp; &lt; &gt; escaped; show the characters themselves. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const MEDIA_TYPES: Record<string, MediaType> = {
  photo: "photo",
  video: "video",
  animated_gif: "gif",
  gif: "gif",
};

/**
 * Search-result media: `[{type: "photo"|"video"|"animated_gif", url, width, height, videoUrl?}]`,
 * where `url` is the photo or the video thumbnail. Only pbs.twimg.com images are kept.
 */
export function normalizeMedia(raw: unknown): XMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: XMedia[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const type = MEDIA_TYPES[String(r.type)];
    const url = twimg(r.url) ?? twimg(r.media_url_https);
    if (!type || !url) continue;
    out.push({ type, url, width: num(r.width), height: num(r.height) });
  }
  return out.slice(0, 4);
}

/**
 * Lookup media: `{photo: [...], video: [...], animated_gif: [...]}` with
 * `media_url_https` and `original_info: {width, height}` per item.
 */
function normalizeLookupMedia(raw: unknown): XMedia[] {
  if (Array.isArray(raw)) return normalizeMedia(raw);
  if (!raw || typeof raw !== "object") return [];
  const out: XMedia[] = [];
  for (const [key, items] of Object.entries(raw as Record<string, unknown>)) {
    const type = MEDIA_TYPES[key];
    if (!type || !Array.isArray(items)) continue;
    for (const m of items) {
      if (!m || typeof m !== "object") continue;
      const r = m as Record<string, unknown>;
      const url = twimg(r.media_url_https) ?? twimg(r.url);
      if (!url) continue;
      const info = (r.original_info ?? {}) as Record<string, unknown>;
      out.push({ type, url, width: num(info.width ?? r.width), height: num(info.height ?? r.height) });
    }
  }
  return out.slice(0, 4);
}

const TRAILING_TCO = /\s*https:\/\/t\.co\/\w+\s*$/;

/** Leading @mentions of a reply, which X shows as "Replying to" instead of in the text. */
export function splitReplyMentions(text: string): { replyTo: string[]; text: string } {
  const m = text.match(/^(?:@\w{1,15}\s+)+/);
  if (!m) return { replyTo: [], text };
  const replyTo = [...m[0].matchAll(/@(\w{1,15})/g)].map((x) => x[1]);
  const rest = text.slice(m[0].length);
  return rest.trim() ? { replyTo, text: rest } : { replyTo: [], text };
}

function normalizePost(raw: unknown): XPost | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "number" ? String(p.id) : str(p.id);
  const rawText = str(p.text);
  const handle = str(p.authorUsername);
  const created = num(p.createdUtc);
  if (!isId(id) || !rawText || !isHandle(handle) || created == null) return null;

  const media = normalizeMedia(p.media);
  const isReply = p.isReply === true;
  let text = decodeEntities(rawText);
  let replyTo: string[] = [];
  if (isReply) ({ replyTo, text } = splitReplyMentions(text));
  // X hides the t.co link that points at a post's own media
  if (media.length > 0) text = text.replace(TRAILING_TCO, "");

  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    text,
    createdUtc: created,
    lang: str(p.lang) ?? "",
    isReply,
    replyTo,
    authorName: str(p.authorName) ?? handle,
    authorUsername: handle,
    // only X's own image host; anything else falls back to initials
    authorImage: twimg(p.authorImage),
    authorVerified: p.authorVerified === true,
    authorFollowers: count(p.authorFollowers),
    likeCount: count(p.likeCount),
    retweetCount: count(p.retweetCount),
    replyCount: count(p.replyCount),
    quoteCount: count(p.quoteCount),
    viewCount: num(p.viewCount),
    media,
    quoted: null,
    links: [],
  };
}

/**
 * Posts from an X search response. Accepts AnyAPI's shape
 * (`output.data.items`, with `output.found: false` on a miss) and treg's
 * routed shape (`output.posts`, null with `_treg.outcome: "miss"` on a miss).
 * Any other response throws. Posts missing an id, text, handle or time are skipped.
 */
export function normalizeSearch(json: unknown): XPost[] {
  const body = json as
    | { output?: { posts?: unknown; data?: { items?: unknown } | null; found?: unknown }; _treg?: { outcome?: unknown } }
    | null;
  const output = body?.output;
  let items: unknown;
  if (output && Array.isArray(output.data?.items)) items = output.data!.items;
  else if (output && Array.isArray(output.posts)) items = output.posts;
  else if (output && output.found === false) return [];
  else if (output && output.posts == null && body?._treg?.outcome === "miss") return [];
  else throw new Error("search response has no posts");

  const seen = new Set<string>();
  const out: XPost[] = [];
  for (const raw of items as unknown[]) {
    const p = normalizePost(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function engagement(p: XPost): number {
  return p.likeCount + 2 * p.retweetCount + p.replyCount + p.quoteCount;
}

/** Engagement halves for every week of age. */
export const HALF_LIFE_DAYS = 7;

export function rankScore(p: XPost, nowS: number): number {
  const ageDays = Math.max(0, (nowS - p.createdUtc) / 86400);
  return engagement(p) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** English posts that are not zero-engagement replies. */
export function usablePosts(posts: XPost[]): XPost[] {
  return posts
    .filter((p) => p.lang === "en")
    .filter((p) => !(p.isReply && engagement(p) === 0));
}

/** Rank usable posts by engagement weighted by recency, best first. */
export function selectPosts(posts: XPost[], nowS: number, limit = SEND_COUNT): XPost[] {
  return usablePosts(posts)
    .map((p) => ({ p, s: rankScore(p, nowS) }))
    .sort((a, b) => b.s - a.s || b.p.createdUtc - a.p.createdUtc)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Add posts from a later search step, keeping the first copy of each id. */
export function mergePosts(have: XPost[], more: XPost[]): XPost[] {
  const ids = new Set(have.map((p) => p.id));
  return [...have, ...more.filter((p) => !ids.has(p.id) && ids.add(p.id))];
}

export const JEV_MODEL = "~typesafe/jev-latest";

/**
 * Body for OpenRouter's decisions endpoint. A score question's two criteria
 * anchor 0 and 1; a choice question's criteria map each choice to its meaning.
 */
export function buildJevRequest(modelLabel: string, posts: XPost[]) {
  const state: { model: string; posts: Record<string, { text: string; author: string }> } = {
    model: modelLabel,
    posts: {},
  };
  const questions: Record<string, unknown> = {};
  posts.forEach((p, i) => {
    const key = `p${i}`;
    state.posts[key] = { text: p.text, author: `@${p.authorUsername}` };
    questions[`about__${key}`] = {
      type: "score",
      instructions: `Is posts.${key} about the AI language model named in state.model, not a different product or model with a similar name?`,
      criteria: [
        "Not about this AI model: it is about a different product, person or model with a similar name, or the name is a coincidence",
        "About this AI model: it discusses, uses, reviews or reports news about the model named in state.model",
      ],
    };
    questions[`sentiment__${key}`] = {
      type: "choice",
      instructions: `What does posts.${key} say about the model in state.model?`,
      criteria: {
        positive: "Praises the model or reports a good experience with it",
        negative: "Criticizes the model or reports a bad experience with it",
        neutral:
          "Mentions the model without clearly praising or criticizing it, such as news or availability, or weighs praise and criticism about equally",
      },
    };
  });
  return { model: JEV_MODEL, state, questions };
}

/**
 * Apply Jev's answers to the posts sent (same order as buildJevRequest).
 * Posts scored below ABOUT_MIN are dropped. A post with no usable about
 * score is kept; a missing or unknown choice leaves its sentiment null.
 * Throws when the response has no answers object at all.
 */
export function applyJevAnswers(json: unknown, posts: XPost[]): ShownPost[] {
  const answers = (json as { answers?: unknown } | null)?.answers;
  if (!answers || typeof answers !== "object") throw new Error("decisions response has no answers");
  const a = answers as Record<string, { score?: unknown; choice?: unknown } | undefined>;
  const out: ShownPost[] = [];
  posts.forEach((p, i) => {
    const score = a[`about__p${i}`]?.score;
    if (typeof score === "number" && Number.isFinite(score) && score < ABOUT_MIN) return;
    const choice = a[`sentiment__p${i}`]?.choice;
    out.push({
      ...p,
      sentiment: SENTIMENTS.includes(choice as Sentiment) ? (choice as Sentiment) : null,
    });
  });
  return out;
}

export function tallySentiment(posts: ShownPost[]): Record<Sentiment, number> {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const p of posts) if (p.sentiment) counts[p.sentiment]++;
  return counts;
}

export function buildResult(posts: ShownPost[], scored: boolean, fetchedAt: number): XPanelResult {
  return { posts: posts.slice(0, SHOW_COUNT), scored, counts: tallySentiment(posts), fetchedAt };
}

export interface SentimentSummary {
  positivePct: number;
  neutralPct: number;
  negativePct: number;
  /** relevant posts with a sentiment label */
  n: number;
}

/** Whole percentages that add up to 100 (largest remainder). */
export function sentimentSummary(counts: Record<Sentiment, number>): SentimentSummary | null {
  const n = SENTIMENTS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (n === 0) return null;
  const exact = SENTIMENTS.map((k) => ((counts[k] ?? 0) / n) * 100);
  const pct = exact.map(Math.floor);
  let left = 100 - pct.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    pct[i]++;
    left--;
  }
  return { positivePct: pct[0], neutralPct: pct[1], negativePct: pct[2], n };
}

export interface PostLookup {
  quoted: QuotedPost | null;
  /** handle of the post replied to, when X reports one */
  replyTo: string | null;
  links: PostLink[];
}

function twitterDate(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function normalizeLinks(entities: unknown): PostLink[] {
  const urls = (entities as { urls?: unknown } | null)?.urls;
  if (!Array.isArray(urls)) return [];
  const out: PostLink[] = [];
  for (const u of urls) {
    const r = (u ?? {}) as Record<string, unknown>;
    const url = str(r.url);
    const expanded = str(r.expanded_url);
    if (!url || !url.startsWith("https://t.co/") || !expanded || !/^https?:\/\//.test(expanded)) continue;
    out.push({ url, expanded, display: str(r.display_url) ?? expanded.replace(/^https?:\/\/(www\.)?/, "") });
  }
  return out;
}

/**
 * A post-detail lookup (TikHub's tweet detail, as served through treg):
 * `data.quoted` holds the quoted post with `tweet_id`, `text`, `created_at`,
 * `author: {name, screen_name, avatar, blue_verified}` and `media`;
 * `data.in_reply_to_screen_name` names the post replied to;
 * `data.entities.urls` expands t.co links. Throws when there is no `data`.
 */
export function parsePostLookup(json: unknown): PostLookup {
  const data = (json as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") throw new Error("post lookup has no data");
  const d = data as Record<string, unknown>;
  const replyHandle = str(d.in_reply_to_screen_name);
  const lookup: PostLookup = {
    quoted: null,
    replyTo: isHandle(replyHandle) ? replyHandle : null,
    links: normalizeLinks(d.entities),
  };
  const q = d.quoted as Record<string, unknown> | null | undefined;
  if (q && typeof q === "object") {
    const id = str(q.tweet_id) ?? str(q.id) ?? (typeof q.id === "number" ? String(q.id) : null);
    const author = (q.author ?? {}) as Record<string, unknown>;
    const handle = str(author.screen_name);
    const text = str(q.text);
    if (isId(id) && isHandle(handle) && text) {
      const media = normalizeLookupMedia(q.media);
      let shown = decodeEntities(text);
      if (media.length > 0) shown = shown.replace(TRAILING_TCO, "");
      lookup.quoted = {
        id,
        url: `https://x.com/${handle}/status/${id}`,
        text: shown,
        createdUtc: twitterDate(q.created_at),
        authorName: str(author.name) ?? handle,
        authorUsername: handle,
        authorImage: twimg(author.avatar) ?? twimg(author.image),
        authorVerified: author.blue_verified === true || author.verified === true,
        media,
      };
    }
  }
  return lookup;
}

/** Fold a lookup into a shown post. */
export function applyLookup<T extends XPost>(post: T, lookup: PostLookup | null): T {
  if (!lookup) return post;
  let text = post.text;
  // X hides the trailing link to the quoted post
  if (lookup.quoted) text = text.replace(TRAILING_TCO, "") || post.text;
  const replyTo = post.replyTo.length === 0 && post.isReply && lookup.replyTo ? [lookup.replyTo] : post.replyTo;
  return { ...post, text, replyTo, quoted: lookup.quoted, links: lookup.links };
}

export type TextPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string; href: string }
  | { type: "mention"; value: string; href: string };

/**
 * Split post text into plain text, links and @mentions, keeping every
 * character as written. A t.co link with a known expansion shows its
 * display form and links to the expanded URL.
 */
export function splitPostText(text: string, links: PostLink[] = []): TextPart[] {
  const known = new Map(links.map((l) => [l.url, l]));
  const re = /(https?:\/\/[^\s<>"`]+)|(^|[^\w@])@(\w{1,15})\b/g;
  const parts: TextPart[] = [];
  let last = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = parts[parts.length - 1];
    if (prev?.type === "text") prev.value += s;
    else parts.push({ type: "text", value: s });
  };
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    if (m[1]) {
      // leave trailing punctuation outside the link
      const url = m[1].replace(/[.,!?;:)\]'’]+$/, "");
      pushText(text.slice(last, start));
      const link = known.get(url);
      parts.push(link ? { type: "url", value: link.display, href: link.expanded } : { type: "url", value: url, href: url });
      last = start + url.length;
      re.lastIndex = last;
    } else {
      const lead = m[2];
      const handle = m[3];
      pushText(text.slice(last, start) + lead);
      parts.push({ type: "mention", value: `@${handle}`, href: `https://x.com/${handle}` });
      last = start + lead.length + 1 + handle.length;
    }
  }
  pushText(text.slice(last));
  return parts;
}

/** 1234 -> "1.2K" */
export function compactCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** X-style post age: "45s", "12m", "3h", then "Oct 3", then "Oct 3, 2025" in another year. */
export function postAge(createdUtc: number, nowS: number): string {
  const s = Math.max(0, nowS - createdUtc);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(createdUtc * 1000);
  const now = new Date(nowS * 1000);
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? day : `${day}, ${d.getUTCFullYear()}`;
}

/** Bigger avatar variant on X's image host: _normal is 48px, _bigger 73px. */
export function avatarUrl(url: string | null): string | null {
  return url ? url.replace(/_normal(\.\w+)$/, "_bigger$1") : null;
}

/** A pbs.twimg.com media image at a named size ("small" ~680px, "large" ~2048px). */
export function mediaUrl(url: string, size: "small" | "medium" | "large"): string {
  if (!url.startsWith("https://pbs.twimg.com/media/") && !url.includes("_thumb/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}name=${size}`;
}
