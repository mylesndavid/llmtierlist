import { describe, expect, it } from "vitest";
import catalog from "./fixtures/or-catalog-sample.json";
import { buildMatchIndex, datesCompatible, matchModel, nameKeys, normalizeVendor } from "../modelMatch";

const index = buildMatchIndex(catalog.data);
const match = (name: string, org?: string) => matchModel(name, org ?? null, index).id;

describe("nameKeys", () => {
  it("lowercases, drops punctuation and moves dates out of the base key", () => {
    expect(nameKeys("Claude Opus 4.1 (20250805)")).toMatchObject({
      base: "claude-opus-4-1",
      full: "claude-opus-4-1-20250805",
      dates: ["20250805"],
    });
    expect(nameKeys("anthropic/claude-opus-4.1").full).toBe("claude-opus-4-1");
    expect(nameKeys("Anthropic: Claude Opus 4.5").full).toBe("claude-opus-4-5");
  });

  it("reads trailing dates in several forms", () => {
    expect(nameKeys("gpt-4o-2024-11-20").full).toBe("gpt-4o-20241120");
    expect(nameKeys("deepseek/deepseek-r1-0528").full).toBe("deepseek-r1-0528");
    expect(nameKeys("qwen/qwen3-235b-a22b-2507").base).toBe("qwen3-235b-a22b");
    expect(nameKeys("gemini-2.5-flash-preview-09-2025").full).toBe("gemini-2-5-flash-preview-092025");
    expect(nameKeys("Qwen3-235B-A22B-Thinking (Jul 2025)").full).toBe("qwen3-235b-a22b-thinking-2507");
  });

  it("treats parentheticals and Epoch _suffixes as settings", () => {
    expect(nameKeys("Claude Opus 4.5 (High, 32K, 20251101)").base).toBe("claude-opus-4-5");
    expect(nameKeys("claude-opus-4-5-20251101_32K").full).toBe("claude-opus-4-5-20251101");
    expect(nameKeys("gpt-5-2025-08-07_high").full).toBe("gpt-5-20250807");
  });

  it("keeps size and version numbers that are not dates", () => {
    expect(nameKeys("Qwen3-235B-A22B").base).toBe("qwen3-235b-a22b");
    expect(nameKeys("llama-3.3-70b-instruct").base).toBe("llama-3-3-70b-instruct");
  });

  it("strips trailing effort and search words only when asked", () => {
    expect(nameKeys("gpt-5-search").base).toBe("gpt-5-search");
    expect(nameKeys("gpt-5-search", { stripTrailingSetting: true }).base).toBe("gpt-5");
    // "max" is part of real names, so it is never stripped
    expect(nameKeys("qwen3-max", { stripTrailingSetting: true }).base).toBe("qwen3-max");
  });
});

describe("datesCompatible", () => {
  it("compares the fields both dates state", () => {
    expect(datesCompatible("20251101", "1101")).toBe(true);
    expect(datesCompatible("2505", "0528")).toBe(true); // May 2025 vs 05-28
    expect(datesCompatible("20260910", "1017")).toBe(false);
    expect(datesCompatible("2411", "2407")).toBe(false);
  });
});

describe("matchModel", () => {
  it("matches names that differ only in case, punctuation and settings", () => {
    expect(match("Claude Opus 4.5 (20251101)")).toBe("anthropic/claude-opus-4.5");
    expect(match("Claude Opus 4.5 (High, 32K, 20251101)")).toBe("anthropic/claude-opus-4.5");
    expect(match("claude-opus-4-5-20251101_32K")).toBe("anthropic/claude-opus-4.5");
    expect(match("GPT-5 (High)")).toBe("openai/gpt-5");
    expect(match("gpt-5-2025-08-07_high")).toBe("openai/gpt-5");
    expect(match("Gemini 2.5 Pro")).toBe("google/gemini-2.5-pro");
  });

  it("matches a dated snapshot exactly when OpenRouter lists it", () => {
    expect(match("GPT-4o (2024-05-13)")).toBe("openai/gpt-4o-2024-05-13");
    expect(match("DeepSeek-V4.1-Flash-20261017 (Max)")).toBe("deepseek/deepseek-v4.1-flash-1017");
    expect(match("Qwen3-235B-A22B-Thinking (Jul 2025)")).toBe("qwen/qwen3-235b-a22b-thinking-2507");
  });

  it("matches a dated name to the one compatible snapshot", () => {
    expect(match("DeepSeek-R1 (May 2025)")).toBe("deepseek/deepseek-r1-0528");
  });

  it("does not match an undated name to a dated snapshot", () => {
    expect(matchModel("DeepSeek-R1", null, index)).toEqual({ id: null, reason: "none" });
  });

  it("refuses ambiguous matches", () => {
    // OpenRouter has mistral-large, -2407 and -2512; 2411 is none of them
    const r = matchModel("Mistral Large (2411)", "mistral", index);
    expect(r.id).toBeNull();
    expect(r).toMatchObject({ reason: "ambiguous" });
    // undated id has a dated sibling, so it may not be the 0910 snapshot
    expect(matchModel("DeepSeek-V4.1-Flash-20260910 (Max)", null, index)).toMatchObject({
      id: null,
      reason: "ambiguous",
    });
    // GPT-4o has several snapshots; an unknown date picks none of them
    expect(match("GPT-4o (2024-08-06)")).toBeNull();
  });

  it("uses the alias table for names the rules cannot resolve", () => {
    expect(matchModel("Qwen3-235B-A22B-Instruct (2507)", null, index)).toEqual({
      id: "qwen/qwen3-235b-a22b-2507",
      via: "alias",
    });
    expect(match("Llama 4 Maverick 17B 128E Instruct")).toBe("meta-llama/llama-4-maverick");
    expect(match("Gemini 3 Flash")).toBe("google/gemini-3-flash-preview");
  });

  it("maps LMArena search entries to the base model", () => {
    expect(match("claude-opus-4-5-search")).toBe("anthropic/claude-opus-4.5");
  });

  it("ignores OpenRouter variant ids such as :batch", () => {
    expect(index.full.get("claude-opus-4-5")).toEqual(new Set(["anthropic/claude-opus-4.5"]));
  });

  it("returns none for unknown models", () => {
    expect(match("Muse Spark")).toBeNull();
  });
});

describe("normalizeVendor", () => {
  it("maps source organizations to OpenRouter prefixes", () => {
    expect(normalizeVendor("xai")).toBe("x-ai");
    expect(normalizeVendor("Z.ai (Zhipu AI),Tsinghua University")).toBe("z-ai");
    expect(normalizeVendor("Google DeepMind,Google")).toBe("google");
    expect(normalizeVendor(null)).toBeNull();
  });
});
