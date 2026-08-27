import Link from "next/link";
import { Suspense } from "react";
import { getBaseModelsWithStats, getCurrentUser, getUserVotes } from "@/lib/data";
import { formatContextWindow, formatPrice, modalityList, paramsDetail, plainDescription } from "@/lib/tiers";
import VendorLogo from "@/components/VendorLogo";
import VoteButtons from "@/components/VoteButtons";
import ModalityIcon from "@/components/ModalityIcons";
import ComparePicker from "@/components/ComparePicker";
import StarRating from "@/components/StarRating";
import type { ModelWithStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compare models" };

function totalParams(m: ModelWithStats) {
  if (m.params_b == null) return null;
  return m.params_b >= 1000
    ? `${(m.params_b / 1000).toFixed(m.params_b % 1000 === 0 ? 0 : 1)}T`
    : `${m.params_b}B`;
}

function Row({
  label,
  a,
  b,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_1fr] items-start gap-2 border-b border-edge px-3 py-2.5 last:border-b-0 sm:grid-cols-[7rem_1fr_1fr] sm:gap-4 sm:px-4">
      <div className="pt-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted">
        {label}
      </div>
      <div className="text-sm font-semibold [overflow-wrap:anywhere]">{a}</div>
      <div className="text-sm font-semibold [overflow-wrap:anywhere]">{b}</div>
    </div>
  );
}

function Modalities({ m }: { m: ModelWithStats }) {
  const inputs = modalityList(m.input_modalities);
  const outputs = modalityList(m.output_modalities);
  if (inputs.length === 0) return <span className="text-muted">—</span>;
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

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [{ a: aSlug, b: bSlug }, models, userVotes, user] = await Promise.all([
    searchParams,
    getBaseModelsWithStats(),
    getUserVotes(),
    getCurrentUser(),
  ]);

  const ranked = [...models].sort(
    (x, y) =>
      y.stats.net_score - x.stats.net_score ||
      (y.release_date ?? "").localeCompare(x.release_date ?? "")
  );
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const a = (aSlug && bySlug.get(aSlug)) || ranked[0];
  const b = (bSlug && bySlug.get(bSlug)) || ranked.find((m) => m.slug !== a.slug) || ranked[1];

  const options = [...models]
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((m) => ({ slug: m.slug, name: m.name, vendor: m.vendor }));

  const price = (m: ModelWithStats) =>
    m.price_in == null && m.price_out == null ? (
      <span className="text-muted">—</span>
    ) : (
      <>
        {formatPrice(m.price_in)}
        <span className="mx-1 font-normal text-muted">/</span>
        {formatPrice(m.price_out)}
        <span className="block text-[11px] font-normal text-muted">per 1M tokens</span>
      </>
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Compare models</h1>
        <p className="mt-1 text-sm text-muted">
          Two models, same numbers, side by side.
        </p>
      </div>

      <Suspense fallback={null}>
        <ComparePicker options={options} a={a.slug} b={b.slug} />
      </Suspense>

      <div className="border border-edge bg-surface">
        {/* headers */}
        <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-2 border-b border-edge bg-surface-2/40 px-3 py-3 sm:grid-cols-[7rem_1fr_1fr] sm:gap-4 sm:px-4">
          <div />
          {[a, b].map((m) => (
            <div key={m.id} className="min-w-0">
              <Link href={`/labs/${m.vendor_slug}`} className="mb-1.5 block h-8 w-8">
                <span className="grid h-8 w-8 place-items-center rounded-sm bg-surface p-1.5">
                  <VendorLogo vendorSlug={m.vendor_slug} className="h-full w-full" />
                </span>
              </Link>
              <Link
                href={`/models/${m.slug}`}
                className="block text-sm font-bold leading-tight hover:underline [overflow-wrap:anywhere]"
              >
                {m.name}
              </Link>
              <div className="truncate text-xs text-muted">{m.vendor}</div>
            </div>
          ))}
        </div>

        <Row label="In / out" a={price(a)} b={price(b)} />
        <Row
          label="Context"
          a={formatContextWindow(a.context_window)}
          b={formatContextWindow(b.context_window)}
        />
        <Row
          label="Params"
          a={
            totalParams(a) ? (
              <>
                {totalParams(a)}
                {paramsDetail(a) && (
                  <span className="block text-[11px] font-normal text-muted">{paramsDetail(a)}</span>
                )}
              </>
            ) : (
              <span className="text-muted">Undisclosed</span>
            )
          }
          b={
            totalParams(b) ? (
              <>
                {totalParams(b)}
                {paramsDetail(b) && (
                  <span className="block text-[11px] font-normal text-muted">{paramsDetail(b)}</span>
                )}
              </>
            ) : (
              <span className="text-muted">Undisclosed</span>
            )
          }
        />
        <Row label="Modalities" a={<Modalities m={a} />} b={<Modalities m={b} />} />
        <Row
          label="Weights"
          a={a.license === "open-weights" ? "Open" : "Closed"}
          b={b.license === "open-weights" ? "Open" : "Closed"}
        />
        <Row
          label="Released"
          a={
            a.release_date
              ? new Date(a.release_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"
          }
          b={
            b.release_date
              ? new Date(b.release_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"
          }
        />
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
              <span className="text-muted">—</span>
            )
          }
          b={
            b.stats.avg_rating != null ? (
              <span className="flex items-center gap-1">
                <StarRating rating={Number(b.stats.avg_rating)} size="text-xs" />
                <span className="text-xs font-normal text-muted">({b.stats.review_count})</span>
              </span>
            ) : (
              <span className="text-muted">—</span>
            )
          }
        />
        )}
        <Row
          label="Votes"
          a={
            <VoteButtons
              modelId={a.id}
              netScore={a.stats.net_score}
              userVote={userVotes[a.id] ?? 0}
              signedIn={!!user}
            />
          }
          b={
            <VoteButtons
              modelId={b.id}
              netScore={b.stats.net_score}
              userVote={userVotes[b.id] ?? 0}
              signedIn={!!user}
            />
          }
        />
        <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-2 px-3 py-3 sm:grid-cols-[7rem_1fr_1fr] sm:gap-4 sm:px-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">About</div>
          {[a, b].map((m) => (
            <p
              key={m.id}
              className="line-clamp-6 text-xs leading-relaxed text-muted [overflow-wrap:anywhere]"
            >
              {plainDescription(m.description)}
            </p>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        llmtierlist.com/compare — swap either model above; the link is shareable.
      </p>
    </div>
  );
}
