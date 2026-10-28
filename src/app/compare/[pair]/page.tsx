import Link from "next/link";
import { Suspense } from "react";
import { formatContextWindow, formatPrice, modalityList, paramsDetail, plainDescription } from "@/lib/tiers";
import { loadCatalog, loadValueData, type Catalog } from "@/lib/valueLoad";
import { buildVerdict, verdictSide } from "@/lib/compareVerdict";
import {
  formatCost,
  formatPct,
  formatSeconds,
  formatUsage,
  isThin,
  sampleLabel,
  type BenchmarkKey,
  type ScoredModel,
  type ValueModel,
} from "@/lib/value";
import VendorLogo from "@/components/VendorLogo";
import ModalityIcon from "@/components/ModalityIcons";
import ComparePicker from "@/components/ComparePicker";
import StarRating from "@/components/StarRating";
import CompareChart, { COMPARE_COLORS } from "@/components/CompareChart";
import { TierBadge } from "@/components/ReleaseRow";
import type { ModelWithStats } from "@/lib/types";

// Rendered on request only: no generateStaticParams.
export const dynamic = "force-dynamic";

type Scored = ScoredModel<ValueModel>;

const GRID = "grid grid-cols-[4.5rem_1fr_1fr] gap-2 px-3 sm:grid-cols-[7rem_1fr_1fr] sm:gap-4 sm:px-4";
const BETTER = "text-emerald-400";

function totalParams(m: ModelWithStats) {
  if (m.params_b == null) return null;
  return m.params_b >= 1000
    ? `${(m.params_b / 1000).toFixed(m.params_b % 1000 === 0 ? 0 : 1)}T`
    : `${m.params_b}B`;
}

function Row({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className={`${GRID} items-start border-b border-edge py-2.5 last:border-b-0`}>
      <div className="pt-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted">
        {label}
      </div>
      <div className="text-sm font-semibold [overflow-wrap:anywhere]">{a}</div>
      <div className="text-sm font-semibold [overflow-wrap:anywhere]">{b}</div>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-edge bg-surface-2/40 px-3 py-2 sm:px-4">
      <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  );
}

const Dash = () => <span className="text-muted">—</span>;

/** Highlight the better of two numbers (higher wins unless `lowerWins`). */
function pick(a: number | null | undefined, b: number | null | undefined, lowerWins = false) {
  if (a == null || b == null || a === b) return ["", ""];
  const aWins = lowerWins ? a < b : a > b;
  return aWins ? [BETTER, ""] : ["", BETTER];
}

function Score({ m }: { m: ModelWithStats }) {
  const n = m.stats.net_score;
  return (
    <>
      <span className={n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-muted"}>
        {n > 0 ? `+${n}` : n}
      </span>
      <span className="block text-[11px] font-normal text-muted">
        {m.stats.upvotes} up · {m.stats.downvotes} down
      </span>
    </>
  );
}

function ModelHead({ m, color }: { m: ModelWithStats; color: string }) {
  return (
    <div className="min-w-0 p-1">
      <span className="mb-1.5 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-sm bg-surface p-1.5">
          <VendorLogo vendorSlug={m.vendor_slug} className="h-full w-full" />
        </span>
        <svg width="10" height="10" aria-hidden>
          <circle cx="5" cy="5" r="4.5" fill={color} />
        </svg>
      </span>
      <div className="flex items-start gap-1">
        <span className="min-w-0 text-sm font-bold leading-tight [overflow-wrap:anywhere]">{m.name}</span>
        <span className="mt-0.5 shrink-0 text-[10px] text-muted">▾</span>
      </div>
      <div className="truncate text-xs text-muted">{m.vendor}</div>
    </div>
  );
}

function Modalities({ m }: { m: ModelWithStats }) {
  const inputs = modalityList(m.input_modalities);
  const outputs = modalityList(m.output_modalities);
  if (inputs.length === 0) return <Dash />;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {inputs.map((k) => (
        <ModalityIcon key={k} kind={k} />
      ))}
      <span className="text-xs text-muted">→</span>
      {outputs.map((k) => (
        <ModalityIcon key={`o-${k}`} kind={k} />
      ))}
    </span>
  );
}

function Accuracy({ r, k, cls }: { r: Scored | null; k: BenchmarkKey; cls: string }) {
  const m = r?.model.metrics[k];
  if (!m) return <Dash />;
  return (
    <>
      <span className={`font-mono ${cls}`}>
        {formatPct(m.accuracy)}
        {isThin(m) && <span title="Thin sample"> †</span>}
      </span>
      <span className="block text-[11px] font-normal text-muted">{sampleLabel(m)}</span>
    </>
  );
}

