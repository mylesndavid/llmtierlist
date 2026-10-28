import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/or-endpoints-sample.json";
import { endpointsUrl, parseEndpoints, sortProviders, type ProviderStat } from "../providers";
import { loadProviders, resetProviderMemoryCache } from "../providersData";

describe("endpointsUrl", () => {
  it("builds the per-model endpoints URL", () => {
    expect(endpointsUrl("anthropic/claude-opus-4.5")).toBe(
      "https://openrouter.ai/api/v1/models/anthropic/claude-opus-4.5/endpoints"
    );
    expect(endpointsUrl("no-slash")).toBeNull();
    expect(endpointsUrl("a/b/c")).toBeNull();
  });
});

describe("parseEndpoints", () => {
  it("reads the live payload, with null latency and throughput", () => {
    const list = parseEndpoints(fixture);
    expect(list.length).toBe(fixture.data.endpoints.length);
    const deepinfra = list.find((p) => p.provider === "DeepInfra")!;
    expect(deepinfra.priceIn).toBeCloseTo(0.1, 6);
    expect(deepinfra.priceOut).toBeCloseTo(0.32, 6);
    expect(deepinfra.quantization).toBe("fp8");
    expect(deepinfra.uptime).toBeGreaterThan(90);
    expect(deepinfra.latencyMs).toBeNull();
    expect(deepinfra.throughput).toBeNull();
  });

  it("accepts plain numbers or percentile objects, and drops unknown values", () => {
    const list = parseEndpoints({
      data: {
        endpoints: [
          {
            provider_name: "A",
            pricing: { prompt: "-1", completion: "0.000002" },
            quantization: "unknown",
            uptime_last_1d: null,
            latency_last_30m: { p50: 420, p90: 900 },
            throughput_last_30m: { p50: 55.5 },
          },
          { provider_name: "B", pricing: {}, latency_last_30m: 300, throughput_last_30m: 120 },
          { pricing: {} }, // no provider name
        ],
      },
    });
    expect(list.map((p) => p.provider)).toEqual(["B", "A"]); // faster first
    const a = list[1];
    expect(a.priceIn).toBeNull();
    expect(a.priceOut).toBeCloseTo(2, 6);
    expect(a.quantization).toBeNull();
    expect(a.uptime).toBeNull();
    expect(a.latencyMs).toBe(420);
    expect(a.throughput).toBe(55.5);
  });

  it("throws when the payload has no endpoint list", () => {
    expect(() => parseEndpoints({ error: { code: 404 } })).toThrow();
  });
});

describe("sortProviders", () => {
  const p = (provider: string, over: Partial<ProviderStat>): ProviderStat => ({
    provider,
    tag: null,
    quantization: null,
    priceIn: null,
    priceOut: null,
    uptime: null,
    latencyMs: null,
    throughput: null,
    contextLength: null,
    ...over,
  });

  it("orders by throughput, then uptime, then output price; nulls last", () => {
    const sorted = sortProviders([
      p("slow", { throughput: 10 }),
      p("none-cheap", { priceOut: 1 }),
      p("fast", { throughput: 90 }),
      p("none-reliable", { uptime: 99 }),
    ]);
    expect(sorted.map((x) => x.provider)).toEqual(["fast", "slow", "none-reliable", "none-cheap"]);
  });
});

describe("loadProviders", () => {
  beforeEach(() => {
    resetProviderMemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns providers for a model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture))));
    const snap = await loadProviders("meta-llama/llama-3.3-70b-instruct");
    expect(snap?.providers.length).toBe(fixture.data.endpoints.length);
  });

  it("returns an empty list on 404 and null on other failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect((await loadProviders("x/unknown"))?.providers).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await loadProviders("x/broken")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    expect(await loadProviders("x/offline")).toBeNull();
  });
});
