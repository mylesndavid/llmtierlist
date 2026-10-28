import type { Metadata } from "next";
import { after } from "next/server";
import { loadBuzz } from "@/lib/buzzData";
import { fillPanels } from "@/lib/xPostsData";
import { SENTIMENTS, type Sentiment } from "@/lib/xPosts";
import BuzzFeed from "@/components/BuzzFeed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What people are saying",
  description: "Popular recent posts on X about the most-used AI models on OpenRouter, with sentiment.",
};

/** Cold panels to search per page view, two at a time, after the response is sent. */
const FILL_PER_REQUEST = 4;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function BuzzPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[]; sentiment?: string | string[] }>;
}) {
  const [params, buzz] = await Promise.all([searchParams, loadBuzz()]);

  // The page renders from stored panels only. Models without a fresh panel
  // are searched and scored in the background, a few per view, and appear
  // on a later visit.
  if (buzz.toFill.length > 0) {
    const toFill = buzz.toFill.map((m) => ({ id: m.id, name: m.name }));
    after(() => fillPanels(toFill, { concurrency: 2, max: FILL_PER_REQUEST }));
  }

  // eslint-disable-next-line react-hooks/purity
  const nowS = Math.floor(Date.now() / 1000);
  const sentiment = SENTIMENTS.includes(one(params.sentiment) as Sentiment) ? (one(params.sentiment) as Sentiment) : "all";
  const model = buzz.models.some((m) => m.id === one(params.model)) ? one(params.model) : "";
  const withPosts = new Set(buzz.items.map((it) => it.modelId)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">What people are saying</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Popular recent posts on X about the {buzz.models.length || 30} most-used models on OpenRouter this week,
          ranked by likes, reposts and replies, with newer posts weighted higher. Jev filters out posts that are not
          about the model and labels each one positive, neutral or negative.
        </p>
      </div>

      {buzz.models.length === 0 ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">
          Usage rankings are unavailable right now, so there is no model list to show posts for.
        </p>
      ) : (
        <>
          {buzz.missing > 0 && (
            <p className="text-xs text-muted">
              Showing posts for {withPosts} of {buzz.models.length} models. Posts for the rest are being collected and
              will show up on later visits.
            </p>
          )}
          <BuzzFeed
            models={buzz.models.map((m) => ({ id: m.id, name: m.name, href: m.slug ? `/models/${m.slug}` : null }))}
            items={buzz.items}
            nowS={nowS}
            initialModel={model}
            initialSentiment={sentiment}
          />
        </>
      )}

      <p className="text-xs text-muted">
        Posts via{" "}
        <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          X
        </a>
        ; sentiment by Jev; usage rankings from{" "}
        <a href="https://openrouter.ai/rankings" className="underline hover:text-foreground">
          OpenRouter
        </a>
        .
      </p>
    </div>
  );
}
