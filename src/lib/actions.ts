"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { d1Query } from "./d1";
import { bustModelsCache } from "./data";
import { generateAndStoreOg } from "./og";
import { createSession, destroySession, getSessionUser } from "./auth";
import {
  checkActionRateLimit,
  checkUserVoteRateLimit,
  checkVoteRateLimit,
  claimAnonVotes,
  getAnonId,
  getAnonIdentity,
  voterNetworkHash,
} from "./anon";
import { type Tier, type TierDef } from "./types";

const slugId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

/** Only same-origin absolute paths — blocks //evil.com and \evil.com. */
function safeNext(next: string, fallback: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
const rowId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

/** Defence in depth against cross-site invocation of authed actions. */
async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return; // same-origin form posts may omit it
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && new URL(origin).origin !== new URL(site).origin) {
    throw new Error("Cross-origin request rejected");
  }
}

async function requireUser() {
  await assertSameOrigin();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.onboarded) redirect("/welcome");
  return user;
}

// ============ profile ============

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set([
  "admin", "api", "auth", "avatars", "login", "logout", "me", "models",
  "settings", "t", "tierlists", "tiers", "u", "welcome",
]);

export async function updateProfile(formData: FormData) {
  await assertSameOrigin();
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 60);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 280);
  const avatarData = String(formData.get("avatar_data") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!USERNAME_RE.test(username)) {
    return { error: "Usernames are 3–20 characters: lowercase letters, numbers, underscores." };
  }
  if (RESERVED.has(username)) {
    return { error: "That username is reserved." };
  }
  const taken = await d1Query(
    "select 1 from users where username = ? and id != ?",
    [username, session.id]
  );
  if (taken.length > 0) {
    return { error: "That username is taken." };
  }

  let avatarUrl = session.avatar_url;
  if (avatarData) {
    if (!avatarData.startsWith("data:image/jpeg;base64,") || avatarData.length > 400_000) {
      return { error: "Invalid image upload." };
    }
    await d1Query("update users set avatar_blob = ? where id = ?", [avatarData, session.id]);
    avatarUrl = `/avatars/${username}`;
  } else if (avatarUrl?.startsWith("/avatars/")) {
    avatarUrl = `/avatars/${username}`; // keep custom photo in sync with a renamed username
  }

  await d1Query(
    `update users set username = ?, display_name = ?, bio = ?, avatar_url = ?, onboarded = 1
     where id = ?`,
    [username, displayName || null, bio, avatarUrl, session.id]
  );

  await createSession({
    ...session,
    username,
    display_name: displayName || null,
    avatar_url: avatarUrl,
    onboarded: true,
  });

  // adopt anything they voted on before making the account
  await claimAnonVotes(session.id);

  revalidatePath("/", "layout");
  // Land on the new profile unless onboarding was interrupted mid-task.
  redirect(next && next !== "/" ? safeNext(next, `/u/${username}`) : `/u/${username}`);
}

// ============ votes ============

/**
 * Voting is open to everyone. Signed-in votes go to `votes`; everyone else
 * votes under a per-browser id in `anon_votes`, rate limited per identity and
 * IP, and adopted into their account if they sign up later.
 */
