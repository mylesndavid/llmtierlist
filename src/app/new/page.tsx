import type { Metadata } from "next";
import Link from "next/link";
import { loadNewReleases } from "@/lib/newReleasesLoad";
import { filterReleases, groupByWeek, labOptions, modalityOptions } from "@/lib/newReleases";
import ReleaseRow from "@/components/ReleaseRow";
import NewFilters from "@/components/NewFilters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New models",
  description:
    "LLMs added to OpenRouter in the last 30 days, by week, with price, context, modalities and value tier where benchmarked.",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

export default async function NewModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ lab?: string | string[]; open?: string | string[]; modality?: string | string[] }>;
}) {
  const [sp, load] = await Promise.all([searchParams, loadNewReleases()]);
  const lab = one(sp.lab);
  const modality = one(sp.modality);
  const open = one(sp.open) === "1";

  if (!load.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">New models</h1>
        <div className="rounded-sm border border-edge bg-surface p-6 text-sm">
          <p className="font-semibold">Release data unavailable</p>
          <p className="mt-1 text-muted">The OpenRouter model list could not be loaded right now. Try again later.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const shown = filterReleases(load.entries, { lab, open, modality });
  const weeks = groupByWeek(shown, now);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New models</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Models added to OpenRouter in the last 30 days, newest first. Tier, Q and value score
          use the Balanced preset of the{" "}
          <Link href="/value" className="underline hover:text-foreground">
            value tier list
          </Link>
          .
        </p>
      </div>

      <NewFilters
        labs={labOptions(load.entries)}
        modalities={modalityOptions(load.entries)}
        lab={lab}
        open={open}
        modality={modality}
      />

      {weeks.length === 0 ? (
        <p className="border border-edge bg-surface p-6 text-center text-sm text-muted">
          No releases match these filters.
        </p>
      ) : (
        weeks.map((w) => (
          <section key={w.start} className="space-y-2">
            <h2 className="flex items-baseline gap-2 text-lg font-bold">
              {w.label}
              <span className="text-sm font-normal text-muted">
                {w.entries.length} {w.entries.length === 1 ? "model" : "models"}
              </span>
            </h2>
            <ul className="border border-edge">
              {w.entries.map((e) => (
                <ReleaseRow key={e.id} e={e} />
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="text-xs text-muted">
        Release dates and specs:{" "}
        <a href="https://openrouter.ai/models" className="underline hover:text-foreground">
          OpenRouter
        </a>
        . Free, batch and rolling-alias listings are folded into their model.
        {load.valueSnapshot && <> Benchmark snapshot {load.valueSnapshot}.</>}
      </p>
    </div>
  );
}
