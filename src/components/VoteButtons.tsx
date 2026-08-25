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

function ArrowUp({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18v-6H5l7-7 7 7h-4v6H9z" />
    </svg>
  );
}

function ArrowDown({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6v6h4l-7 7-7-7h4V6h6z" />
    </svg>
  );
}

/** Reddit-style vote capsule: [↑ count ↓], fills with color once voted. */
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
  const icon = lg ? 20 : 17;
  const voted = optimistic.userVote;

  const pill =
    voted === 1
      ? "bg-emerald-600 text-white"
      : voted === -1
        ? "bg-rose-600 text-white"
        : "bg-surface-2 text-muted";

  return (
    <div
      className={`flex shrink-0 select-none items-center overflow-hidden rounded-full transition-colors ${pill} ${
        lg ? "h-10" : "h-9"
      }`}
      onClick={(e) => e.preventDefault()}
    >
      <button
        type="button"
        aria-label="Upvote"
        onClick={() => vote(1)}
        className={`flex h-full items-center rounded-full pl-2.5 pr-1.5 transition-colors ${
          voted ? "hover:bg-black/15" : "hover:bg-white/10 hover:text-foreground"
        }`}
      >
        <ArrowUp size={icon} filled={voted === 1} />
      </button>
      <span
        className={`min-w-[1.5ch] text-center font-mono font-bold ${lg ? "text-sm" : "text-xs"} ${
          voted ? "text-white" : optimistic.netScore > 0 ? "text-emerald-400" : optimistic.netScore < 0 ? "text-rose-400" : ""
        }`}
      >
        {optimistic.netScore}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        onClick={() => vote(-1)}
        className={`flex h-full items-center rounded-full pl-1.5 pr-2.5 transition-colors ${
          voted ? "hover:bg-black/15" : "hover:bg-white/10 hover:text-foreground"
        }`}
      >
        <ArrowDown size={icon} filled={voted === -1} />
      </button>
    </div>
  );
}
