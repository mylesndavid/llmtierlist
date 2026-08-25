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
  const icon = lg ? 18 : 14;

  return (
    <div
      className={`flex shrink-0 select-none flex-col items-stretch overflow-hidden rounded-md border border-edge bg-surface-2/60 ${
        lg ? "w-12" : "w-9"
      }`}
      onClick={(e) => e.preventDefault()}
    >
      <button
        type="button"
        aria-label="Upvote"
        onClick={() => vote(1)}
        className={`flex items-center justify-center pb-0.5 ${lg ? "pt-2" : "pt-1.5"} transition-colors ${
          optimistic.userVote === 1
            ? "text-emerald-400"
            : "text-muted hover:text-foreground active:text-emerald-400"
        }`}
      >
        <Chevron up size={icon} />
      </button>
      <span
        className={`text-center font-mono font-bold leading-none ${lg ? "text-sm" : "text-[11px]"} ${
          optimistic.netScore > 0
            ? "text-emerald-400"
            : optimistic.netScore < 0
              ? "text-rose-400"
              : "text-muted"
        }`}
      >
        {optimistic.netScore}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        onClick={() => vote(-1)}
        className={`flex items-center justify-center pt-0.5 ${lg ? "pb-2" : "pb-1.5"} transition-colors ${
          optimistic.userVote === -1
            ? "text-rose-400"
            : "text-muted hover:text-foreground active:text-rose-400"
        }`}
      >
        <Chevron up={false} size={icon} />
      </button>
    </div>
  );
}
