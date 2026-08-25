"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { d1Query } from "./d1";
import { destroySession, getSessionUser } from "./auth";
import { TIERS, type Tier } from "./types";

const slugId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
const rowId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// ============ votes ============

export async function castVote(modelId: string, value: 1 | -1 | 0) {
  const user = await requireUser();
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

  await d1Query(
    `insert into reviews (id, user_id, model_id, rating, title, body)
     values (?, ?, ?, ?, ?, ?)
     on conflict (user_id, model_id) do update set
       rating = excluded.rating, title = excluded.title, body = excluded.body,
       updated_at = datetime('now')`,
    [rowId(), user.id, modelId, rating, title, body]
  );
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
  placements: Array<{ modelId: string; tier: Tier; position: number }>;
}

export async function saveTierList(payload: TierListPayload) {
  const user = await requireUser();

  const title = payload.title.trim().slice(0, 120);
  if (!title) return { error: "Give your tier list a title." };
  const placements = payload.placements.filter((p) =>
    (TIERS as readonly string[]).includes(p.tier)
  );
  if (placements.length === 0) {
    return { error: "Place at least one model in a tier." };
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
      `update tier_lists set title = ?, description = ?, is_public = ?,
       updated_at = datetime('now') where id = ?`,
      [title, payload.description.slice(0, 1000), payload.isPublic ? 1 : 0, listId]
    );
    await d1Query("delete from tier_list_items where tier_list_id = ?", [listId]);
  } else {
    slug = slugId();
    listId = rowId();
    await d1Query(
      `insert into tier_lists (id, user_id, slug, title, description, is_public)
       values (?, ?, ?, ?, ?, ?)`,
      [listId, user.id, slug, title, payload.description.slice(0, 1000), payload.isPublic ? 1 : 0]
    );
  }

  // D1 params cap at 100 per query; 4 params per row -> 24 rows per batch
  const BATCH = 24;
  for (let i = 0; i < placements.length; i += BATCH) {
    const batch = placements.slice(i, i + BATCH);
    await d1Query(
      `insert into tier_list_items (tier_list_id, model_id, tier, position) values ${batch
        .map(() => "(?, ?, ?, ?)")
        .join(", ")}`,
      batch.flatMap((p) => [listId!, p.modelId, p.tier, p.position])
    );
  }

  revalidatePath("/tiers");
  revalidatePath("/tierlists");
  revalidatePath(`/t/${slug}`);
  return { ok: true, slug };
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
