"use client";

import { useEffect } from "react";

/** Fires the first-party page view beacon once per page load. */
export default function TrackVisit() {
  useEffect(() => {
    fetch("/api/hit", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
