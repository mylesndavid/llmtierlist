"use client";

import { useRouter } from "next/navigation";

interface Option {
  slug: string;
  name: string;
  vendor: string;
}

/** Swaps either side of the comparison, keeping the URL shareable. */
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

  function set(side: "a" | "b", slug: string) {
    const next = side === "a" ? { a: slug, b } : { a, b: slug };
    router.push(`/compare?a=${next.a}&b=${next.b}`, { scroll: false });
  }

  const select =
    "w-full rounded-sm border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-muted";

  return (
    <div className="grid grid-cols-2 gap-2">
      {(["a", "b"] as const).map((side) => (
        <select
          key={side}
          value={side === "a" ? a : b}
          onChange={(e) => set(side, e.target.value)}
          aria-label={side === "a" ? "First model" : "Second model"}
          className={select}
        >
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name} — {o.vendor}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
