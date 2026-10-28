/**
 * OpenRouter per-provider stats for one model, from
 * GET https://openrouter.ai/api/v1/models/<author>/<slug>/endpoints.
 *
 * OpenRouter's terms do not clearly allow republishing these numbers, so the
 * section is credited and can be switched off with this one constant.
 */
export const PROVIDER_STATS_ENABLED = true;
export const PROVIDER_CREDIT = "Provider stats: OpenRouter";

export interface ProviderStat {
  provider: string;
  tag: string | null;
  quantization: string | null;
  /** USD per 1M tokens */
  priceIn: number | null;
  priceOut: number | null;
  /** percent, last day */
  uptime: number | null;
  /** median ms to first token, last 30 minutes */
  latencyMs: number | null;
  /** median tokens per second, last 30 minutes */
  throughput: number | null;
  contextLength: number | null;
}

export function endpointsUrl(modelId: string): string | null {
  const m = modelId.match(/^([a-z0-9._-]+)\/([a-z0-9._:-]+)$/i);
  if (!m) return null;
  return `https://openrouter.ai/api/v1/models/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}/endpoints`;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Latency and throughput come as a number or as percentiles ({p50, p75, ...}). */
function stat(v: unknown): number | null {
  if (v && typeof v === "object") return num((v as Record<string, unknown>).p50);
  return num(v);
}

function perMillion(v: unknown): number | null {
  const n = num(v);
  if (n == null || n < 0) return null; // OpenRouter uses -1 for "varies"
  return Math.round(n * 1e6 * 1e6) / 1e6;
}

/** Parse an /endpoints response. Throws when the payload has no endpoint list. */
export function parseEndpoints(json: unknown): ProviderStat[] {
  const data = (json as { data?: { endpoints?: unknown } } | null)?.data;
  if (!data || !Array.isArray(data.endpoints)) throw new Error("endpoints payload has no data.endpoints");
  const out: ProviderStat[] = [];
  for (const raw of data.endpoints as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const provider = typeof raw.provider_name === "string" ? raw.provider_name : null;
    if (!provider) continue;
    const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
    const quant = typeof raw.quantization === "string" ? raw.quantization : null;
    out.push({
      provider,
      tag: typeof raw.tag === "string" ? raw.tag : null,
      quantization: quant && quant !== "unknown" ? quant : null,
      priceIn: perMillion(pricing.prompt),
      priceOut: perMillion(pricing.completion),
      uptime: num(raw.uptime_last_1d),
      latencyMs: stat(raw.latency_last_30m),
      throughput: stat(raw.throughput_last_30m),
      contextLength: num(raw.context_length),
    });
  }
  return sortProviders(out);
}

/** Fastest first; providers without throughput go last, then by uptime, then price. */
export function sortProviders(list: ProviderStat[]): ProviderStat[] {
  const desc = (a: number | null, b: number | null) =>
    a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : b - a;
  const asc = (a: number | null, b: number | null) =>
    a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a - b;
  return [...list].sort(
    (a, b) =>
      desc(a.throughput, b.throughput) ||
      desc(a.uptime, b.uptime) ||
      asc(a.priceOut, b.priceOut) ||
      a.provider.localeCompare(b.provider)
  );
}
