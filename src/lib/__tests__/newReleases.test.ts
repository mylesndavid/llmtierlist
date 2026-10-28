import { describe, expect, it } from "vitest";
import {
  dedupeListings,
  filterReleases,
  groupByWeek,
  isDuplicateListing,
  labOptions,
  modalityOptions,
  recentReleases,
  toReleaseEntries,
  weekStart,
  type ORModel,
  type ReleaseCatalogRef,
  type ReleaseEntry,
} from "../newReleases";

const day = (s: string) => Date.parse(`${s}T12:00:00Z`) / 1000;

function or(id: string, created: string, over: Partial<ORModel> = {}): ORModel {
  return {
    id,
    name: `Lab: ${id.split("/")[1]}`,
    created: day(created),
    context_length: 128000,
    hugging_face_id: null,
    pricing: { prompt: "0.000001", completion: "0.000004" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    ...over,
  };
}

describe("dedupe", () => {
  it("hides :free/:batch variants whose base is listed, and rolling aliases", () => {
    const ids = new Set(["a/x", "a/x:free", "a/x:batch", "~a/x-latest", "a/x-latest", "b/y:free"]);
    expect(isDuplicateListing("a/x", ids)).toBe(false);
    expect(isDuplicateListing("a/x:free", ids)).toBe(true);
    expect(isDuplicateListing("a/x:batch", ids)).toBe(true);
    expect(isDuplicateListing("~a/x-latest", ids)).toBe(true);
    expect(isDuplicateListing("a/x-latest", ids)).toBe(true);
    // a :free listing with no paid sibling is the only listing, as the sync keeps it
    expect(isDuplicateListing("b/y:free", ids)).toBe(false);
  });

  it("keeps the first listing per slug", () => {
    const out = dedupeListings([{ id: "a/x.1" }, { id: "a/x-1" }, { id: "a/x.1:batch" }]);
    expect(out.map((m) => m.id)).toEqual(["a/x.1"]);
  });
});

describe("toReleaseEntries", () => {
  it("prefers catalog fields and attaches value numbers", () => {
    const catalog = new Map<string, ReleaseCatalogRef>([
      [
        "z-ai/glm",
        {
          slug: "z-ai-glm",
          name: "GLM",
          vendor: "Z.AI",
          vendor_slug: "z-ai",
          release_date: "2026-10-20",
          license: "open-weights",
          price_in: 0.15,
          price_out: 0.6,
          context_window: 200000,
        },
      ],
    ]);
    const value = new Map([["z-ai/glm", { tier: "A", quality: 70.1, score: 75.2 }]]);
    const [glm, other] = toReleaseEntries(
      [or("z-ai/glm", "2026-10-21"), or("q/new", "2026-10-22", { hugging_face_id: "q/new" }), or("q/new:free", "2026-10-22")],
      catalog,
      value
    );
    expect(glm).toMatchObject({
      slug: "z-ai-glm",
      name: "GLM",
      vendor: "Z.AI",
      releaseDate: "2026-10-20",
      priceIn: 0.15,
      openWeights: true,
      value: { tier: "A" },
    });
    expect(other).toMatchObject({
      slug: null,
      name: "new",
      vendor: "Lab",
      vendorSlug: "q",
      releaseDate: "2026-10-22",
      priceIn: 1,
      priceOut: 4,
      openWeights: true,
      value: null,
    });
  });
});

function entry(id: string, releaseDate: string, over: Partial<ReleaseEntry> = {}): ReleaseEntry {
  return {
    id,
    slug: null,
    name: id,
    vendor: id.split("/")[0].toUpperCase(),
    vendorSlug: id.split("/")[0],
    releaseDate,
    priceIn: 1,
    priceOut: 2,
    context: 1000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    openWeights: false,
    value: null,
    ...over,
  };
}

describe("week grouping", () => {
  it("starts weeks on Monday (UTC)", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-26"); // Wednesday
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });

  it("keeps the last 30 days and groups newest week first", () => {
    const now = new Date("2026-10-28T09:00:00Z");
    const all = [
      entry("a/1", "2026-10-26"),
      entry("a/2", "2026-10-28"),
      entry("b/3", "2026-10-25"),
      entry("b/4", "2026-10-13"),
      entry("c/5", "2026-09-29"), // day 30
      entry("c/6", "2026-09-28"), // too old
      entry("c/7", "2026-10-29"), // future
    ];
    const recent = recentReleases(all, now);
    expect(recent.map((e) => e.id)).toEqual(["a/2", "a/1", "b/3", "b/4", "c/5"]);
    const weeks = groupByWeek(recent, now);
    expect(weeks.map((w) => [w.start, w.label, w.entries.map((e) => e.id)])).toEqual([
      ["2026-10-26", "This week", ["a/2", "a/1"]],
      ["2026-10-19", "Last week", ["b/3"]],
      ["2026-10-12", "Week of Oct 12", ["b/4"]],
      ["2026-09-28", "Week of Sep 28", ["c/5"]],
    ]);
  });
});

describe("filters", () => {
  const all = [
    entry("a/1", "2026-10-26", { openWeights: true, inputModalities: ["text", "image"] }),
    entry("a/2", "2026-10-26"),
    entry("b/3", "2026-10-26", { outputModalities: ["text", "audio"] }),
  ];
  it("filters by lab, open weights and modality", () => {
    expect(filterReleases(all, { lab: "a" }).map((e) => e.id)).toEqual(["a/1", "a/2"]);
    expect(filterReleases(all, { open: true }).map((e) => e.id)).toEqual(["a/1"]);
    expect(filterReleases(all, { modality: "image" }).map((e) => e.id)).toEqual(["a/1"]);
    expect(filterReleases(all, { modality: "audio" }).map((e) => e.id)).toEqual(["b/3"]);
    expect(filterReleases(all, {}).length).toBe(3);
  });
  it("lists labs and modalities present", () => {
    expect(labOptions(all)).toEqual([
      { slug: "a", name: "A", count: 2 },
      { slug: "b", name: "B", count: 1 },
    ]);
    expect(modalityOptions(all)).toEqual(["text", "image", "audio"]);
  });
});
