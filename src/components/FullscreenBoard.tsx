"use client";

import { useEffect, useRef, useState } from "react";
import { CollapseIcon, DownloadIcon, ExpandIcon } from "./icons";

/**
 * Wraps a tier board with fullscreen and export-to-PNG controls.
 * Export captures the nearest [data-export-board] element (the board itself),
 * so surrounding UI like the builder pool stays out of the image.
 */
export default function FullscreenBoard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  async function exportPng() {
    const container = ref.current;
    if (!container || exporting) return;
    setExporting(true);
    try {
      const node =
        (container.querySelector("[data-export-board]") as HTMLElement) ?? container;
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#121212" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tier-list"}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  }

  const btn =
    "flex items-center gap-1.5 rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground";

  return (
    <div
      ref={ref}
      className={
        isFullscreen
          ? "flex flex-col gap-4 overflow-auto bg-background p-6 sm:p-10"
          : "space-y-3"
      }
    >
      <div className="flex items-center justify-between gap-3">
        {isFullscreen ? (
          <h2 className="truncate text-xl font-bold">{title}</h2>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportPng} disabled={exporting} className={btn}>
            <DownloadIcon />
            {exporting ? "Exporting…" : "Export PNG"}
          </button>
          <button type="button" onClick={toggle} className={btn}>
            {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
