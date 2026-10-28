"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  avatarUrl,
  compactCount,
  mediaUrl,
  postAge,
  splitPostText,
  type PostLink,
  type QuotedPost,
  type ShownPost,
  type XMedia,
} from "@/lib/xPosts";
import { SENTIMENT_STYLE } from "./sentimentStyle";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 24, 2026, 16:30 UTC": the same on server and client. */
function exactTime(createdUtc: number): string {
  const d = new Date(createdUtc * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

const ext = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

export function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function VerifiedBadge({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-label="Verified account" role="img" className={`${className} shrink-0`} fill="#1d9bf0">
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  );
}

const ICONS = {
  reply:
    "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  repost:
    "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  like: "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  views: "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
};

function Stat({ icon, n, label }: { icon: keyof typeof ICONS; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1" title={`${n.toLocaleString("en-US")} ${label}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-[1.1rem] w-[1.1rem]" fill="currentColor">
        <path d={ICONS[icon]} />
      </svg>
      <span className="sr-only">
        {n.toLocaleString("en-US")} {label}
      </span>
      <span aria-hidden>{n > 0 ? compactCount(n) : ""}</span>
    </span>
  );
}

function Stats({ post }: { post: ShownPost }) {
  return (
    <>
      <Stat icon="reply" n={post.replyCount} label="replies" />
      <Stat icon="repost" n={post.retweetCount} label="reposts" />
      <Stat icon="like" n={post.likeCount} label="likes" />
      {post.viewCount != null && <Stat icon="views" n={post.viewCount} label="views" />}
    </>
  );
}

function SentimentTag({ post }: { post: ShownPost }) {
  if (!post.sentiment) return null;
  const s = SENTIMENT_STYLE[post.sentiment];
  return (
    <span className="flex items-center gap-1.5 text-xs" title="Sentiment by Jev">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function PostText({ text, links = [], className = "" }: { text: string; links?: PostLink[]; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>
      {splitPostText(text, links).map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <a key={i} href={part.href} {...ext} className="text-[#1d9bf0] hover:underline">
            {part.value}
          </a>
        )
      )}
    </p>
  );
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: "sm" | "md" }) {
  const cls = size === "sm" ? "h-5 w-5 text-[10px]" : "h-10 w-10 text-sm";
  const url = avatarUrl(src);
  return url ? (
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${cls} shrink-0 rounded-full bg-surface-2 object-cover`} />
  ) : (
    <span className={`${cls} grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold uppercase text-muted`}>
      {name.slice(0, 1)}
    </span>
  );
}

function PlayBadge() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-[#1d9bf0] text-white shadow">
        <svg viewBox="0 0 24 24" aria-hidden className="ml-0.5 h-6 w-6" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}

/**
 * X-style media: one item full width, two side by side, three as one tall
 * plus two stacked, four as a 2×2 grid. Videos and GIFs show their
 * thumbnail with a play badge and link to the post.
 */
export function MediaGrid({
  media,
  postUrl,
  size,
  onOpen,
}: {
  media: XMedia[];
  postUrl: string;
  size: "card" | "full" | "quote";
  /** card only: clicking a photo opens the post instead of the image */
  onOpen?: () => void;
}) {
  if (media.length === 0) return null;
  const items = media.slice(0, 4);
  const single = items.length === 1;
  const ratio =
    single && items[0].width && items[0].height
      ? Math.min(Math.max(items[0].width / items[0].height, 0.75), 2)
      : 16 / 9;
  const box =
    size === "full"
      ? single
        ? ""
        : "aspect-[16/10]"
      : size === "quote"
        ? "h-28"
        : "h-44";
  const grid =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 grid-rows-2";
  return (
    <div
      className={`grid gap-0.5 overflow-hidden rounded-2xl border border-edge ${grid} ${box}`}
      style={size === "full" && single ? { aspectRatio: String(ratio), maxHeight: "70vh" } : undefined}
    >
      {items.map((m, i) => {
        const span = items.length === 3 && i === 0 ? "row-span-2" : "";
        const img = (
          <img
            src={mediaUrl(m.url, size === "full" ? "large" : "small")}
            alt={m.type === "photo" ? "Image attached to the post" : "Video thumbnail"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full bg-surface-2 object-cover"
          />
        );
        const cls = `relative block min-h-0 overflow-hidden ${span}`;
        if (m.type !== "photo") {
          return (
            <a key={i} href={postUrl} {...ext} className={cls} aria-label={m.type === "gif" ? "Play GIF on X" : "Play video on X"}>
              {img}
              <PlayBadge />
              {m.type === "gif" && (
                <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1 text-[11px] font-bold text-white">GIF</span>
              )}
            </a>
          );
        }
        if (onOpen) {
          return (
            <button key={i} type="button" onClick={onOpen} className={`${cls} cursor-pointer`} aria-label="Show the full post">
              {img}
            </button>
          );
        }
        return (
          <a key={i} href={mediaUrl(m.url, "large")} {...ext} className={cls} aria-label="Open the image">
            {img}
          </a>
        );
      })}
    </div>
  );
}

function QuotedCard({ q, nowS, full }: { q: QuotedPost; nowS: number; full: boolean }) {
  return (
    <a
      href={q.url}
      {...ext}
      className="block overflow-hidden rounded-2xl border border-edge transition-colors hover:bg-surface-2/60"
      aria-label={`Quoted post by @${q.authorUsername}`}
    >
      <div className="p-3">
        <p className="flex min-w-0 items-center gap-1 text-sm leading-tight">
          <Avatar src={q.authorImage} name={q.authorName} size="sm" />
          <span className="truncate font-semibold">{q.authorName}</span>
          {q.authorVerified && <VerifiedBadge className="h-3.5 w-3.5" />}
          <span className="truncate text-muted">@{q.authorUsername}</span>
          {q.createdUtc != null && (
            <>
              <span className="text-muted" aria-hidden>
                ·
              </span>
              <time className="shrink-0 text-muted" dateTime={new Date(q.createdUtc * 1000).toISOString()} title={exactTime(q.createdUtc)}>
                {postAge(q.createdUtc, nowS)}
              </time>
            </>
          )}
        </p>
        <p className={`mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere] ${full ? "" : "line-clamp-3"}`}>
          {q.text}
        </p>
      </div>
      {q.media.length > 0 &&
        (full ? (
          <div className="px-3 pb-3">
            <MediaGrid media={q.media} postUrl={q.url} size="quote" />
          </div>
        ) : (
          <img
            src={mediaUrl(q.media[0].url, "small")}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-24 w-full border-t border-edge bg-surface-2 object-cover"
          />
        ))}
    </a>
  );
}

function Header({ post, nowS, big = false }: { post: ShownPost; nowS: number; big?: boolean }) {
  const profile = `https://x.com/${post.authorUsername}`;
  return (
    <header className="flex items-start gap-2.5">
      <a href={profile} {...ext} className="shrink-0" tabIndex={-1} aria-hidden>
        <Avatar src={post.authorImage} name={post.authorName} size="md" />
      </a>
      <div className={`min-w-0 flex-1 leading-tight ${big ? "" : "flex flex-wrap items-center gap-x-1"}`}>
        <a href={profile} {...ext} className="flex min-w-0 max-w-full items-center gap-1 hover:underline">
          <span className="truncate text-[15px] font-bold">{post.authorName}</span>
          {post.authorVerified && <VerifiedBadge />}
        </a>
        <p className="flex min-w-0 items-center gap-1 text-[15px] text-muted">
          <a href={profile} {...ext} className="truncate hover:underline">
            @{post.authorUsername}
          </a>
          {!big && (
            <>
              <span aria-hidden>·</span>
              <a href={post.url} {...ext} className="shrink-0 hover:underline">
                <time dateTime={new Date(post.createdUtc * 1000).toISOString()} title={exactTime(post.createdUtc)}>
                  {postAge(post.createdUtc, nowS)}
                </time>
              </a>
            </>
          )}
        </p>
      </div>
      <a href={post.url} {...ext} aria-label="Open this post on X" className="shrink-0 p-0.5 text-foreground hover:text-muted">
        <XLogo className={big ? "h-5 w-5" : "h-4 w-4"} />
      </a>
    </header>
  );
}

function ReplyingTo({ handles }: { handles: string[] }) {
  if (handles.length === 0) return null;
  const shown = handles.slice(0, 3);
  return (
    <p className="text-[15px] text-muted">
      Replying to{" "}
      {shown.map((h, i) => (
        <span key={h}>
          {i > 0 && (i === shown.length - 1 && handles.length <= 3 ? " and " : " ")}
          <a href={`https://x.com/${h}`} {...ext} className="text-[#1d9bf0] hover:underline">
            @{h}
          </a>
        </span>
      ))}
      {handles.length > 3 && ` and ${handles.length - 3} others`}
    </p>
  );
}

export interface CardModel {
  name: string;
  href: string | null;
}

function ModelTag({ model }: { model: CardModel }) {
  const cls = "inline-block max-w-full truncate rounded-sm border border-edge px-1.5 py-0.5 text-[11px] text-muted";
  return model.href ? (
    <a href={model.href} className={`${cls} hover:text-foreground`}>
      {model.name}
    </a>
  ) : (
    <span className={cls}>{model.name}</span>
  );
}

function PostModal({
  post,
  nowS,
  model,
  onClose,
}: {
  post: ShownPost;
  nowS: number;
  model?: CardModel;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // showModal makes the rest of the page inert (focus stays inside), closes on Esc,
    // and returns focus to the opener on close.
    dialog.showModal();
    closeRef.current?.focus();
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={`Post by ${post.authorName}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close(); // backdrop
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-edge bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70"
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-background/95 px-3 py-2">
          <button
            ref={closeRef}
            type="button"
            onClick={() => ref.current?.close()}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
              <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
            </svg>
          </button>
          {model && <ModelTag model={model} />}
        </div>
        <div className="space-y-3 p-4">
          <Header post={post} nowS={nowS} big />
          <ReplyingTo handles={post.replyTo} />
          <PostText text={post.text} links={post.links} className="text-[17px] leading-relaxed" />
          <MediaGrid media={post.media} postUrl={post.url} size="full" />
          {post.quoted && <QuotedCard q={post.quoted} nowS={nowS} full />}
          <p className="text-[15px] text-muted">
            <a href={post.url} {...ext} className="hover:underline">
              <time dateTime={new Date(post.createdUtc * 1000).toISOString()}>{exactTime(post.createdUtc)}</time>
            </a>
          </p>
          <div className="flex items-center justify-between border-y border-edge py-3 text-sm text-muted">
            <Stats post={post} />
            <SentimentTag post={post} />
          </div>
          <a
            href={post.url}
            {...ext}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-bold text-background hover:opacity-90"
          >
            View on <XLogo className="h-4 w-4" />
          </a>
        </div>
      </div>
    </dialog>
  );
}

/** Measures whether the clamped card body hides anything. */
function useOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [over, setOver] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const clipped = [el, ...el.querySelectorAll<HTMLElement>("[data-clamp]")].some(
      (n) => n.scrollHeight > n.clientHeight + 1
    );
    setOver(clipped);
  }, []);
  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  return [ref, over] as const;
}

/**
 * A post as X shows it, at a fixed height with the text clamped. Clicking
 * the card or "Show more" opens the whole post in a modal.
 */
export default function XPostCard({ post, nowS, model }: { post: ShownPost; nowS: number; model?: CardModel }) {
  const [open, setOpen] = useState(false);
  const [bodyRef, overflowing] = useOverflow<HTMLDivElement>();
  const hasExtras = post.media.length > 0 || post.quoted != null;
  const clamp = hasExtras ? "line-clamp-3" : "line-clamp-[9]";
  const showMore = overflowing || hasExtras;

  return (
    <>
      <article
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          setOpen(true);
        }}
        className="flex h-[27rem] min-w-0 cursor-pointer flex-col rounded-sm border border-edge bg-surface p-3 transition-colors hover:bg-surface-2/40"
      >
        {model && (
          <div className="mb-2 min-w-0">
            <ModelTag model={model} />
          </div>
        )}
        <Header post={post} nowS={nowS} />
        <div ref={bodyRef} className="relative mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <ReplyingTo handles={post.replyTo} />
          <div data-clamp className={clamp}>
            <PostText text={post.text} links={post.links} className="text-[15px] leading-snug" />
          </div>
          <div className="shrink-0">
            <MediaGrid media={post.media} postUrl={post.url} size="card" onOpen={() => setOpen(true)} />
          </div>
          {post.quoted && <QuotedCard q={post.quoted} nowS={nowS} full={false} />}
        </div>
        {showMore && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1 self-start text-sm text-[#1d9bf0] hover:underline"
          >
            Show more
          </button>
        )}
        <footer className="mt-2 flex items-center justify-between gap-2 border-t border-edge pt-2 text-[13px] text-muted">
          <Stats post={post} />
          <SentimentTag post={post} />
        </footer>
      </article>
      {open && <PostModal post={post} nowS={nowS} model={model} onClose={() => setOpen(false)} />}
    </>
  );
}