function fmtDate(d: string | null) {
  return d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

function resolvePair(catalog: Catalog, pair: string) {
  const [aSlug, bSlug] = decodeURIComponent(pair).split("-vs-");
  const ranked = [...catalog.models].sort(
    (x, y) =>
      y.stats.net_score - x.stats.net_score || (y.release_date ?? "").localeCompare(x.release_date ?? "")
  );
  const a = (aSlug && catalog.bySlug.get(aSlug)) || ranked[0];
  const b = (bSlug && catalog.bySlug.get(bSlug)) || ranked.find((m) => m.slug !== a?.slug) || ranked[1];
  return { a, b, exact: !!(aSlug && bSlug && catalog.bySlug.has(aSlug) && catalog.bySlug.has(bSlug)) };
}

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }) {
  const [{ pair }, catalog] = await Promise.all([params, loadCatalog()]);
  const { a, b, exact } = resolvePair(catalog, pair);
  if (!a || !b || !exact) return { title: "Compare models" };
  const value = await loadValueData(catalog);
  const va = value.ok ? value.byId.get(a.id) : undefined;
  const vb = value.ok ? value.byId.get(b.id) : undefined;
  const title = `${a.name} vs ${b.name}`;
  const description =
    va && vb
      ? buildVerdict(verdictSide(va, a.name), verdictSide(vb, b.name))
      : `${a.name} and ${b.name} side by side: price, context, parameters, modalities, and what the community thinks.`;
  const image = { url: `/compare/${pair}/og.png`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ComparePairPage({ params }: { params: Promise<{ pair: string }> }) {
  const [{ pair }, catalog] = await Promise.all([params, loadCatalog()]);
  const { a, b } = resolvePair(catalog, pair);

  if (!a || !b) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Compare models</h1>
        <div className="rounded-sm border border-edge bg-surface p-6 text-sm">
          <p className="font-semibold">Model data unavailable</p>
          <p className="mt-1 text-muted">The model catalog could not be loaded right now. Try again later.</p>
        </div>
      </div>
    );
  }

  const value = await loadValueData(catalog);
  const va = (value.ok && value.byId.get(a.id)) || null;
  const vb = (value.ok && value.byId.get(b.id)) || null;
  const showUsage = value.ok && value.showUsage;
  const community = catalog.source === "d1";

  const verdict = va && vb ? buildVerdict(verdictSide(va, a.name), verdictSide(vb, b.name)) : null;
  const notBenched = [!va && a.name, !vb && b.name].filter(Boolean) as string[];

  const options = [...catalog.models]
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((m) => ({ slug: m.slug, name: m.name, vendor: m.vendor }));

  const price = (m: ModelWithStats) =>
    m.price_in == null && m.price_out == null ? (
      <Dash />
    ) : (
      <>
        {formatPrice(m.price_in)}
        <span className="mx-1 font-normal text-muted">/</span>
        {formatPrice(m.price_out)}
        <span className="block text-[11px] font-normal text-muted">per 1M tokens</span>
      </>
    );

  const paramCount = (m: ModelWithStats) =>
    totalParams(m) ? (
      <>
        {totalParams(m)}
        {paramsDetail(m) && <span className="block text-[11px] font-normal text-muted">{paramsDetail(m)}</span>}
      </>
    ) : (
      <span className="text-muted">Undisclosed</span>
    );

  const usage = (r: Scored | null) =>
    !showUsage || !r ? (
      <Dash />
    ) : r.model.usage ? (
      <>
        <span className="font-mono">{formatUsage(r.model.usage)}</span>
        <span className="block text-[11px] font-normal text-muted">tokens, last 7 days</span>
      </>
    ) : (
      <span className="text-muted">Outside top list</span>
    );

  const anyThin = [va, vb].some((r) => r && r.thin.length > 0);
  const [scoreA, scoreB] = pick(va?.score, vb?.score);
  const [qA, qB] = pick(va?.quality, vb?.quality);
  const [gA, gB] = pick(va?.model.metrics.gpqa_diamond?.accuracy, vb?.model.metrics.gpqa_diamond?.accuracy);
  const [tA, tB] = pick(
    va?.model.metrics.tau_bench_verified_airline?.accuracy,
    vb?.model.metrics.tau_bench_verified_airline?.accuracy
  );
  const [cA, cB] = pick(va?.cost, vb?.cost, true);
  const [sA, sB] = pick(va?.timeS, vb?.timeS, true);
  const [uA, uB] = pick(va?.model.usage?.rank, vb?.model.usage?.rank, true);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">
          {a.name} vs {b.name}
        </h1>
        {verdict ? (
          <p className="mt-1 max-w-2xl text-sm">{verdict}</p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {notBenched.join(" and ")} {notBenched.length === 1 ? "is" : "are"} not benchmarked yet, so
            there is no value comparison.
          </p>
        )}
      </div>

      <div className="border border-edge bg-surface">
        <div className={`${GRID} border-b border-edge bg-surface-2/40 py-3`}>
          <div className="self-end pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            tap to swap
          </div>
          <div className="col-span-2">
            <Suspense fallback={null}>
              <ComparePicker
                options={options}
                a={a.slug}
                b={b.slug}
                triggerA={<ModelHead m={a} color={COMPARE_COLORS[0]} />}
                triggerB={<ModelHead m={b} color={COMPARE_COLORS[1]} />}
              />
            </Suspense>
          </div>
        </div>

        <SectionHead
          title="Value"
          note={
            <>
              Balanced preset of the{" "}
              <Link href="/value" className="underline hover:text-foreground">
                value tier list
              </Link>
            </>
          }
        />
        <Row
          label="Tier"
          a={va ? <TierBadge tier={va.tier} /> : <span className="text-muted">Not benchmarked yet</span>}
          b={vb ? <TierBadge tier={vb.tier} /> : <span className="text-muted">Not benchmarked yet</span>}
        />
        <Row
          label="Value score"
          a={va ? <span className={`font-mono ${scoreA}`}>{va.score.toFixed(1)}</span> : <Dash />}
          b={vb ? <span className={`font-mono ${scoreB}`}>{vb.score.toFixed(1)}</span> : <Dash />}
        />
        <Row
          label="Quality (Q)"
          a={va ? <span className={`font-mono ${qA}`}>{va.quality.toFixed(1)}</span> : <Dash />}
          b={vb ? <span className={`font-mono ${qB}`}>{vb.quality.toFixed(1)}</span> : <Dash />}
        />
        <Row label="GPQA" a={<Accuracy r={va} k="gpqa_diamond" cls={gA} />} b={<Accuracy r={vb} k="gpqa_diamond" cls={gB} />} />
        <Row
          label="τ²-bench"
          a={<Accuracy r={va} k="tau_bench_verified_airline" cls={tA} />}
          b={<Accuracy r={vb} k="tau_bench_verified_airline" cls={tB} />}
        />
        <Row
          label="Cost / task"
          a={va ? <span className={`font-mono ${cA}`}>{formatCost(va.cost)}</span> : <Dash />}
          b={vb ? <span className={`font-mono ${cB}`}>{formatCost(vb.cost)}</span> : <Dash />}
        />
        <Row
          label="Time / task"
          a={va ? <span className={`font-mono ${sA}`}>{formatSeconds(va.timeS)}</span> : <Dash />}
          b={vb ? <span className={`font-mono ${sB}`}>{formatSeconds(vb.timeS)}</span> : <Dash />}
        />
        <Row
          label="Usage rank"
          a={<span className={uA}>{usage(va)}</span>}
          b={<span className={uB}>{usage(vb)}</span>}
        />

        <SectionHead title="Specs" />
        <Row label="In / out" a={price(a)} b={price(b)} />
        <Row label="Context" a={formatContextWindow(a.context_window)} b={formatContextWindow(b.context_window)} />
        <Row label="Params" a={paramCount(a)} b={paramCount(b)} />
        <Row label="Modalities" a={<Modalities m={a} />} b={<Modalities m={b} />} />
        <Row
          label="Weights"
          a={a.license === "open-weights" ? "Open" : "Closed"}
          b={b.license === "open-weights" ? "Open" : "Closed"}
        />
        <Row label="Released" a={fmtDate(a.release_date)} b={fmtDate(b.release_date)} />

        {community && (
          <>
            <SectionHead title="Community" />
            {(a.stats.avg_rating != null || b.stats.avg_rating != null) && (
              <Row
                label="Rating"
                a={
                  a.stats.avg_rating != null ? (
                    <span className="flex items-center gap-1">
                      <StarRating rating={Number(a.stats.avg_rating)} size="text-xs" />
                      <span className="text-xs font-normal text-muted">({a.stats.review_count})</span>
                    </span>
                  ) : (
                    <Dash />
                  )
                }
                b={
                  b.stats.avg_rating != null ? (
                    <span className="flex items-center gap-1">
                      <StarRating rating={Number(b.stats.avg_rating)} size="text-xs" />
                      <span className="text-xs font-normal text-muted">({b.stats.review_count})</span>
                    </span>
                  ) : (
                    <Dash />
                  )
                }
              />
            )}
            <Row label="Votes" a={<Score m={a} />} b={<Score m={b} />} />
          </>
        )}

        <div className={`${GRID} border-t border-edge py-3`}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">About</div>
          {[a, b].map((m) => (
            <p key={m.id} className="line-clamp-6 text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">
              {plainDescription(m.description)}
            </p>
          ))}
        </div>
      </div>

      {anyThin && (
        <p className="text-xs text-muted">
          † Thin sample: the 95% interval is wider than ±5 points. Such results are pulled toward the
          benchmark average before ranking.
        </p>
      )}

      {value.ok && (va || vb) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Quality against cost per task</h2>
          <CompareChart field={value.result.models} a={va} b={vb} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <Link href={`/models/${a.slug}`} className="underline hover:text-foreground">
          {a.name} page
        </Link>
        <Link href={`/models/${b.slug}`} className="underline hover:text-foreground">
          {b.name} page
        </Link>
        <Link href="/compare" className="underline hover:text-foreground">
          Popular comparisons
        </Link>
        {value.ok && (
          <span className="sm:ml-auto">
            Benchmarks: OpenRouter, CC BY 4.0, snapshot {value.snapshotDate}
          </span>
        )}
      </div>
    </div>
  );
}
