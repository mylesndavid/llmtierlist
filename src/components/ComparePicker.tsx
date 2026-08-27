"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Option {
  slug: string;
  name: string;
  vendor: string;
}

function Field({
  label,
  current,
  options,
  onPick,
}: {
  label: string;
  current: Option | undefined;
  options: Option[];
  onPick: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) || o.vendor.toLowerCase().includes(q)
        )
      : options;
    return pool.slice(0, 40);
  }, [options, query]);

  return (
    <div ref={box} className="relative">
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-edge bg-surface px-3 py-2 text-left text-sm hover:border-muted"
      >
        <span className="min-w-0 truncate font-medium">
          {current ? current.name : "Choose a model"}
        </span>
        <span className="shrink-0 text-xs text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-sm border border-edge bg-surface shadow-xl shadow-black/60">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full border-b border-edge bg-surface-2 px-3 py-2.5 text-sm outline-none placeholder:text-muted"
          />
          <ul className="max-h-72 overflow-y-auto">
            {matches.map((o) => (
              <li key={o.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(o.slug);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2 ${
                    current?.slug === o.slug ? "bg-surface-2" : ""
                  }`}
                >
                  <span className="text-sm font-medium">{o.name}</span>
                  <span className="text-[11px] text-muted">{o.vendor}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted">No models match.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Searchable model pickers — no native select roulette on phones. */
export default function ComparePicker({
  options,
  a,
  b,
}: {
  options: Option[];
  a: string;
  b: string;
}) {
  const router = useRouter();
  const go = (nextA: string, nextB: string) =>
    router.push(`/compare?a=${nextA}&b=${nextB}`, { scroll: false });

  const byslug = useMemo(() => new Map(options.map((o) => [o.slug, o])), [options]);

  return (
    <div className="grid grid-cols-2 gap-2">
      <Field
        label="Model A"
        current={byslug.get(a)}
        options={options}
        onPick={(slug) => go(slug, b)}
      />
      <Field
        label="Model B"
        current={byslug.get(b)}
        options={options}
        onPick={(slug) => go(a, slug)}
      />
    </div>
  );
}
