// Record today's standing for every tracked model, so the site can chart how
// opinion moves over time. Runs daily from GitHub Actions.
//
// Usage: node scripts/snapshot-scores.mjs

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

const day = new Date().toISOString().slice(0, 10);

// Track anything the community has engaged with, so the table stays small and
// every charted model has a real reason to be there.
const rows = await d1(`
  select s.model_id, s.net_score, s.upvotes, s.downvotes,
         coalesce(s.placement_count, 0) as placements
  from model_stats s
  where s.upvotes > 0 or s.downvotes > 0 or coalesce(s.placement_count, 0) > 0
`);

console.log(`Snapshotting ${rows.length} tracked models for ${day}…`);

const BATCH = 16; // 6 params per row, D1 caps at 100
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await d1(
    `insert into model_score_history (model_id, day, net_score, upvotes, downvotes, placements)
     values ${batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
     on conflict (model_id, day) do update set
       net_score = excluded.net_score, upvotes = excluded.upvotes,
       downvotes = excluded.downvotes, placements = excluded.placements`,
    batch.flatMap((r) => [r.model_id, day, r.net_score, r.upvotes, r.downvotes, r.placements])
  );
}
console.log("Snapshot complete.");
