"use client";

import { useState } from "react";

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
      className="rounded-md border border-edge bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
    >
      {copied ? "✓ Copied!" : "🔗 Share"}
    </button>
  );
}
