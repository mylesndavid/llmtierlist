"use client";

import { useMemo, useState } from "react";
import TierBoard from "./TierBoard";
import FullscreenBoard from "./FullscreenBoard";
import ValueScatter from "./ValueScatter";
import ValueTable from "./ValueTable";
import {
  BENCHMARKS,
  DEFAULT_BENCHMARK_WEIGHTS,
  DEFAULT_PRESET,
  PRESETS,
  SHRINK_TASKS,
  USAGE_DAYS,
  formatCost,
  formatSeconds,
  presetByKey,
  scoreModels,
  type BenchmarkKey,
  type PresetKey,
  type ValueModel,
} from "@/lib/value";
import type { Model } from "@/lib/types";

/** TierBoard/ModelChip want a catalog Model; fill what the chip shows and null the rest. */
function toChipModel(v: ValueModel): Model {
  return {
    id: v.id,
    slug: v.slug ?? "",
    name: v.name,
    vendor: v.vendor,
    vendor_slug: v.vendorSlug,
    description: "",
    license: "proprietary",
    release_date: null,
    context_window: null,
    base_model_id: null,
    variant: null,
    price_in: null,
    price_out: null,
    input_modalities: null,
    output_modalities: null,
    params_b: null,
    active_params_b: null,
    is_moe: 0,
    hf_id: null,
    experts: null,
    experts_active: null,
    // TierBoard skips the /models link for custom entries; models outside the catalog have no page.
    is_custom: v.slug ? 0 : 1,
  };
}

function Slider({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--foreground)]"
      />
    </label>
  );
}

export default function ValueTierList({
  models,
  initialPreset,
  showUsage,
}: {
  models: ValueModel[];
  initialPreset: PresetKey;
  showUsage: boolean;
}) {
  const start = presetByKey(initialPreset) ?? presetByKey(DEFAULT_PRESET)!;
  const [preset, setPreset] = useState<PresetKey | null>(start.key);
  const [costWeight, setCostWeight] = useState<number>(start.costWeight);
  const [timeWeight, setTimeWeight] = useState<number>(start.timeWeight);
  const [benchWeights, setBenchWeights] = useState<Record<BenchmarkKey, number>>({
    ...DEFAULT_BENCHMARK_WEIGHTS,
  });

  const result = useMemo(
    () => scoreModels(models, { costWeight, timeWeight, benchmarkWeights: benchWeights }),
    [models, costWeight, timeWeight, benchWeights]
  );

  const placements = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const [tier, rows] of result.tiers) {
      const sorted = [...rows].sort((a, b) => a.rank - b.rank);
      map.set(tier, sorted.map((r) => toChipModel(r.model)));
    }
    return map;
  }, [result]);

  function syncUrl(key: PresetKey | null) {
    const url = new URL(window.location.href);
    if (key && key !== DEFAULT_PRESET) url.searchParams.set("preset", key);
    else url.searchParams.delete("preset");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  function choosePreset(key: PresetKey) {
    const p = presetByKey(key)!;
    setPreset(key);
    setCostWeight(p.costWeight);
    setTimeWeight(p.timeWeight);
    setBenchWeights({ ...DEFAULT_BENCHMARK_WEIGHTS });
    syncUrl(key);
  }

  function custom<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      if (preset) {
        setPreset(null);
        syncUrl(null);
      }
    };
  }

  const benchTotal = BENCHMARKS.reduce((s, b) => s + benchWeights[b.key], 0);
  const benchShare = (k: BenchmarkKey) =>
    Math.round((benchTotal > 0 ? benchWeights[k] / benchTotal : 1 / BENCHMARKS.length) * 100);

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-sm border border-edge bg-surface p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Weight presets">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              onClick={() => choosePreset(p.key)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${
                preset === p.key
                  ? "border-foreground bg-foreground font-semibold text-black"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset == null && (
            <span className="self-center text-xs text-muted">Custom weights</span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Slider label="Cost weight" value={costWeight} max={15} step={1} onChange={custom(setCostWeight)} />
          <Slider label="Time weight" value={timeWeight} max={15} step={1} onChange={custom(setTimeWeight)} />
          {BENCHMARKS.map((b) => (
            <Slider
              key={b.key}
              label={`${b.label} weight`}
              value={benchWeights[b.key]}
              max={3}
              step={0.5}
              onChange={custom((v: number) => setBenchWeights((w) => ({ ...w, [b.key]: v })))}
            />
          ))}
        </div>
      </section>

      <FullscreenBoard title="The value tier list">
        <TierBoard placements={placements} />
      </FullscreenBoard>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Quality against cost</h2>
        <p className="text-sm text-muted">
          Each point is a model. Points on the line are the frontier: no other
          model scores higher for less. Faded points are beaten on both.
        </p>
        <ValueScatter rows={result.models} showUsage={showUsage} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">All models</h2>
        <ValueTable rows={result.models} showUsage={showUsage} />
      </section>

      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-lg font-semibold text-foreground">How it&apos;s scored</h2>
        <p>
          Only models with results on both {BENCHMARKS.map((b) => b.label).join(" and ")} are
          included ({result.models.length} models). Results come from OpenRouter&apos;s default
          routing where available; otherwise from an average of the providers it tested, weighted
          by number of questions (marked with *).
        </p>
        <p>
          Quality (Q) is each model&apos;s percentile rank on each benchmark, using the
          adjusted accuracy described below, 0 to 100, averaged
          with weights {BENCHMARKS.map((b) => `${b.short} ${benchShare(b.key)}%`).join(", ")}.
        </p>
        <p>
          Cost and time are the geometric means across the two benchmarks of the average cost and
          generation time per task. The median model costs {formatCost(result.medianCost)} and
          takes {formatSeconds(result.medianTimeS)} per task.
        </p>
        <p className="font-mono text-foreground">
          score = Q − {costWeight} × log2(cost ÷ median cost) − {timeWeight} × log2(time ÷ median
          time)
        </p>
        <p>
          So each doubling of cost above the median takes {costWeight} points off, and each
          doubling of time takes {timeWeight}. Being cheaper or faster than the median adds the
          same amount. If a model has no cost or time data, that term is left out.
        </p>
        <p>
          Tiers split the ranking by percentile: S is the top 10%, A to 30%, B to 55%, C to 80%, D
          to 95%, F the rest. Models with equal scores share a tier.
        </p>
        <p>
          Scores from few tasks are pulled toward the benchmark average before ranking, so a lucky small sample can&apos;t top the list. Each accuracy is blended
          with the benchmark&apos;s average as if that average had been measured on{" "}
          {SHRINK_TASKS} more tasks, so a result from 50 tasks moves two thirds of the way to the
          average and one from 2,000 tasks barely moves. Results whose 95% interval is wider than
          ±5 points are marked with †; the mark is information only.
        </p>
        {showUsage && (
          <p>
            Usage is total tokens on OpenRouter over the last {USAGE_DAYS} days, ranked against
            every model in OpenRouter&apos;s daily top list. Variants such as :free count toward
            their model. It is shown for context and does not affect the score.
          </p>
        )}
      </section>
    </div>
  );
}
