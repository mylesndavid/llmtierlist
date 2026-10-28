import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { DEFAULT_PRESET, presetByKey } from "@/lib/value";
import { loadValueData } from "@/lib/valueLoad";
import { withTableSignals } from "@/lib/valueSignals";
import { loadArena } from "@/lib/arenaData";
import ValueTierList from "@/components/ValueTierList";
import ValueCredits from "@/components/ValueCredits";
import AccountBanners from "@/components/AccountBanners";
import NewThisWeek from "@/components/NewThisWeek";

const TITLE = "Which LLM is worth it? Benchmark accuracy against cost per task";
const DESCRIPTION =
  "LLMs ranked by benchmark accuracy against what each task costs and how long it takes, from OpenRouter's GPQA Diamond and τ²-bench airline runs.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · LLM Tier List` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string | string[]; error?: string | string[] }>;
}) {
  const [{ preset, error }, value] = await Promise.all([searchParams, loadValueData()]);
  const initialPreset = presetByKey(typeof preset === "string" ? preset : null)?.key ?? DEFAULT_PRESET;
  const { bench, usageLoad } = value;
  const table = value.ok ? await withTableSignals(value.models) : null;
  // Arena ratings are read from cache only; on a cold cache, load them after
  // the response so a later view has the column.
  if (table && !table.arenaCached) after(() => loadArena());
  const models = table?.models ?? [];

  return (
    <div className="space-y-6">
      <AccountBanners error={typeof error === "string" ? error : undefined} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Which model is worth it?
        </h1>
        <p className="mt-1 max-w-2xl text-muted">
          Benchmark accuracy against what each task costs and how long it takes.
        </p>
        <p className="mt-2 text-xs text-muted">
          {bench.ok ? (
            <>
              Data updated <time dateTime={bench.snapshotDate}>{bench.snapshotDate}</time> · from{" "}
              <a href="https://openrouter.ai" className="underline hover:text-foreground">
                OpenRouter
              </a>{" "}
              benchmarks · {models.length} models
            </>
          ) : (
            <>From OpenRouter benchmarks</>
          )}
        </p>
      </header>

      {value.ok ? (
        <ValueTierList
          models={models}
          initialPreset={initialPreset}
          showUsage={value.showUsage}
          showOpenWeights={value.showOpenWeights}
        />
      ) : (
        <div role="status" className="rounded-sm border border-edge bg-surface p-6 text-sm">
          <p className="font-semibold">Benchmark data unavailable</p>
          <p className="mt-1 text-muted">
            The OpenRouter benchmark dataset could not be loaded right now. Try again later. In the
            meantime, see the{" "}
            <Link href="/community" className="underline hover:text-foreground">
              community leaderboard
            </Link>{" "}
            or{" "}
            <Link href="/models" className="underline hover:text-foreground">
              browse models
            </Link>
            .
          </p>
        </div>
      )}

      <Suspense fallback={null}>
        <NewThisWeek value={value} />
      </Suspense>

      <ValueCredits bench={bench} usage={usageLoad} />
    </div>
  );
}
