"use client";

import { useEffect, useRef, useState } from "react";

/** Wraps a tier board with a browser-fullscreen toggle. */
export default function FullscreenBoard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await ref.current?.requestFullscreen();
    }
  }

  return (
    <div
      ref={ref}
      className={
        isFullscreen
          ? "flex flex-col justify-center gap-4 overflow-auto bg-background p-6 sm:p-10"
          : "space-y-3"
      }
    >
      <div className="flex items-center justify-between gap-3">
        {isFullscreen ? (
          <h2 className="truncate text-xl font-bold">{title}</h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
        >
          {isFullscreen ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>
      {children}
    </div>
  );
}
