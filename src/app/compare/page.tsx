import Link from "next/link";
import { redirect } from "next/navigation";
import { loadCatalog, loadValueData } from "@/lib/valueLoad";
import { popularComparisons, type ComparePair } from "@/lib/popularPairs";
import { buildVerdict, verdictSide } from "@/lib/compareVerdict";
import { TierBadge } from "@/components/ReleaseRow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare models",
  description: "Head-to-head LLM comparisons on quality, cost per task, speed and price.",
};

function PairList({ title, note, pairs }: { title: string; note: string; pairs: ComparePair[] }) {
  if (pairs.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">
        {title} <span className="text-sm font-normal text-muted">{note}</span>
      </h2>
      <ul className="border border-edge">
        {pairs.map(({ a, b }) => (
          <li key={`${a.model.id}|${b.model.id}`} className="border-b border-edge last:border-b-0">
            <Link
              href={`/compare/${a.model.slug}-vs-${b.model.slug}`}
              className="block bg-surface px-3 py-3 hover:bg-surface-2 sm:px-4"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                <TierBadge tier={a.tier} />
                <span className="[overflow-wrap:anywhere]">{a.model.name}</span>
                <span className="text-xs font-normal text-muted">vs</span>
                <TierBadge tier={b.tier} />
                <span className="[overflow-wrap:anywhere]">{b.model.name}</span>
              </span>
              <span className="mt-1 block text-xs text-muted">{buildVerdict(verdictSide(a), verdictSide(b))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Popular comparisons; ?a= / ?b= from older links canonicalise to /compare/<a>-vs-<b>. */
export default async function CompareEntry({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [{ a, b }, catalog] = await Promise.all([searchParams, loadCatalog()]);
  const ranked = [...catalog.models].sort(
    (x, y) =>
      y.stats.net_score - x.stats.net_score || (y.release_date ?? "").localeCompare(x.release_date ?? "")
  );
  const first = (a && catalog.bySlug.get(a)?.slug) ?? ranked[0]?.slug;
  const second =
    (b && catalog.bySlug.get(b)?.slug) ?? ranked.find((m) => m.slug !== first)?.slug ?? ranked[1]?.slug;
  if ((a || b) && first && second) redirect(`/compare/${first}-vs-${second}`);

  const value = await loadValueData(catalog);
  const pairs = value.ok ? popularComparisons(value.result.models) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compare models</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Head-to-head on quality, cost and time per task from OpenRouter benchmark runs, plus price,
          context and community votes.
        </p>
        {first && second && (
          <Link
            href={`/compare/${first}-vs-${second}`}
            className="mt-3 inline-block rounded-sm border border-edge bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Pick any two models →
          </Link>
        )}
      </div>

      <PairList
        title="On the frontier"
        note="neighbours on the quality/cost frontier"
        pairs={pairs.filter((p) => p.kind === "frontier")}
      />
      <PairList
        title="Similar price"
        note="widely used models within 1.5× on cost per task and 15 points on quality"
        pairs={pairs.filter((p) => p.kind === "price")}
      />

      {value.ok && (
        <p className="text-xs text-muted">
          Balanced preset of the{" "}
          <Link href="/value" className="underline hover:text-foreground">
            value tier list
          </Link>
          . Benchmarks: OpenRouter, CC BY 4.0, snapshot {value.snapshotDate}.
        </p>
      )}
    </div>
  );
}
