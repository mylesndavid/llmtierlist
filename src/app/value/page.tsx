import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { getBaseModelsWithStats } from "@/lib/data";
import { loadBenchmarks } from "@/lib/valueData";
import { BENCHMARKS, DEFAULT_PRESET, presetByKey, type ValueModel } from "@/lib/value";
import type { ModelWithStats } from "@/lib/types";
import ValueTierList from "@/components/ValueTierList";

export const metadata: Metadata = {
  title: "The value tier list",
  description:
    "LLMs ranked by benchmark accuracy against what each task costs and how long it takes, from OpenRouter's GPQA Diamond and τ²-bench airline runs.",
};

async function catalogById(): Promise<Map<string, ModelWithStats>> {
  try {
    const models = await getBaseModelsWithStats();
    return new Map(models.map((m) => [m.id, m]));
  } catch (err) {
    unstable_rethrow(err); // let Next's own control-flow errors through
    // The board still renders from benchmark data alone (also covers local dev without D1).
    console.error("value tier list: catalog unavailable:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

export default async function ValueTiersPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string | string[] }>;
}) {
  const [{ preset }, bench, catalog] = await Promise.all([
    searchParams,
    loadBenchmarks(),
    catalogById(),
  ]);
  const initialPreset = presetByKey(typeof preset === "string" ? preset : null)?.key ?? DEFAULT_PRESET;

  const models: ValueModel[] = bench.ok
    ? bench.models.map((m) => {
        const c = catalog.get(m.id);
        return c
          ? { ...m, name: c.name, vendor: c.vendor, vendorSlug: c.vendor_slug, slug: c.slug }
          : { ...m, slug: null };
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">The value tier list</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Models ranked by benchmark accuracy against what each task actually
          costs and how long it takes.
        </p>
      </div>

      {bench.ok ? (
        <ValueTierList models={models} initialPreset={initialPreset} />
      ) : (
        <div className="rounded-sm border border-edge bg-surface p-6 text-sm">
          <p className="font-semibold">Benchmark data unavailable</p>
          <p className="mt-1 text-muted">
            The OpenRouter benchmark dataset could not be loaded right now. Try
            again later.
          </p>
        </div>
      )}

      <p className="text-xs text-muted">
        Benchmark data:{" "}
        <a href="https://openrouter.ai" className="underline hover:text-foreground">
          OpenRouter (openrouter.ai)
        </a>
        ,{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          className="underline hover:text-foreground"
        >
          CC BY 4.0
        </a>
        {bench.ok && <>, snapshot {bench.snapshotDate}</>}. Benchmarks:{" "}
        {BENCHMARKS.map((b, i) => (
          <span key={b.key}>
            {i > 0 && ", "}
            <a href={b.url} className="underline hover:text-foreground">
              {b.label}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
