"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castVote } from "@/lib/actions";

interface Props {
  modelId: string;
  netScore: number;
  userVote: number; // 1, -1, or 0
  signedIn: boolean;
  size?: "sm" | "lg";
}

export default function VoteButtons({ modelId, netScore, userVote, signedIn, size = "sm" }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic({ netScore, userVote });

  function vote(value: 1 | -1) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const next = optimistic.userVote === value ? 0 : value;
    startTransition(async () => {
      setOptimistic({
        netScore: optimistic.netScore - optimistic.userVote + next,
        userVote: next,
      });
      await castVote(modelId, next as 1 | -1 | 0);
    });
  }

  const btn =
    size === "lg"
      ? "h-9 w-9 text-lg"
      : "h-7 w-7 text-sm";

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        aria-label="Upvote"
        onClick={() => vote(1)}
        className={`${btn} grid place-items-center rounded-md border transition-colors ${
          optimistic.userVote === 1
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
            : "border-edge text-muted hover:border-emerald-500 hover:text-emerald-400"
        }`}
      >
        ▲
      </button>
      <span
        className={`min-w-8 text-center font-mono text-sm font-semibold ${
          optimistic.netScore > 0
            ? "text-emerald-400"
            : optimistic.netScore < 0
              ? "text-rose-400"
              : "text-muted"
        }`}
      >
        {optimistic.netScore > 0 ? `+${optimistic.netScore}` : optimistic.netScore}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        onClick={() => vote(-1)}
        className={`${btn} grid place-items-center rounded-md border transition-colors ${
          optimistic.userVote === -1
            ? "border-rose-500 bg-rose-500/20 text-rose-400"
            : "border-edge text-muted hover:border-rose-500 hover:text-rose-400"
        }`}
      >
        ▼
      </button>
    </div>
  );
}
