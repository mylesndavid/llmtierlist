import type { Sentiment } from "@/lib/xPosts";

export const SENTIMENT_STYLE: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "Positive", color: "#7fff7f" },
  neutral: { label: "Neutral", color: "#9a9a9a" },
  negative: { label: "Negative", color: "#ff7f7e" },
};