export async function castVote(modelId: string, value: 1 | -1 | 0) {
  // Client-supplied: types are not runtime guarantees.
  if (typeof modelId !== "string" || !modelId || modelId.length > 200) {
    return { error: "Unknown model." };
  }
  const v = Number(value);
  if (v !== 1 && v !== -1 && v !== 0) return { error: "Invalid vote." };
  value = v as 1 | -1 | 0;

  const user = await getSessionUser();

  try {
    if (user?.onboarded) {
      if (value !== 0 && !(await checkUserVoteRateLimit(user.id))) {
        return { error: "That's a lot of voting for one day — try again tomorrow." };
      }
      if (value === 0) {
        await d1Query("delete from votes where user_id = ? and model_id = ?", [
          user.id,
          modelId,
        ]);
      } else {
        await d1Query(
          `insert into votes (user_id, model_id, value) values (?, ?, ?)
           on conflict (user_id, model_id) do update set value = excluded.value`,
          [user.id, modelId, value]
        );
      }
    } else {
      const identity = await getAnonIdentity();
      if (!identity) return { error: "Couldn't record that vote." };
      // A caller that discards cookies would otherwise mint a fresh identity per
      // request and bypass the per-identity cap: never count a vote from an
      // identity this same request created.
      if (identity.fresh) return { retry: true as const };
      const anonId = identity.id;
      const net = await voterNetworkHash();
      if (value === 0) {
        await d1Query("delete from anon_votes where ip_hash = ? and model_id = ?", [
          net,
          modelId,
        ]);
      } else {
        if (!(await checkVoteRateLimit(anonId))) {
          return { error: "That's a lot of voting for one day — try again tomorrow." };
        }
        // Keyed on the network, so a new/incognito browser updates the same
        // vote rather than stacking another one.
        await d1Query(
          `insert into anon_votes (ip_hash, model_id, anon_id, value) values (?, ?, ?, ?)
           on conflict (ip_hash, model_id) do update set
             value = excluded.value, anon_id = excluded.anon_id`,
          [net, modelId, anonId, value]
        );
      }
    }

  } catch (err) {
    console.error("Vote failed:", err);
    return { error: "Couldn't record that vote." };
  }

  bustModelsCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

// ============ reviews ============

export async function upsertReview(formData: FormData) {
  const user = await requireUser();
  const modelId = String(formData.get("model_id") ?? "");
  const modelSlug = String(formData.get("model_slug") ?? "");
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") ?? "").slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);

  if (!modelId || !body || !(rating >= 1 && rating <= 5)) {
    return { error: "Please add a rating and review text." };
  }
  if (!(await checkActionRateLimit(`review:${user.id}`, 30))) {
    return { error: "You've written a lot of reviews today — try again tomorrow." };
  }

  await d1Query(
    `insert into reviews (id, user_id, model_id, rating, title, body)
     values (?, ?, ?, ?, ?, ?)
     on conflict (user_id, model_id) do update set
       rating = excluded.rating, title = excluded.title, body = excluded.body,
       updated_at = datetime('now')`,
    [rowId(), user.id, modelId, rating, title, body]
  );
  bustModelsCache();
  revalidatePath(`/models/${modelSlug}`);
  return { ok: true };
}

export async function deleteReview(reviewId: string, modelSlug: string) {
  const user = await requireUser();
  await d1Query("delete from reviews where id = ? and user_id = ?", [
    reviewId,
    user.id,
  ]);
  revalidatePath(`/models/${modelSlug}`);
}

// ============ tier lists ============

export interface TierListPayload {
  id?: string;
  title: string;
  description: string;
  isPublic: boolean;
  tiers: TierDef[];
  rankModes?: boolean;
  placements: Array<{ modelId: string; tier: Tier; position: number }>;
}

const TIER_KEY_RE = /^[a-zA-Z0-9_-]{1,16}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function saveTierList(payload: TierListPayload) {
  const user = await requireUser();

  const title = payload.title.trim().slice(0, 120);
  if (!title) return { error: "Give your tier list a title." };

  const tiers = (payload.tiers ?? []).slice(0, 10).map((t) => ({
    key: String(t.key),
    label: String(t.label ?? "").trim().slice(0, 24) || "?",
    color: String(t.color),
  }));
  if (
    tiers.length === 0 ||
    tiers.some((t) => !TIER_KEY_RE.test(t.key) || !COLOR_RE.test(t.color)) ||
    new Set(tiers.map((t) => t.key)).size !== tiers.length
  ) {
    return { error: "Invalid tier configuration." };
  }
  const tierIndexByKey = new Map(tiers.map((t, i) => [t.key, i]));

  const placements = payload.placements
    .filter((p) => tierIndexByKey.has(p.tier))
    .slice(0, 300);
  if (placements.length === 0) {
    return { error: "Place at least one model in a tier." };
  }
  if (!(await checkActionRateLimit(`list:${user.id}`, 60))) {
    return { error: "You've saved a lot of tier lists today — try again tomorrow." };
  }

  let listId = payload.id ?? null;
  let slug: string;

  if (listId) {
    const existing = await d1Query<{ slug: string; user_id: string }>(
      "select slug, user_id from tier_lists where id = ?",
      [listId]
    );
    if (!existing.length || existing[0].user_id !== user.id) {
      return { error: "Tier list not found." };
    }
    slug = existing[0].slug;
    await d1Query(
      `update tier_lists set title = ?, description = ?, is_public = ?, tiers = ?, rank_modes = ?,
       updated_at = datetime('now') where id = ?`,
      [title, payload.description.slice(0, 1000), payload.isPublic ? 1 : 0, JSON.stringify(tiers), payload.rankModes ? 1 : 0, listId]
    );
    await d1Query("delete from tier_list_items where tier_list_id = ?", [listId]);
  } else {
    slug = slugId();
    listId = rowId();
    await d1Query(
      `insert into tier_lists (id, user_id, slug, title, description, is_public, tiers, rank_modes)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [listId, user.id, slug, title, payload.description.slice(0, 1000), payload.isPublic ? 1 : 0, JSON.stringify(tiers), payload.rankModes ? 1 : 0]
    );
  }

  // D1 params cap at 100 per query; 5 params per row -> 20 rows per batch
  const BATCH = 20;
  for (let i = 0; i < placements.length; i += BATCH) {
    const batch = placements.slice(i, i + BATCH);
    await d1Query(
      `insert into tier_list_items (tier_list_id, model_id, tier, tier_index, position) values ${batch
        .map(() => "(?, ?, ?, ?, ?)")
        .join(", ")}`,
      batch.flatMap((p) => [listId!, p.modelId, p.tier, tierIndexByKey.get(p.tier)!, p.position])
    );
  }

  // Pre-render the share image so crawlers (X, Slack, iMessage) get it
  // instantly instead of timing out on a cold render.
  if (payload.isPublic) {
    try {
      await generateAndStoreOg(listId!, slug);
    } catch (err) {
      console.error("OG pre-render failed:", err);
    }
  }

  bustModelsCache();
  revalidatePath("/tiers");
  revalidatePath("/tierlists");
  revalidatePath(`/t/${slug}`);
  return { ok: true, slug };
}

export async function castListVote(tierListId: string, value: 1 | -1 | 0) {
  if (typeof tierListId !== "string" || !tierListId || tierListId.length > 200) {
    return { error: "Unknown tier list." };
  }
  const v = Number(value);
  if (v !== 1 && v !== -1 && v !== 0) return { error: "Invalid vote." };
  value = v as 1 | -1 | 0;

  const user = await getSessionUser();

  try {
    if (user?.onboarded) {
      if (value !== 0 && !(await checkUserVoteRateLimit(user.id))) {
        return { error: "That's a lot of voting for one day — try again tomorrow." };
      }
      if (value === 0) {
        await d1Query("delete from list_votes where user_id = ? and tier_list_id = ?", [
          user.id,
          tierListId,
        ]);
      } else {
        await d1Query(
          `insert into list_votes (user_id, tier_list_id, value) values (?, ?, ?)
           on conflict (user_id, tier_list_id) do update set value = excluded.value`,
          [user.id, tierListId, value]
        );
      }
    } else {
      const identity = await getAnonIdentity();
      if (!identity) return { error: "Couldn't record that vote." };
      if (identity.fresh) return { retry: true as const };
      const anonId = identity.id;
      const net = await voterNetworkHash();
      if (value === 0) {
        await d1Query("delete from anon_list_votes where ip_hash = ? and tier_list_id = ?", [
          net,
          tierListId,
        ]);
      } else {
        if (!(await checkVoteRateLimit(anonId))) {
          return { error: "That's a lot of voting for one day — try again tomorrow." };
        }
        await d1Query(
          `insert into anon_list_votes (ip_hash, tier_list_id, anon_id, value) values (?, ?, ?, ?)
           on conflict (ip_hash, tier_list_id) do update set
             value = excluded.value, anon_id = excluded.anon_id`,
          [net, tierListId, anonId, value]
        );
      }
    }

  } catch (err) {
    console.error("Vote failed:", err);
    return { error: "Couldn't record that vote." };
  }

  revalidatePath("/tierlists");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTierList(listId: string) {
  const user = await requireUser();
  await d1Query("delete from tier_list_items where tier_list_id = ? and exists (select 1 from tier_lists where id = ? and user_id = ?)", [listId, listId, user.id]);
  await d1Query("delete from tier_lists where id = ? and user_id = ?", [listId, user.id]);
  revalidatePath("/me/tierlists");
  revalidatePath("/tierlists");
}

// ============ auth ============

export async function signOut() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}
