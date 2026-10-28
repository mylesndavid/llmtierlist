import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_rethrow } from "next/navigation";
import { d1Query } from "./d1";
import type { XPanelResult } from "./xPosts";

/**
 * Stored "What people are saying" panels in D1 (table `x_panels`), so a
 * panel is searched and scored once per TTL across every Cloudflare location
 * rather than once per location. All functions are best effort: when D1 is
 * not configured (local dev) or a query fails, reads return nothing and
 * writes are skipped, and callers fall back to the edge cache alone.
 */

interface Row {
  model_id: string;
  fetched_at: string;
  scored: number;
  payload: string;
}

/** True when d1Query has somewhere to go: the Workers binding or the REST credentials. */
export function d1Available(): boolean {
  try {
    const { env } = getCloudflareContext();
    if ((env as unknown as { DB?: unknown }).DB) return true;
  } catch {
    // not running on Workers
  }
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_D1_DATABASE_ID && process.env.CLOUDFLARE_API_TOKEN
  );
}

function parseRow(row: Row): XPanelResult | null {
  try {
    const data = JSON.parse(row.payload) as XPanelResult;
    if (!data || !Array.isArray(data.posts) || !data.counts) return null;
    const fetchedAt = Date.parse(row.fetched_at);
    return { ...data, scored: row.scored === 1, fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : data.fetchedAt };
  } catch {
    return null;
  }
}

function logError(what: string, err: unknown) {
  console.error(`x panels: ${what}:`, err instanceof Error ? err.message : err);
}

/** Stored panels by model id, fresh or not. Missing and unreadable rows are left out. */
export async function readStoredPanels(modelIds: string[]): Promise<Map<string, XPanelResult>> {
  const out = new Map<string, XPanelResult>();
  const ids = [...new Set(modelIds)];
  if (ids.length === 0 || !d1Available()) return out;
  try {
    const rows = await d1Query<Row>(
      `select model_id, fetched_at, scored, payload from x_panels where model_id in (${ids.map(() => "?").join(", ")})`,
      ids
    );
    for (const row of rows) {
      const panel = parseRow(row);
      if (panel) out.set(row.model_id, panel);
    }
  } catch (err) {
    unstable_rethrow(err);
    logError("read failed", err);
  }
  return out;
}

export async function readStoredPanel(modelId: string): Promise<XPanelResult | null> {
  return (await readStoredPanels([modelId])).get(modelId) ?? null;
}

/** Insert or replace a model's stored panel. */
export async function writeStoredPanel(modelId: string, panel: XPanelResult): Promise<void> {
  if (!d1Available()) return;
  try {
    await d1Query(
      `insert into x_panels (model_id, fetched_at, scored, payload) values (?, ?, ?, ?)
       on conflict (model_id) do update set
         fetched_at = excluded.fetched_at, scored = excluded.scored, payload = excluded.payload`,
      [modelId, new Date(panel.fetchedAt).toISOString(), panel.scored ? 1 : 0, JSON.stringify(panel)]
    );
  } catch (err) {
    unstable_rethrow(err);
    logError("write failed", err);
  }
}
