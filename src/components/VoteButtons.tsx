"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castListVote, castVote } from "@/lib/actions";

interface Props {
  modelId: string;
  netScore: number;
  userVote: number; // 1, -1, or 0
  signedIn: boolean;
  size?: "sm" | "lg";
  kind?: "model" | "list";
}

function Chevron({ up, size }: { up: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={up ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

/** Product-Hunt-style vertical vote pill: ▲ / score / ▼. */
export default function VoteButtons({ modelId, netScore, userVote, signedIn, size = "sm", kind = "model" }: Props) {
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
      if (kind === "list") await castListVote(modelId, next as 1 | -1 | 0);
      else await castVote(modelId, next as 1 | -1 | 0);
    });
  }

  const lg = size === "lg";
  const icon = lg ? 20 : 16;
  const btn = lg ? "h-10 w-12" : "h-9 w-10";

  return (
    <div
      className="flex shrink-0 select-none items-center gap-2"
      onClick={(e) => e.preventDefault()}
    >
      <span
        className={`min-w-[2ch] text-right font-mono font-bold leading-none ${lg ? "text-base" : "text-sm"} ${
          optimistic.netScore > 0
            ? "text-emerald-400"
            : optimistic.netScore < 0
              ? "text-rose-400"
              : "text-muted"
        }`}
      >
        {optimistic.netScore}
      </span>
      <div className="flex flex-col overflow-hidden rounded-md border border-edge bg-surface-2/60">
        <button
          type="button"
          aria-label="Upvote"
          onClick={() => vote(1)}
          className={`flex ${btn} items-center justify-center border-b border-edge transition-colors ${
            optimistic.userVote === 1
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-muted hover:text-foreground active:bg-emerald-500/15 active:text-emerald-400"
          }`}
        >
          <Chevron up size={icon} />
        </button>
        <button
          type="button"
          aria-label="Downvote"
          onClick={() => vote(-1)}
          className={`flex ${btn} items-center justify-center transition-colors ${
            optimistic.userVote === -1
              ? "bg-rose-500/15 text-rose-400"
              : "text-muted hover:text-foreground active:bg-rose-500/15 active:text-rose-400"
          }`}
        >
          <Chevron up={false} size={icon} />
        </button>
      </div>
    </div>
  );
}
