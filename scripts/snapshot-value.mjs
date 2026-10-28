// Store today's Balanced-preset value numbers for every benchmarked model, so
// model pages can chart how a value score moves. Reads the site's own
// /api/value.json (the same loaders the pages use) and upserts into the D1
// value_snapshots table. Runs daily from GitHub Actions.
//
// Usage: node scripts/snapshot-value.mjs
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
//      optional VALUE_JSON_URL (default https://llmtierlist.com/api/value.json)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID } = process.env;
if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID) {
  console.error("Missing Cloudflare credentials");
  process.exit(1);
}
const URL_ = process.env.VALUE_JSON_URL || "https://llmtierlist.com/api/value.json";

async function d1(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(`D1: ${JSON.stringify(data.errors)}`);
  return data.result[0]?.results ?? [];
}

const COLUMNS = [
  "day", "model_id", "q", "value_score", "tier", "gpqa", "tau",
  "cost_per_task", "time_per_task_s", "usage_rank",
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

console.log(`Fetching ${URL_}…`);
const res = await fetch(URL_, { headers: { Accept: "application/json", "User-Agent": "llmtierlist.com snapshot" } });
if (!res.ok) {
  console.error(`${URL_} returned ${res.status}`);
  process.exit(1);
}
const body = await res.json();
if (!/^\d{4}-\d{2}-\d{2}$/.test(body.snapshotDate ?? "") || !Array.isArray(body.rows)) {
  console.error("Response is missing snapshotDate or rows");
  process.exit(1);
}

const rows = body.rows
  .filter((r) => typeof r.model_id === "string" && r.model_id && num(r.q) != null && num(r.value_score) != null)
  .map((r) => [
    body.snapshotDate,
    r.model_id,
    num(r.q),
    num(r.value_score),
    typeof r.tier === "string" ? r.tier : null,
    num(r.gpqa),
    num(r.tau),
    num(r.cost_per_task),
    num(r.time_per_task_s),
    Number.isInteger(r.usage_rank) ? r.usage_rank : null,
  ]);
if (rows.length === 0) {
  console.error("No valid rows to store");
  process.exit(1);
}

console.log(`Snapshotting ${rows.length} value rows for ${body.snapshotDate}…`);
const BATCH = 10; // 10 params per row, D1 caps at 100
const placeholders = `(${COLUMNS.map(() => "?").join(", ")})`;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await d1(
    `insert into value_snapshots (${COLUMNS.join(", ")})
     values ${batch.map(() => placeholders).join(", ")}
     on conflict (day, model_id) do update set
       ${COLUMNS.slice(2).map((c) => `${c} = excluded.${c}`).join(", ")}`,
    batch.flat()
  );
}
console.log("Value snapshot complete.");
