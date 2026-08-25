import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const API = "https://api.cloudflare.com/client/v4";

interface D1Response {
  success: boolean;
  errors: Array<{ message: string }>;
  result: Array<{ results: Record<string, unknown>[]; success: boolean }>;
}

type Param = string | number | null;

interface D1Binding {
  prepare(sql: string): {
    bind(...values: Param[]): { all<T>(): Promise<{ results: T[] }> };
  };
}

/**
 * Run one SQL statement against D1. On Cloudflare Workers this uses the native
 * DB binding (same-datacenter); everywhere else (local dev, scripts) it falls
 * back to the REST API.
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  rawParams: Param[] = []
): Promise<T[]> {
  // D1's native binding throws on `undefined` params; normalize to null.
  const params = rawParams.map((p) => (p === undefined ? null : p));
  let db: D1Binding | undefined;
  try {
    const { env } = getCloudflareContext();
    db = (env as unknown as { DB?: D1Binding }).DB;
  } catch {
    // Not running on Workers — use the REST API below.
  }
  if (db) {
    const { results } = await db.prepare(sql).bind(...params).all<T>();
    return results;
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID!;
  const res = await fetch(`${API}/accounts/${account}/d1/database/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    cache: "no-store",
  });
  const data = (await res.json()) as D1Response;
  if (!data.success) {
    throw new Error(`D1 query failed: ${data.errors.map((e) => e.message).join("; ")}`);
  }
  return (data.result[0]?.results ?? []) as T[];
}
