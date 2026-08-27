// Sync the model catalog from OpenRouter into Cloudflare D1 and copy vendor
// logos from @lobehub/icons-static-svg into public/logos/.
//
// Usage: npm run sync:models
// Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID
// (env or .env.local).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// -- load env from .env.local if not already set
try {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_DB = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!CF_TOKEN || !CF_ACCOUNT || !CF_DB) {
  console.error("Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID");
  process.exit(1);
}

async function d1(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(`D1: ${JSON.stringify(data.errors)}`);
  return data;
}

// vendor slug (OpenRouter author prefix) -> [display name, lobehub icon base]
const VENDORS = {
  openai: ["OpenAI", "openai"],
  anthropic: ["Anthropic", "claude"],
  google: ["Google", "gemini"],
  "meta-llama": ["Meta", "meta"],
  meta: ["Meta", "meta"],
  mistralai: ["Mistral AI", "mistral"],
  qwen: ["Qwen", "qwen"],
  deepseek: ["DeepSeek", "deepseek"],
  "x-ai": ["xAI", "grok"],
  "z-ai": ["Z.AI", "zai"],
  moonshotai: ["Moonshot AI", "kimi"],
  minimax: ["MiniMax", "minimax"],
  nvidia: ["NVIDIA", "nvidia"],
  cohere: ["Cohere", "cohere"],
  amazon: ["Amazon", "bedrock"],
  microsoft: ["Microsoft", "microsoft"],
  perplexity: ["Perplexity", "perplexity"],
  tencent: ["Tencent", "hunyuan"],
  "bytedance-seed": ["ByteDance Seed", "doubao"],
  bytedance: ["ByteDance", "doubao"],
  openrouter: ["OpenRouter", "openrouter"],
  nousresearch: ["Nous Research", "nousresearch"],
  ai21: ["AI21 Labs", "ai21"],
  liquid: ["Liquid AI", "liquid"],
  inflection: ["Inflection", "inflection"],
  "01-ai": ["01.AI", "yi"],
  thudm: ["Zhipu (THUDM)", "chatglm"],
  baidu: ["Baidu", "wenxin"],
  alibaba: ["Alibaba", "qwen"],
  inception: ["Inception", "inception"],
  arcee: ["Arcee AI", "arcee"],
  "arcee-ai": ["Arcee AI", "arcee"],
  thinkingmachines: ["Thinking Machines", "thinkingmachines"],
  poolside: ["Poolside", "poolside"],
  "aion-labs": ["AionLabs", "aionlabs"],
  thedrummer: ["TheDrummer", "thedrummer"],
  stepfun: ["StepFun", "stepfun"],
  "stepfun-ai": ["StepFun", "stepfun"],
  xiaomi: ["Xiaomi", "xiaomi"],
  ibm: ["IBM", "ibm"],
  "ibm-granite": ["IBM", "ibm"],
  reka: ["Reka", "reka"],
  rekaai: ["Reka", "reka"],
  sarvamai: ["Sarvam AI", "sarvam"],
  allenai: ["Ai2", "ai2"],
  meituan: ["Meituan", "longcat"],
};

function displayVendor(slug) {
  if (VENDORS[slug]) return VENDORS[slug][0];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


/** "0.0000004" per token -> 0.4 (USD per 1M tokens). */
function perMillion(raw) {
  const n = Number(raw);
  // keep 5 decimals: some models are priced in fractions of a cent per 1M
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000 * 1e5) / 1e5 : null;
}

/**
 * Parameter counts from the model id/name: "27b" -> 27, "2.4t-a95b" -> total
 * 2400 with 95 active (mixture-of-experts).
 */
function parseParams(id, name) {
  const hay = `${id} ${name}`.toLowerCase();
  const m = hay.match(/(\d+(?:\.\d+)?)\s*([bt])(?:-a(\d+(?:\.\d+)?)\s*([bt]))?/);
  if (!m) return { params_b: null, active_params_b: null };
  const scale = (v, unit) => (unit === "t" ? Number(v) * 1000 : Number(v));
  return {
    params_b: scale(m[1], m[2]),
    active_params_b: m[3] ? scale(m[3], m[4] ?? "b") : null,
  };
}

/**
 * Labs usually state the real split in prose — "13B active parameters out of
 * 284B total". That beats both name parsing and safetensors totals (which
 * include auxiliary weights), so prefer it when present.
 */
