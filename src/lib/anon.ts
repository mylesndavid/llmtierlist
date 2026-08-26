import "server-only";
import { cookies, headers } from "next/headers";
import { d1Query } from "./d1";

const COOKIE = "ltl_anon";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Per-day caps. Identity is per browser; IP catches cookie-clearing abuse. */
const LIMIT_PER_IDENTITY = 80;
const LIMIT_PER_IP = 300;

/** Stable per-browser id, created on first use. */
export async function getAnonId(create = true): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
  if (!create) return null;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  jar.set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
  return id;
}

async function ipHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`vote|${day}|${ip}`)
  );
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Count one vote action against the identity and IP buckets.
 * Returns false when either cap is exceeded for the day.
 */
export async function checkVoteRateLimit(anonId: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const buckets: Array<[string, number]> = [
    [`id:${anonId}`, LIMIT_PER_IDENTITY],
    [`ip:${await ipHash()}`, LIMIT_PER_IP],
  ];

  for (const [bucket, limit] of buckets) {
    const rows = await d1Query<{ count: number }>(
      `insert into rate_limits (bucket, day, count) values (?, ?, 1)
       on conflict (bucket, day) do update set count = count + 1
       returning count`,
      [bucket, day]
    );
    if ((rows[0]?.count ?? 0) > limit) return false;
  }
  return true;
}

/**
 * Adopt a browser's anonymous votes into a freshly signed-in account.
 * The account's own votes win any conflict.
 */
export async function claimAnonVotes(userId: string): Promise<void> {
  const anonId = await getAnonId(false);
  if (!anonId) return;

  await d1Query(
    `insert into votes (user_id, model_id, value)
     select ?, model_id, value from anon_votes where anon_id = ?
     on conflict (user_id, model_id) do nothing`,
    [userId, anonId]
  );
  await d1Query(
    `insert into list_votes (user_id, tier_list_id, value)
     select ?, tier_list_id, value from anon_list_votes where anon_id = ?
     on conflict (user_id, tier_list_id) do nothing`,
    [userId, anonId]
  );
  await d1Query("delete from anon_votes where anon_id = ?", [anonId]);
  await d1Query("delete from anon_list_votes where anon_id = ?", [anonId]);
}
