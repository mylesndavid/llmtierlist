"use client";

import { useMemo, useState } from "react";
import { SENTIMENTS, type Sentiment, type ShownPost } from "@/lib/xPosts";
import XPostCard from "./XPostCard";
import { SENTIMENT_STYLE } from "./sentimentStyle";

export interface FeedModel {
  id: string;
  name: string;
  href: string | null;
}

export interface FeedItem {
  modelId: string;
  post: ShownPost;
}

type SentimentFilter = Sentiment | "all";

function syncUrl(model: string, sentiment: SentimentFilter) {
  const params = new URLSearchParams(window.location.search);
  if (model) params.set("model", model);
  else params.delete("model");
  if (sentiment !== "all") params.set("sentiment", sentiment);
  else params.delete("sentiment");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export default function BuzzFeed({
  models,
  items,
  nowS,
  initialModel,
  initialSentiment,
}: {
  models: FeedModel[];
  items: FeedItem[];
  nowS: number;
  initialModel: string;
  initialSentiment: SentimentFilter;
}) {
  const [model, setModel] = useState(initialModel);
  const [sentiment, setSentiment] = useState<SentimentFilter>(initialSentiment);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const perModel = useMemo(() => {
    const n = new Map<string, number>();
    for (const it of items) n.set(it.modelId, (n.get(it.modelId) ?? 0) + 1);
    return n;
  }, [items]);

  const forModel = model ? items.filter((it) => it.modelId === model) : items;
  const counts = { all: forModel.length, positive: 0, neutral: 0, negative: 0 };
  for (const it of forModel) if (it.post.sentiment) counts[it.post.sentiment]++;
  const shown = sentiment === "all" ? forModel : forModel.filter((it) => it.post.sentiment === sentiment);

  const pick = (m: string, s: SentimentFilter) => {
    setModel(m);
    setSentiment(s);
    syncUrl(m, s);
  };

  const chip = (s: SentimentFilter, label: string) => (
    <button
      key={s}
      type="button"
      aria-pressed={sentiment === s}
      onClick={() => pick(model, s)}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        sentiment === s ? "border-foreground bg-foreground text-background" : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {s !== "all" && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENTIMENT_STYLE[s].color }} aria-hidden />
      )}
      {label} <span className="tabular-nums opacity-70">{counts[s]}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted">Model</span>
          <select
            value={model}
            onChange={(e) => pick(e.target.value, sentiment)}
            className="min-w-0 flex-1 rounded-sm border border-edge bg-surface px-2 py-1.5 text-sm sm:max-w-xs"
          >
            <option value="">All models ({items.length})</option>
            {models
              .filter((m) => perModel.has(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({perModel.get(m.id)})
                </option>
              ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sentiment">
          {chip("all", "All")}
          {SENTIMENTS.map((s) => chip(s, SENTIMENT_STYLE[s].label))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">No posts match these filters.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((it) => {
            const m = byId.get(it.modelId);
            return (
              <XPostCard
                key={it.post.id}
                post={it.post}
                nowS={nowS}
                model={{ name: m?.name ?? it.modelId, href: m?.href ?? null }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
