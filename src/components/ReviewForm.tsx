"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { upsertReview } from "@/lib/actions";

interface Props {
  modelId: string;
  modelSlug: string;
  signedIn: boolean;
  existing?: { rating: number; title: string; body: string };
}

export default function ReviewForm({ modelId, modelSlug, signedIn, existing }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <p className="rounded-sm border border-edge bg-surface p-4 text-sm text-muted">
        <Link href="/login" className="underline hover:text-foreground">Sign in</Link>{" "}
        to vote and write a review.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-sm border border-edge bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2"
      >
        {existing ? "Edit your review" : "✍️ Write a review"}
      </button>
    );
  }

  function submit(formData: FormData) {
    formData.set("rating", String(rating));
    startTransition(async () => {
      const result = await upsertReview(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setError(null);
      }
    });
  }

  return (
    <form action={submit} className="space-y-3 rounded-sm border border-edge bg-surface p-4">
      <input type="hidden" name="model_id" value={modelId} />
      <input type="hidden" name="model_slug" value={modelSlug} />
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl transition-colors ${(hover || rating) >= n ? "text-amber-400" : "text-edge"}`}
            aria-label={`${n} stars`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-muted">{rating > 0 ? `${rating}/5` : "Pick a rating"}</span>
      </div>
      <input
        name="title"
        defaultValue={existing?.title}
        placeholder="Review title (optional)"
        maxLength={200}
        className="w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-muted"
      />
      <textarea
        name="body"
        defaultValue={existing?.body}
        placeholder="What's this model actually like to use? Coding, writing, reasoning, price…"
        rows={4}
        required
        maxLength={5000}
        className="w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-muted"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || rating === 0}
          className="rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:opacity-40"
        >
          {pending ? "Posting…" : existing ? "Update review" : "Post review"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-edge px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
