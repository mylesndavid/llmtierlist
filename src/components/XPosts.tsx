import Link from "next/link";
import { loadXPosts } from "@/lib/xPostsData";
import { SENTIMENTS, sentimentSummary, type Sentiment } from "@/lib/xPosts";
import XPostCard from "./XPostCard";
import { SENTIMENT_STYLE } from "./sentimentStyle";

export function SentimentSummaryBar({ counts }: { counts: Record<Sentiment, number> }) {
  const s = sentimentSummary(counts);
  if (!s) return null;
  const pct: Record<Sentiment, number> = {
    positive: s.positivePct,
    neutral: s.neutralPct,
    negative: s.negativePct,
  };
  const label = SENTIMENTS.map((k) => `${pct[k]}% ${k}`).join(" · ");
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-2" role="img" aria-label={label}>
        {SENTIMENTS.map((k) =>
          counts[k] > 0 ? (
            <span key={k} style={{ width: `${(counts[k] / s.n) * 100}%`, backgroundColor: SENTIMENT_STYLE[k].color }} />
          ) : null
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {SENTIMENTS.map((k, i) => (
          <span key={k} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-muted" aria-hidden>
                ·
              </span>
            )}
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENTIMENT_STYLE[k].color }} aria-hidden />
            {pct[k]}% {k}
          </span>
        ))}
        <span className="text-xs text-muted">
          (based on {s.n} {s.n === 1 ? "post" : "posts"})
        </span>
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby="x-posts-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="x-posts-heading" className="text-xl font-bold">
          What people are saying
        </h2>
        <Link href="/buzz" className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
          Posts about other models
        </Link>
      </div>
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
          <div key={i} className="h-[27rem] animate-pulse rounded-sm border border-edge bg-surface" />
        ))}
      </div>
    </Shell>
  );
}

/** Streams in under Suspense; never blocks or breaks the model page. */
export default async function XPosts({ model }: { model: { id: string; name: string } }) {
  const res = await loadXPosts(model);
  // Ages are computed against the render time so server and client markup match.
  // eslint-disable-next-line react-hooks/purity
  const nowS = Math.floor(Date.now() / 1000);
  return (
    <Shell>
      {!res.ok ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">
          Posts from X are unavailable right now.
        </p>
      ) : res.posts.length === 0 ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">No recent posts found.</p>
      ) : (
        <>
          {res.scored ? (
            <SentimentSummaryBar counts={res.counts} />
          ) : (
            <p className="text-xs text-muted">Sentiment is unavailable right now. Posts are not filtered for relevance.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {res.posts.map((p) => (
              <XPostCard key={p.id} post={p} nowS={nowS} />
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
