"use client";

import { useEffect, useRef, useState } from "react";
import { CollapseIcon, DownloadIcon, ExpandIcon } from "./icons";

/**
 * Wraps a tier board with fullscreen and export-to-PNG controls.
 * iOS has no element fullscreen API, so a fixed-overlay takeover is used
 * where native fullscreen is unavailable.
 */
export default function FullscreenBoard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [overlayFullscreen, setOverlayFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isFullscreen = nativeFullscreen || overlayFullscreen;

  useEffect(() => {
    const onChange = () => setNativeFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // lock page scroll behind the overlay takeover
  useEffect(() => {
    if (!overlayFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayFullscreen]);

  async function toggle() {
    if (nativeFullscreen || overlayFullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setOverlayFullscreen(false);
      return;
    }
    if (ref.current?.requestFullscreen) {
      try {
        await ref.current.requestFullscreen();
        return;
      } catch {
        // fall through to the overlay takeover
      }
    }
    setOverlayFullscreen(true);
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
          ? `flex flex-col gap-4 overflow-auto bg-background p-4 sm:p-10 ${
              overlayFullscreen ? "fixed inset-0 z-[100]" : ""
            }`
          : "space-y-3"
      }
    >
      <div className="flex items-center justify-between gap-3">
        {isFullscreen ? (
          <h2 className="truncate text-lg font-bold sm:text-xl">{title}</h2>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportPng} disabled={exporting} className={btn}>
            <DownloadIcon />
            <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export PNG"}</span>
          </button>
          <button type="button" onClick={toggle} className={btn}>
            {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
            <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
            {isFullscreen && <span className="sm:hidden">Exit</span>}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
