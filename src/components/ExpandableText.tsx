"use client";

import { useState } from "react";

/** Long model blurbs: show a couple of lines, expand for the rest. */
export default function ExpandableText({
  text,
  clamp = 3,
}: {
  text: string;
  clamp?: number;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;

  return (
    <div className="mt-3 max-w-2xl">
      <p
        className={`text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere] ${
          open || !long ? "" : `line-clamp-${clamp}`
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 text-xs font-medium text-muted hover:text-foreground"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