function paramsFromDescription(text = "") {
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*([bt])\s*active\s+parameters?\s*(?:out of|of|from)\s*(\d+(?:\.\d+)?)\s*([bt])/i
  );
  if (!m) return null;
  const scale = (v, u) => (u.toLowerCase() === "t" ? Number(v) * 1000 : Number(v));
  return { active_params_b: scale(m[1], m[2]), params_b: scale(m[3], m[4]) };
}

function detectMoe(model, activeParams) {
  if (activeParams) return 1;
  const text = `${model.name} ${model.description ?? ""}`.toLowerCase();
  return /mixture[- ]of[- ]expert|\bmoe\b/.test(text) ? 1 : 0;
}

/**
 * Exact parameter counts from the Hugging Face API for open-weights models —
 * far better than guessing from the model name. Returns billions.
 */
async function hfParams(repo) {
  const out = { params_b: null, experts: null, experts_active: null, active_params_b: null };
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repo}`, {
      headers: { "User-Agent": "llmtierlist.com sync" },
    });
    if (res.ok) {
      const data = await res.json();
      const total = data?.safetensors?.total;
      if (Number.isFinite(total) && total > 0) {
        out.params_b = Math.round((total / 1e9) * 10) / 10;
      }
    }
  } catch {}

  // Repo names often encode the MoE split the OpenRouter id omits
  // ("…-30B-A3B" -> 30B total, 3B active).
  const fromName = parseParams(repo, "");
  if (fromName.active_params_b) out.active_params_b = fromName.active_params_b;
  if (!out.params_b && fromName.params_b) out.params_b = fromName.params_b;

  try {
    const cfg = await fetch(`https://huggingface.co/${repo}/raw/main/config.json`, {
      headers: { "User-Agent": "llmtierlist.com sync" },
    });
    if (cfg.ok) {
      const c = await cfg.json();
      const experts = c.num_experts ?? c.n_routed_experts ?? c.num_local_experts ?? null;
      const active = c.num_experts_per_tok ?? c.num_experts_per_token ?? null;
      if (Number.isFinite(experts)) out.experts = experts;
      if (Number.isFinite(active)) out.experts_active = active;
    }
  } catch {}

  return out;
}

/** Run tasks with bounded concurrency so we stay polite to the HF API. */
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

