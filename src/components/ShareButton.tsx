"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "./icons";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable (e.g. insecure context) — ignore.
        }
      }}
      className="flex items-center gap-1.5 rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
