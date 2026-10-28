"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  labs: Array<{ slug: string; name: string; count: number }>;
  modalities: string[];
  lab: string | null;
  open: boolean;
  modality: string | null;
}

const MODALITY_LABEL: Record<string, string> = {
  text: "Text",
  image: "Image",
  file: "File",
  audio: "Audio",
  video: "Video",
};

/** Lab, open-weights and modality filters for /new, kept in the URL. */
export default function NewFilters({ labs, modalities, lab, open, modality }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(next: Partial<{ lab: string | null; open: boolean; modality: string | null }>) {
    const v = { lab, open, modality, ...next };
    const q = new URLSearchParams();
    if (v.lab) q.set("lab", v.lab);
    if (v.open) q.set("open", "1");
    if (v.modality) q.set("modality", v.modality);
    const qs = q.toString();
    start(() => router.replace(qs ? `/new?${qs}` : "/new", { scroll: false }));
  }

  const select =
    "min-w-0 rounded-sm border border-edge bg-surface px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm ${pending ? "opacity-60" : ""}`}
      aria-busy={pending}
    >
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="text-xs text-muted">Lab</span>
        <select className={select} value={lab ?? ""} onChange={(e) => go({ lab: e.target.value || null })}>
          <option value="">All labs</option>
          {labs.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name} ({l.count})
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Modality</span>
        <select
          className={select}
          value={modality ?? ""}
          onChange={(e) => go({ modality: e.target.value || null })}
        >
          <option value="">Any</option>
          {modalities.map((m) => (
            <option key={m} value={m}>
              {MODALITY_LABEL[m] ?? m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-edge bg-surface px-2 py-1.5">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => go({ open: e.target.checked })}
          className="accent-foreground"
        />
        Open weights only
      </label>
      {(lab || open || modality) && (
        <button
          type="button"
          onClick={() => go({ lab: null, open: false, modality: null })}
          className="text-xs text-muted underline hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}