function slugify(orId) {
  return orId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

console.log("Fetching OpenRouter catalog…");
const res = await fetch("https://openrouter.ai/api/v1/models");
if (!res.ok) {
  console.error(`OpenRouter request failed: ${res.status}`);
  process.exit(1);
}
const { data: orModels } = await res.json();
console.log(`Fetched ${orModels.length} models.`);

const rows = [];
const seenSlugs = new Set();
const reasoningById = new Map();
for (const m of orModels) {
  const vendorSlug = m.id.split("/")[0].replace(/^~/, "");
  const slug = slugify(m.id);
  if (seenSlugs.has(slug)) continue;
  seenSlugs.add(slug);
  reasoningById.set(m.id, m.reasoning ?? null);
  // strip "Vendor: " prefix from display names
  const name = m.name.includes(": ") ? m.name.slice(m.name.indexOf(": ") + 2) : m.name;
  rows.push({
    id: m.id,
    slug,
    name,
    vendor: displayVendor(vendorSlug),
    vendor_slug: vendorSlug,
    description: (m.description ?? "").slice(0, 2000),
    license: m.hugging_face_id ? "open-weights" : "proprietary",
    release_date: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null,
    context_window: m.context_length ?? null,
    base_model_id: null,
    variant: null,
    price_in: perMillion(m.pricing?.prompt),
    price_out: perMillion(m.pricing?.completion),
    input_modalities: (m.architecture?.input_modalities ?? []).join(","),
    output_modalities: (m.architecture?.output_modalities ?? []).join(","),
    ...(() => {
      const stated = paramsFromDescription(m.description);
      const p = stated ?? parseParams(m.id, m.name);
      return { ...p, is_moe: detectMoe(m, p.active_params_b) };
    })(),
    hf_id: m.hugging_face_id ?? null,
    experts: null,
    experts_active: null,
  });
}

// -- variant detection ------------------------------------------------------
const byId = new Map(rows.map((r) => [r.id, r]));

for (const r of rows) {
  const colon = r.id.indexOf(":");
  if (colon > 0) {
    const bare = r.id.slice(0, colon);
    const suffix = r.id.slice(colon + 1);
    if (byId.has(bare)) {
      if (suffix === "thinking") {
        r.variant = "thinking";
        r.base_model_id = bare;
      } else {
        // pricing/service tiers (:free, :batch, :extended, …) are not distinct models
        r.variant = "service";
        r.base_model_id = bare;
      }
      continue;
    }
  }
  if (r.id.includes("-thinking")) {
    const candidate = r.id.replace("-thinking", "");
    if (byId.has(candidate)) {
      r.variant = "thinking";
      r.base_model_id = candidate;
    }
  }
}

// Synthesize a "(Thinking)" entry for hybrid models: reasoning is supported
// but optional, and no dedicated thinking SKU exists.
const basesWithThinking = new Set(
  rows.filter((r) => r.variant === "thinking").map((r) => r.base_model_id)
);
let synthetic = 0;
for (const r of [...rows]) {
  if (r.variant) continue;
  const reasoning = reasoningById.get(r.id);
  if (!reasoning || reasoning.mandatory !== false) continue;
  if (basesWithThinking.has(r.id)) continue;
  const slug = `${r.slug}-thinking`;
  if (seenSlugs.has(slug)) continue;
  seenSlugs.add(slug);
  rows.push({
    ...r,
    id: `${r.id}#thinking`,
    slug,
    name: `${r.name} (Thinking)`,
    base_model_id: r.id,
    variant: "thinking",
  });
  synthetic++;
}
console.log(
  `Variants: ${rows.filter((r) => r.variant === "service").length} service tiers collapsed, ` +
  `${rows.filter((r) => r.variant === "thinking").length} thinking variants (${synthetic} synthesized).`
);

// -- exact parameter counts for open-weights models -------------------------
const withRepos = [...new Set(rows.filter((r) => r.hf_id).map((r) => r.hf_id))];
console.log(`Fetching parameter counts for ${withRepos.length} Hugging Face repos…`);
const paramsByRepo = new Map();
const results = await mapLimit(withRepos, 8, async (repo) => [repo, await hfParams(repo)]);
for (const [repo, info] of results) if (info?.params_b || info?.experts) paramsByRepo.set(repo, info);
let enriched = 0;
for (const r of rows) {
  const info = r.hf_id ? paramsByRepo.get(r.hf_id) : null;
  if (!info) continue;
  const stated = paramsFromDescription(r.description);
  if (info.params_b && !stated) r.params_b = info.params_b;
  if (!r.active_params_b && info.active_params_b) r.active_params_b = info.active_params_b;
  r.experts = info.experts;
  r.experts_active = info.experts_active;
  if (info.experts) r.is_moe = 1;
  enriched++;
}
console.log(`Parameter counts resolved for ${paramsByRepo.size} repos (${enriched} model rows).`);

// -- reconcile aliases with their canonical sibling --------------------------
// "…-latest", dated snapshots ("…-0731") and "~" mirrors are the same model as
// the plain id, but OpenRouter often omits the HF link on them. Inherit specs
// from the richest sibling in the same family rather than showing "undisclosed".
function familyKey(id) {
  return id
    .replace(/^~/, "")
    .replace(/[:#].*$/, "")
    .replace(/-latest$/, "")
    .replace(/-\d{4,8}$/, "")
    .replace(/-(preview|exp|experimental)$/, "");
}
const bestByFamily = new Map();
for (const r of rows) {
  if (!r.params_b && !r.hf_id) continue;
  const key = familyKey(r.id);
  const current = bestByFamily.get(key);
  const score = (r.params_b ? 2 : 0) + (r.hf_id ? 1 : 0);
  const currentScore = current ? (current.params_b ? 2 : 0) + (current.hf_id ? 1 : 0) : -1;
  if (score > currentScore) bestByFamily.set(key, r);
}
let inherited = 0;
for (const r of rows) {
  if (r.params_b) continue;
  const donor = bestByFamily.get(familyKey(r.id));
  if (!donor || donor === r) continue;
  r.params_b = donor.params_b;
  r.active_params_b = r.active_params_b ?? donor.active_params_b;
  r.experts = r.experts ?? donor.experts;
  r.experts_active = r.experts_active ?? donor.experts_active;
  r.is_moe = r.is_moe || donor.is_moe;
  r.hf_id = r.hf_id ?? donor.hf_id;
  if (donor.hf_id && r.license !== "open-weights") r.license = "open-weights";
  inherited++;
}
console.log(`Inherited specs for ${inherited} alias/snapshot rows from their family.`);

// A model can be retired upstream while a new entry claims its slug (e.g. a
// real ":thinking" SKU dropped and our synthetic one takes over). Free those
// slugs first — renaming rather than deleting, so votes/reviews/placements on
// the retired model survive.
const wantedSlugs = new Map(rows.map((r) => [r.slug, r.id]));
const existing = (await d1("select id, slug from models")).result[0].results;
const takenSlugs = new Set(existing.map((r) => r.slug));
for (const row of existing) {
  const claimant = wantedSlugs.get(row.slug);
  if (!claimant || claimant === row.id) continue;
  let freed = `${row.slug}-retired`;
  for (let i = 2; takenSlugs.has(freed) || wantedSlugs.has(freed); i++) {
    freed = `${row.slug}-retired-${i}`;
  }
  takenSlugs.add(freed);
  await d1("update models set slug = ? where id = ?", [freed, row.id]);
  console.log(`Freed slug "${row.slug}" from retired ${row.id} -> ${freed}`);
}

// 21 params per row, D1 caps at 100 params per query -> 4 rows per batch
const BATCH = 4;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await d1(
    `insert into models (id, slug, name, vendor, vendor_slug, description, license,
        release_date, context_window, base_model_id, variant, price_in, price_out,
        input_modalities, output_modalities, params_b, active_params_b, is_moe, hf_id,
        experts, experts_active)
     values ${batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
     on conflict (id) do update set
       slug = excluded.slug, name = excluded.name, vendor = excluded.vendor,
       vendor_slug = excluded.vendor_slug, description = excluded.description,
       license = excluded.license, release_date = excluded.release_date,
       context_window = excluded.context_window,
       base_model_id = excluded.base_model_id, variant = excluded.variant,
       price_in = excluded.price_in, price_out = excluded.price_out,
       input_modalities = excluded.input_modalities,
       output_modalities = excluded.output_modalities,
       params_b = excluded.params_b, active_params_b = excluded.active_params_b,
       is_moe = excluded.is_moe, hf_id = excluded.hf_id,
       experts = excluded.experts, experts_active = excluded.experts_active`,
    batch.flatMap((r) => [r.id, r.slug, r.name, r.vendor, r.vendor_slug, r.description,
      r.license, r.release_date, r.context_window, r.base_model_id, r.variant,
      r.price_in, r.price_out, r.input_modalities, r.output_modalities,
      r.params_b, r.active_params_b, r.is_moe, r.hf_id, r.experts, r.experts_active])
  );
  if ((i / BATCH) % 8 === 0) console.log(`Upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
console.log(`Upserted ${rows.length}/${rows.length}`);

// -- copy vendor logos
const iconDir = path.join(root, "node_modules/@lobehub/icons-static-svg/icons");
const outDir = path.join(root, "public/logos");
mkdirSync(outDir, { recursive: true });

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" stroke-width="1.5"><rect x="4" y="7" width="16" height="12" rx="2"/><circle cx="9" cy="13" r="1.5" fill="#9a9a9a" stroke="none"/><circle cx="15" cy="13" r="1.5" fill="#9a9a9a" stroke="none"/><path d="M12 7V4M8 4h8"/></svg>`;
writeFileSync(path.join(outDir, "default.svg"), FALLBACK_SVG);

const vendorSlugs = [...new Set(rows.map((r) => r.vendor_slug))];
let copied = 0, missing = [];
for (const vs of vendorSlugs) {
  const base = VENDORS[vs]?.[1] ?? vs;
  const candidate = [`${base}-color.svg`, `${base}.svg`]
    .map((f) => path.join(iconDir, f))
    .find(existsSync);
  if (candidate) {
    // mono icons (and dual-tone ones like AWS) use currentColor, which renders
    // black inside an <img>; rewrite it so logos read on dark tiles
    const svg = readFileSync(candidate, "utf8").replaceAll("currentColor", "#f0f0f0");
    writeFileSync(path.join(outDir, `${vs}.svg`), svg);
    copied++;
  } else {
    // every vendor_slug gets a file so the client never 404s
    writeFileSync(path.join(outDir, `${vs}.svg`), FALLBACK_SVG);
    missing.push(vs);
  }
}
console.log(`Logos: ${copied}/${vendorSlugs.length} copied to public/logos/ (missing use default.svg)`);
if (missing.length) console.log("No icon found for:", missing.join(", "));
console.log("Done.");
