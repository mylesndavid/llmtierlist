"use client";

import { useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "/tiers", label: "Official tier list" },
  { href: "/tierlists", label: "Community lists" },
  { href: "/models", label: "Models" },
  { href: "/compare", label: "Compare models" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(!open)}
        className="grid h-9 w-9 place-items-center text-muted hover:text-foreground"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-sm border border-edge bg-surface py-1 shadow-xl shadow-black/50">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                prefetch
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
