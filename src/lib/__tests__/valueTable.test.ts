import { describe, expect, it } from "vitest";
import { presetWeights, scoreModels, type BenchMetric, type ValueModel } from "../value";
import {
  EMPTY_FILTERS,
  filterRows,
  hasActiveFilters,
  labOptions,
  matchesQuery,
  nextSort,
  pageList,
  paginate,
  sortRows,
  type ValueRow,
} from "../valueTable";

function metric(accuracy: number, cost: number | null, durationMs: number | null): BenchMetric {
  return { accuracy, cost, durationMs, outputTokens: 1000, pinned: false, runs: 1, tasks: 1000 };
}

function model(
  id: string,
  acc: number,
  cost: number | null,
  timeMs: number | null,
  over: Partial<ValueModel> = {}
): ValueModel {
  const vendorSlug = id.split("/")[0];
  return {
    id,
    name: id.split("/")[1],
    vendor: vendorSlug.toUpperCase(),
    vendorSlug,
    slug: id.split("/")[1],
    usage: null,
    metrics: {
      gpqa_diamond: metric(acc, cost, timeMs),
      tau_bench_verified_airline: metric(acc, cost, timeMs),
    },
    ...over,
  };
}

const MODELS: ValueModel[] = [
  model("acme/big", 0.9, 0.5, 60_000, { openWeights: false, usage: { rank: 2, tokens: 10 } }),
  model("acme/mid", 0.7, 0.05, 20_000, { openWeights: true, usage: { rank: 1, tokens: 20 } }),
  model("zeta/tiny", 0.5, 0.001, 2_000, { openWeights: true, name: "Tiny Zéta" }),
  model("zeta/slow", 0.4, 0.01, 90_000, { openWeights: null }),
  model("beta/nocost", 0.6, null, null, { openWeights: false }),
];

const scored = scoreModels(MODELS, presetWeights("balanced"));
const rows: ValueRow[] = scored.models;
const ids = (rs: ValueRow[]) => rs.map((r) => r.model.id);

describe("matchesQuery", () => {
  it("matches every term against name, vendor and id, ignoring case and accents", () => {
    const m = { id: "zeta/tiny", name: "Tiny Zéta", vendor: "ZETA" };
    expect(matchesQuery(m, "")).toBe(true);
    expect(matchesQuery(m, "  ")).toBe(true);
    expect(matchesQuery(m, "zeta tiny")).toBe(true);
    expect(matchesQuery(m, "TINY")).toBe(true);
    expect(matchesQuery(m, "zéta")).toBe(true);
    expect(matchesQuery(m, "tiny acme")).toBe(false);
  });
});

describe("filterRows", () => {
  const median = scored.medianTimeS;

  it("returns every row with no filters", () => {
    expect(filterRows(rows, EMPTY_FILTERS, median)).toHaveLength(MODELS.length);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("open weights keeps only models the catalog marks open", () => {
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, openWeights: true }, median)).sort()).toEqual([
      "acme/mid",
      "zeta/tiny",
    ]);
  });

  it("cheap keeps models under $0.02 per task and drops those without cost", () => {
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, cheap: true }, median)).sort()).toEqual([
      "zeta/slow",
      "zeta/tiny",
    ]);
  });

  it("fast keeps models strictly below the median time", () => {
    // times: 60, 20, 2, 90 s (nocost has none) -> median 40 s
    expect(median).toBeCloseTo(40, 9);
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, fast: true }, median)).sort()).toEqual([
      "acme/mid",
      "zeta/tiny",
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, fast: true }, null)).toEqual([]);
  });

  it("frontier only keeps frontier models", () => {
    const out = filterRows(rows, { ...EMPTY_FILTERS, frontierOnly: true }, median);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.frontier)).toBe(true);
    expect(ids(out)).not.toContain("zeta/slow"); // beaten by tiny: better and cheaper
  });

  it("lab and search combine with the other filters", () => {
    const f = { ...EMPTY_FILTERS, lab: "zeta", query: "tiny" };
    expect(hasActiveFilters(f)).toBe(true);
    expect(ids(filterRows(rows, f, median))).toEqual(["zeta/tiny"]);
    expect(filterRows(rows, { ...f, cheap: true, fast: true, openWeights: true }, median)).toHaveLength(1);
    expect(filterRows(rows, { ...f, lab: "acme" }, median)).toEqual([]);
  });
});

