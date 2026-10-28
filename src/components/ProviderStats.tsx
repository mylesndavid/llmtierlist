import { formatPrice } from "@/lib/tiers";
import { PROVIDER_STATS_ENABLED, type ProviderStat } from "@/lib/providers";
import { loadProviders } from "@/lib/providersData";

type Column = {
  key: string;
  label: string;
  align?: "right";
  has: (p: ProviderStat) => boolean;
  render: (p: ProviderStat) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "price",
    label: "In / out per 1M",
    align: "right",
    has: (p) => p.priceIn != null || p.priceOut != null,
    render: (p) => `${formatPrice(p.priceIn)} / ${formatPrice(p.priceOut)}`,
  },
  {
    key: "uptime",
    label: "Uptime",
    align: "right",
    has: (p) => p.uptime != null,
    render: (p) => (p.uptime != null ? `${p.uptime.toFixed(p.uptime >= 99.95 ? 0 : 1)}%` : "—"),
  },
  {
    key: "latency",
    label: "Latency",
    align: "right",
    has: (p) => p.latencyMs != null,
    render: (p) =>
      p.latencyMs == null ? "—" : p.latencyMs >= 1000 ? `${(p.latencyMs / 1000).toFixed(2)} s` : `${Math.round(p.latencyMs)} ms`,
  },
  {
    key: "throughput",
    label: "Throughput",
    align: "right",
    has: (p) => p.throughput != null,
    render: (p) => (p.throughput == null ? "—" : `${Math.round(p.throughput)} tok/s`),
  },
  {
    key: "quant",
    label: "Quantization",
    has: (p) => p.quantization != null,
    render: (p) => p.quantization ?? "—",
  },
];

export function ProviderStatsView({ providers }: { providers: ProviderStat[] }) {
  if (!PROVIDER_STATS_ENABLED || providers.length === 0) return null;
  // Columns with no value for any provider are left out.
  const cols = COLUMNS.filter((c) => providers.some(c.has));
  const hasThroughput = cols.some((c) => c.key === "throughput");
  const hasLive = hasThroughput || cols.some((c) => c.key === "latency");
  // Some providers list several endpoints (regions, tiers); show the tag to tell them apart.
  const counts = new Map<string, number>();
  for (const p of providers) counts.set(p.provider, (counts.get(p.provider) ?? 0) + 1);
  return (
    <section className="space-y-3" aria-labelledby="providers-heading">
      <h2 id="providers-heading" className="text-xl font-bold">
        Providers <span className="text-sm font-normal text-muted">({providers.length})</span>
      </h2>
      <div className="overflow-x-auto border border-edge bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-muted">
            <tr className="border-b border-edge">
              <th className="px-3 py-2 font-semibold">Provider</th>
              {cols.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={`${p.provider}-${p.tag ?? ""}`} className="border-b border-edge last:border-0">
                <td className="px-3 py-2 font-semibold">
                  {p.provider}
                  {(counts.get(p.provider) ?? 0) > 1 && p.tag && (
                    <span className="ml-1.5 text-xs font-normal text-muted">{p.tag}</span>
                  )}
                </td>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-2 tabular-nums ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Provider stats:{" "}
        <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          OpenRouter
        </a>
        . Uptime covers the last day.
        {hasLive ? " Latency and throughput are medians over the last 30 minutes." : ""}{" "}
        {hasThroughput ? "Sorted by throughput." : "No throughput reported right now; sorted by uptime, then price."}
      </p>
    </section>
  );
}

export default async function ProviderStats({ modelId }: { modelId: string }) {
  if (!PROVIDER_STATS_ENABLED) return null;
  const snap = await loadProviders(modelId);
  return <ProviderStatsView providers={snap?.providers ?? []} />;
}
