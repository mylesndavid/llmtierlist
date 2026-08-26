import "server-only";
import { cookies, headers } from "next/headers";
import { d1Query } from "./d1";

const COOKIE = "ltl_anon";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Per-day caps. The identity cap only has teeth because identities are
 * server-signed and never minted by the same request that votes (see
 * getAnonIdentity) — otherwise a client that discards cookies gets a fresh
 * identity per request and the cap is a no-op.
 */
const LIMIT_ANON_PER_IDENTITY = 60;
const LIMIT_ANON_PER_IP = 60;
const LIMIT_USER_PER_ACCOUNT = 200;
const LIMIT_USER_PER_IP = 200;

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.SESSION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AnonIdentity {
  id: string;
  /** True when this request minted the identity — it has not been proven to persist. */
  fresh: boolean;
}

/**
 * Stable, server-signed per-browser id. Clients cannot forge one (HMAC), and a
 * newly minted id is reported as `fresh` so callers can refuse to count the
 * action until the browser proves it kept the cookie.
 */
export async function getAnonIdentity(create = true): Promise<AnonIdentity | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  if (token) {
    const [id, sig] = token.split(".");
    if (id && sig && /^[0-9a-f]{32}$/.test(id) && timingSafeEqual(sig, await hmac(id))) {
      return { id, fresh: false };
    }
  }
  if (!create) return null;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  jar.set(COOKIE, `${id}.${await hmac(id)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
  return { id, fresh: true };
}

/** Back-compat helper for read-only callers (returns the id only). */
export async function getAnonId(create = true): Promise<string | null> {
  return (await getAnonIdentity(create))?.id ?? null;
}

/**
 * Client IP for security decisions. On Workers `cf-connecting-ip` is set by
 * Cloudflare and cannot be spoofed; x-forwarded-for is attacker-controlled and
 * is only trusted outside production (local dev). Fails closed to a shared
 * bucket rather than granting an unlimited-identity escape hatch.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  if (process.env.NODE_ENV !== "production") {
    return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "dev";
  }
  return "no-cf-ip";
}

export async function ipBucket(prefix: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${prefix}|${day}|${await clientIp()}`)
  );
  return (
    prefix +
    ":" +
    [...new Uint8Array(digest)]
      .slice(0, 12)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function bump(bucket: string, limit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await d1Query<{ count: number }>(
    `insert into rate_limits (bucket, day, count) values (?, ?, 1)
     on conflict (bucket, day) do update set count = count + 1
     returning count`,
    [bucket, day]
  );
  return (rows[0]?.count ?? 0) <= limit;
}

/** Anonymous vote budget: per signed identity and per real client IP. */
export async function checkVoteRateLimit(anonId: string): Promise<boolean> {
  const okIdentity = await bump(`id:${anonId}`, LIMIT_ANON_PER_IDENTITY);
  const okIp = await bump(await ipBucket("vip"), LIMIT_ANON_PER_IP);
  return okIdentity && okIp;
}

/** Signed-in votes are throttled too — free accounts are cheap to mint. */
export async function checkUserVoteRateLimit(userId: string): Promise<boolean> {
  const okUser = await bump(`uvote:${userId}`, LIMIT_USER_PER_ACCOUNT);
  const okIp = await bump(await ipBucket("uvip"), LIMIT_USER_PER_IP);
  return okUser && okIp;
}

/** Generic per-day cap for a named actor (reviews, list saves, beacons). */
export async function checkActionRateLimit(key: string, limit: number): Promise<boolean> {
  return bump(key, limit);
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
