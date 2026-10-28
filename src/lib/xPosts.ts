/**
 * "What people say on X" for model pages. Pure functions only (no I/O):
 * query building, response normalization, selection, the Jev request and
 * answer parsing, and splitting post text into links for display.
 */

export interface XPost {
  id: string;
  url: string;
  text: string;
  createdUtc: number; // unix seconds
  lang: string;
  isReply: boolean;
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
}

export const SENTIMENTS = ["positive", "mixed", "neutral", "negative"] as const;
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
}

export const SEND_COUNT = 20;
export const SHOW_COUNT = 6;
export const ABOUT_MIN = 0.5;

/** `("GLM 5.3 Flash" OR "glm-5.3-flash") -is:retweet lang:en` */
export function buildQuery(displayName: string, modelId: string): string {
  const clean = (s: string) => s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const name = clean(displayName);
  const tail = clean(modelId.slice(modelId.lastIndexOf("/") + 1).replace(/:.*$/, ""));
  const terms = [name];
  if (tail && tail.toLowerCase() !== name.toLowerCase()) terms.push(tail);
  const quoted = terms.filter(Boolean).map((t) => `"${t}"`);
  const core = quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
  return `${core} -is:retweet lang:en`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** X returns text with &amp; &lt; &gt; escaped; show the characters themselves. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizePost(raw: unknown): XPost | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "number" ? String(p.id) : str(p.id);
  const text = str(p.text);
  const handle = str(p.authorUsername);
  const created = typeof p.createdUtc === "number" && Number.isFinite(p.createdUtc) ? p.createdUtc : null;
  if (!id || !/^\d+$/.test(id) || !text || !handle || !/^\w{1,50}$/.test(handle) || created == null) {
    return null;
  }
  const image = str(p.authorImage);
  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    text: decodeEntities(text),
    createdUtc: created,
    lang: str(p.lang) ?? "",
    isReply: p.isReply === true,
    authorName: str(p.authorName) ?? handle,
    authorUsername: handle,
    // only X's own image host; anything else falls back to initials
    authorImage: image && image.startsWith("https://pbs.twimg.com/") ? image : null,
    authorVerified: p.authorVerified === true,
    authorFollowers: count(p.authorFollowers),
    likeCount: count(p.likeCount),
    retweetCount: count(p.retweetCount),
    replyCount: count(p.replyCount),
    quoteCount: count(p.quoteCount),
    viewCount: typeof p.viewCount === "number" && Number.isFinite(p.viewCount) ? p.viewCount : null,
  };
}

/**
 * Posts from a treg search response. A miss is []: either `output.posts` is
 * an empty array, or (as treg actually answers when every provider misses)
 * `output.posts` is null with `_treg.outcome: "miss"`. Any other response
 * without a posts array is not a search result and throws.
 * Posts missing an id, text, author handle or time are skipped.
 */
export function normalizeSearch(json: unknown): XPost[] {
  const body = json as { output?: { posts?: unknown }; _treg?: { outcome?: unknown } } | null;
  const output = body?.output;
  if (output && output.posts == null && body?._treg?.outcome === "miss") return [];
  if (!output || !Array.isArray(output.posts)) throw new Error("search response has no output.posts");
  const seen = new Set<string>();
  const out: XPost[] = [];
  for (const raw of output.posts) {
    const p = normalizePost(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function engagement(p: XPost): number {
  return p.likeCount + 2 * p.retweetCount + p.replyCount;
}

/** Up to 5 extra points for a new post, falling to 0 at a week old. */
export function recencyBoost(p: XPost, nowS: number): number {
  const ageH = Math.max(0, (nowS - p.createdUtc) / 3600);
  return 5 * Math.max(0, 1 - ageH / (24 * 7));
}

/**
 * Drop non-English posts and replies nobody engaged with, then rank by
 * likes + 2×reposts + replies plus a small recency boost.
 */
export function selectPosts(posts: XPost[], nowS: number, limit = SEND_COUNT): XPost[] {
  return posts
    .filter((p) => p.lang === "en")
    .filter((p) => !(p.isReply && p.likeCount + p.retweetCount + p.replyCount + p.quoteCount === 0))
    .map((p) => ({ p, s: engagement(p) + recencyBoost(p, nowS) }))
    .sort((a, b) => b.s - a.s || b.p.createdUtc - a.p.createdUtc)
    .slice(0, limit)
    .map((x) => x.p);
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
        mixed: "Has both praise and criticism of the model",
        neutral: "Mentions the model without judging it, such as news or availability",
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
  const counts = { positive: 0, mixed: 0, neutral: 0, negative: 0 };
  for (const p of posts) if (p.sentiment) counts[p.sentiment]++;
  return counts;
}

export function buildResult(posts: ShownPost[], scored: boolean): XPanelResult {
  return { posts: posts.slice(0, SHOW_COUNT), scored, counts: tallySentiment(posts) };
}

export type TextPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string; href: string }
  | { type: "mention"; value: string; href: string };

/** Split post text into plain text, links and @mentions, keeping every character as written. */
export function splitPostText(text: string): TextPart[] {
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
      parts.push({ type: "url", value: url, href: url });
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
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}
