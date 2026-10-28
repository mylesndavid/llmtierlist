/* eslint-disable @next/next/no-img-element */
import TimeAgo from "./TimeAgo";
import { loadXPosts } from "@/lib/xPostsData";
import {
  SENTIMENTS,
  compactCount,
  splitPostText,
  type Sentiment,
  type ShownPost,
} from "@/lib/xPosts";

const SENTIMENT_STYLE: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "Positive", color: "#7fff7f" },
  mixed: { label: "Mixed", color: "#ffdf80" },
  neutral: { label: "Neutral", color: "#9a9a9a" },
  negative: { label: "Negative", color: "#ff7f7e" },
};

function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Verified account" role="img" className="h-4 w-4 shrink-0" fill="#1d9bf0">
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  );
}

const ICONS = {
  reply: "M1.75 10c0-4.42 3.58-8 8-8h4.37c4.42 0 8.13 3.58 8.13 8s-3.58 8-8 8H14v3.5l-1.6-.97C7.7 17.7 1.75 14.9 1.75 10zm8-6c-3.31 0-6 2.69-6 6 0 3.36 4.58 5.7 8.25 7.86V16h2.12c3.31 0 6-2.69 6-6s-2.83-6-6.13-6H9.75z",
  repost:
    "M4.5 3.88l4.43 4.14-1.36 1.46L5.5 7.55V16c0 1.1.9 2 2 2H13v2H7.5c-2.21 0-4-1.79-4-4V7.55L1.43 9.48.07 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.21 0 4 1.79 4 4v8.45l2.07-1.93 1.36 1.46-4.43 4.14-4.43-4.14 1.36-1.46 2.07 1.93V8c0-1.1-.9-2-2-2z",
  like: "M16.7 3.5c-1.75 0-3.32.88-4.2 2.24C11.6 4.38 10.04 3.5 8.3 3.5 5.53 3.5 3.25 5.84 3.25 8.75c0 5.93 8.75 11.45 8.75 11.45s8.75-5.52 8.75-11.45c0-2.91-2.28-5.25-5.05-5.25z",
};

function Stat({ icon, n, label }: { icon: keyof typeof ICONS; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1" title={`${n.toLocaleString("en-US")} ${label}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="currentColor">
        <path d={ICONS[icon]} />
      </svg>
      <span aria-label={`${n} ${label}`}>{compactCount(n)}</span>
    </span>
  );
}

function PostText({ text }: { text: string }) {
  return (
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
      {splitPostText(text).map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-[#1d9bf0] hover:underline"
          >
            {part.value}
          </a>
        )
      )}
    </p>
  );
}

function PostCard({ post }: { post: ShownPost }) {
  const profile = `https://x.com/${post.authorUsername}`;
  const style = post.sentiment ? SENTIMENT_STYLE[post.sentiment] : null;
  return (
    <article className="flex min-w-0 flex-col rounded-sm border border-edge bg-surface p-3">
      <header className="flex items-start gap-2.5">
        <a href={profile} target="_blank" rel="noopener noreferrer" className="shrink-0" tabIndex={-1} aria-hidden>
          {post.authorImage ? (
            <img
              src={post.authorImage}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-full bg-surface-2 object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-sm font-bold uppercase text-muted">
              {post.authorName.slice(0, 1)}
            </span>
          )}
        </a>
        <div className="min-w-0 flex-1 leading-tight">
          <a
            href={profile}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1 hover:underline"
          >
            <span className="truncate text-sm font-semibold">{post.authorName}</span>
            {post.authorVerified && <VerifiedBadge />}
          </a>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <a href={profile} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
              @{post.authorUsername}
            </a>
            <span aria-hidden>·</span>
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:underline">
              <TimeAgo iso={new Date(post.createdUtc * 1000).toISOString()} />
            </a>
          </p>
        </div>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open this post on X"
          className="shrink-0 text-foreground hover:text-muted"
        >
          <XLogo />
        </a>
      </header>

      <PostText text={post.text} />

      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-xs text-muted">
        <Stat icon="reply" n={post.replyCount} label="replies" />
        <Stat icon="repost" n={post.retweetCount} label="reposts" />
        <Stat icon="like" n={post.likeCount} label="likes" />
        {style && (
          <span className="flex items-center gap-1" title="Sentiment by Jev">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
            {style.label}
          </span>
        )}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-foreground hover:underline"
        >
          View on X
        </a>
      </footer>
    </article>
  );
}

function SentimentBar({ counts }: { counts: Record<Sentiment, number> }) {
  const total = SENTIMENTS.reduce((s, k) => s + counts[k], 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <div
        className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-2"
        role="img"
        aria-label={SENTIMENTS.map((k) => `${counts[k]} ${k}`).join(", ")}
      >
        {SENTIMENTS.map((k) =>
          counts[k] > 0 ? (
            <span
              key={k}
              style={{ width: `${(counts[k] / total) * 100}%`, backgroundColor: SENTIMENT_STYLE[k].color }}
            />
          ) : null
        )}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {SENTIMENTS.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENTIMENT_STYLE[k].color }} aria-hidden />
            {SENTIMENT_STYLE[k].label} {counts[k]}
          </span>
        ))}
        <span>of {total} relevant posts</span>
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby="x-posts-heading">
      <h2 id="x-posts-heading" className="text-xl font-bold">
        What people say on X
      </h2>
      {children}
    </section>
  );
}

export function XPostsSkeleton() {
  return (
    <Shell>
      <div className="h-2 w-full animate-pulse rounded-sm bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-sm border border-edge bg-surface" />
        ))}
      </div>
    </Shell>
  );
}

/** Streams in under Suspense; never blocks or breaks the model page. */
export default async function XPosts({ model }: { model: { id: string; name: string } }) {
  const res = await loadXPosts(model);
  return (
    <Shell>
      {!res.ok ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">
          Posts from X are unavailable right now.
        </p>
      ) : res.posts.length === 0 ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">
          No recent posts found.
        </p>
      ) : (
        <>
          {res.scored ? (
            <SentimentBar counts={res.counts} />
          ) : (
            <p className="text-xs text-muted">Sentiment is unavailable right now. Posts are not filtered for relevance.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {res.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted">
        Posts via{" "}
        <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          X
        </a>
        ; sentiment by Jev.
      </p>
    </Shell>
  );
}