describe("labOptions", () => {
  it("lists labs by model count, then name", () => {
    expect(labOptions(rows)).toEqual([
      { slug: "acme", name: "ACME", count: 2 },
      { slug: "zeta", name: "ZETA", count: 2 },
      { slug: "beta", name: "BETA", count: 1 },
    ]);
  });
});

describe("sortRows", () => {
  it("sorts by rank by default and does not mutate the input", () => {
    const shuffled = [...rows].reverse();
    const out = sortRows(shuffled, { key: "rank", asc: true });
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled[0].rank).toBe(5);
  });

  it("puts missing values last in both directions", () => {
    for (const asc of [true, false]) {
      const out = sortRows(rows, { key: "cost", asc });
      expect(out[out.length - 1].model.id).toBe("beta/nocost");
    }
    expect(ids(sortRows(rows, { key: "cost", asc: true })).slice(0, 2)).toEqual(["zeta/tiny", "zeta/slow"]);
    expect(ids(sortRows(rows, { key: "usage", asc: true })).slice(0, 2)).toEqual(["acme/mid", "acme/big"]);
  });

  it("sorts by name and quality", () => {
    expect(ids(sortRows(rows, { key: "name", asc: true }))[0]).toBe("acme/big");
    expect(ids(sortRows(rows, { key: "quality", asc: false }))[0]).toBe("acme/big");
  });

  it("sorts the optional sentiment and arena fields when present", () => {
    const withExtras = scoreModels(
      [
        model("a/x", 0.5, 0.01, 1000, { sentiment: { positivePct: 80, negativePct: 20, n: 10 }, arena: 1300 }),
        model("a/y", 0.5, 0.01, 1000, { sentiment: { positivePct: 40, negativePct: 60, n: 10 }, arena: 1400 }),
        model("a/z", 0.5, 0.01, 1000, { sentiment: null }),
      ],
      presetWeights("balanced")
    ).models;
    expect(ids(sortRows(withExtras, { key: "sentiment", asc: false }))).toEqual(["a/x", "a/y", "a/z"]);
    expect(ids(sortRows(withExtras, { key: "arena", asc: false }))).toEqual(["a/y", "a/x", "a/z"]);
  });
});

describe("nextSort", () => {
  it("flips the current column and starts others in their natural direction", () => {
    expect(nextSort({ key: "rank", asc: true }, "rank")).toEqual({ key: "rank", asc: false });
    expect(nextSort({ key: "rank", asc: true }, "score")).toEqual({ key: "score", asc: false });
    expect(nextSort({ key: "score", asc: false }, "cost")).toEqual({ key: "cost", asc: true });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1);

  it("slices pages of the given size", () => {
    const p = paginate(items, 2, 25);
    expect(p.items[0]).toBe(26);
    expect(p.items).toHaveLength(25);
    expect(p).toMatchObject({ page: 2, pageCount: 3, total: 60, from: 26, to: 50 });
    expect(paginate(items, 3, 25)).toMatchObject({ from: 51, to: 60 });
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(items, 9, 25).page).toBe(3);
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate(items, Number.NaN, 25).page).toBe(1);
  });

  it("handles an empty list", () => {
    expect(paginate([], 1, 25)).toEqual({ items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

describe("pageList", () => {
  it("shows every page when there are few", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses long runs into gaps around the current page", () => {
    expect(pageList(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageList(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageList(10, 10)).toEqual([1, null, 9, 10]);
    // a gap of exactly one page shows that page instead of an ellipsis
    expect(pageList(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
  });
});
