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
for (const m of orModels) {
  const vendorSlug = m.id.split("/")[0].replace(/^~/, "");
  const slug = slugify(m.id);
  if (seenSlugs.has(slug)) continue;
  seenSlugs.add(slug);
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
  });
}

// 9 params per row, D1 caps at 100 params per query -> 11 rows per batch
const BATCH = 11;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await d1(
    `insert into models (id, slug, name, vendor, vendor_slug, description, license, release_date, context_window)
     values ${batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
     on conflict (id) do update set
       slug = excluded.slug, name = excluded.name, vendor = excluded.vendor,
       vendor_slug = excluded.vendor_slug, description = excluded.description,
       license = excluded.license, release_date = excluded.release_date,
       context_window = excluded.context_window`,
    batch.flatMap((r) => [r.id, r.slug, r.name, r.vendor, r.vendor_slug, r.description, r.license, r.release_date, r.context_window])
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
