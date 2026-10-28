// Store Epoch AI benchmark scores per model in D1, so model pages read one
// small row instead of downloading and unzipping Epoch's 2.3 MB archive on a
// Worker request (the unzip and parse alone took 30-60 ms of CPU locally).
// Runs daily from GitHub Actions.
//
// Uses the same parser and model matcher as the site (src/lib/epoch.ts and
// src/lib/modelMatch.ts), bundled in memory with esbuild, which `npm ci`
// already installs for the OpenNext build.
//
// Usage: node scripts/sync-epoch.mjs [--dry-run]
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID
// --dry-run parses and matches but writes nothing (no credentials needed).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const DRY_RUN = process.argv.includes("--dry-run");
const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID } = process.env;
if (!DRY_RUN && (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID)) {
  console.error("Missing Cloudflare credentials");
  process.exit(1);
}

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

async function loadLib() {
  const out = await build({
    stdin: {
      contents: `export * from "./src/lib/epoch.ts"; export { buildMatchIndex } from "./src/lib/modelMatch.ts";`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "warning",
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { EPOCH_ZIP_URL, buildMatchIndex, epochSnapshotFromZip, epochRows } = await loadLib();

console.log("Fetching the OpenRouter model list…");
const orRes = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
if (!orRes.ok) {
  console.error(`OpenRouter returned ${orRes.status}`);
  process.exit(1);
}
const candidates = ((await orRes.json()).data ?? [])
  .filter((m) => typeof m?.id === "string")
  .map((m) => ({ id: m.id, name: typeof m.name === "string" ? m.name : undefined }));
if (candidates.length === 0) {
  console.error("OpenRouter model list is empty");
  process.exit(1);
}

console.log(`Fetching ${EPOCH_ZIP_URL}…`);
const zipRes = await fetch(EPOCH_ZIP_URL, { headers: { Accept: "application/zip" } });
if (!zipRes.ok) {
  console.error(`${EPOCH_ZIP_URL} returned ${zipRes.status}`);
  process.exit(1);
}
const t0 = performance.now();
const snap = await epochSnapshotFromZip(await zipRes.arrayBuffer(), buildMatchIndex(candidates));
const rows = epochRows(snap);
console.log(`Parsed and matched ${rows.length} models in ${Math.round(performance.now() - t0)} ms.`);
for (const [name, c] of Object.entries(snap.coverage)) {
  if (c.unmatched.length) console.log(`  ${name}: ${c.unmatched.length} unmatched`);
}

if (DRY_RUN) {
  console.log("Dry run: nothing written.");
  process.exit(0);
}

const updatedAt = new Date().toISOString();
const BATCH = 10; // rows carry a few KB of JSON each; keep statements small
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await d1(
    `insert into epoch_scores (model_id, scores, updated_at)
     values ${batch.map(() => "(?, ?, ?)").join(", ")}
     on conflict (model_id) do update set scores = excluded.scores, updated_at = excluded.updated_at`,
    batch.flatMap((r) => [r.model_id, r.scores, updatedAt])
  );
}
// Models that no longer match anything keep no stale scores.
await d1("delete from epoch_scores where updated_at < ?", [updatedAt]);
console.log("Epoch sync complete.");
