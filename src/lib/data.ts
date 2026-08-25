import { d1Query } from "./d1";
import { getSessionUser } from "./auth";
import type {
  Model,
  ModelStats,
  ModelWithStats,
  Review,
  TierList,
  TierListItem,
} from "./types";

const EMPTY_STATS = (id: string): ModelStats => ({
  model_id: id,
  upvotes: 0,
  downvotes: 0,
  net_score: 0,
  review_count: 0,
  avg_rating: null,
  placement_count: null,
  avg_tier_value: null,
});

type ModelRow = Model & Partial<ModelStats>;

function withStats(row: ModelRow): ModelWithStats {
  const { upvotes, downvotes, net_score, review_count, avg_rating, placement_count, avg_tier_value, ...model } = row;
  return {
    ...(model as Model),
    stats: {
      ...EMPTY_STATS(model.id),
      upvotes: upvotes ?? 0,
      downvotes: downvotes ?? 0,
      net_score: net_score ?? 0,
      review_count: review_count ?? 0,
      avg_rating: avg_rating ?? null,
      placement_count: placement_count ?? null,
      avg_tier_value: avg_tier_value ?? null,
    },
  };
}

const MODEL_SELECT = `
  select m.id, m.slug, m.name, m.vendor, m.vendor_slug, m.description, m.license,
         m.release_date, m.context_window,
         s.upvotes, s.downvotes, s.net_score, s.review_count, s.avg_rating,
         s.placement_count, s.avg_tier_value
  from models m left join model_stats s on s.model_id = m.id`;

export async function getModelsWithStats(): Promise<ModelWithStats[]> {
  const rows = await d1Query<ModelRow>(`${MODEL_SELECT} order by m.name`);
  return rows.map(withStats);
}

export async function getModelBySlug(slug: string): Promise<ModelWithStats | null> {
  const rows = await d1Query<ModelRow>(`${MODEL_SELECT} where m.slug = ?`, [slug]);
  return rows.length ? withStats(rows[0]) : null;
}

export async function getReviewsForModel(modelId: string): Promise<Review[]> {
  const rows = await d1Query<Review & { username: string; display_name: string | null; avatar_url: string | null }>(
    `select r.*, u.username, u.display_name, u.avatar_url
     from reviews r join users u on u.id = r.user_id
     where r.model_id = ? order by r.created_at desc`,
    [modelId]
  );
  return rows.map(({ username, display_name, avatar_url, ...r }) => ({
    ...r,
    profiles: { username, display_name, avatar_url },
  }));
}

/** The signed-in user's votes, as a map of model_id -> 1 | -1. */
export async function getUserVotes(): Promise<Record<string, number>> {
  const user = await getSessionUser();
  if (!user) return {};
  const rows = await d1Query<{ model_id: string; value: number }>(
    "select model_id, value from votes where user_id = ?",
    [user.id]
  );
  return Object.fromEntries(rows.map((v) => [v.model_id, v.value]));
}

export async function getCurrentUser() {
  return getSessionUser();
}

type TierListRow = Omit<TierList, "is_public" | "profiles"> & {
  is_public: number;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

function toTierList(row: TierListRow): TierList {
  const { username, display_name, avatar_url, ...rest } = row;
  return {
    ...rest,
    is_public: !!row.is_public,
    profiles: username
      ? { username, display_name: display_name ?? null, avatar_url: avatar_url ?? null }
      : undefined,
  };
}

export async function getTierListBySlug(
  slug: string
): Promise<(TierList & { items: TierListItem[] }) | null> {
  const user = await getSessionUser();
  const rows = await d1Query<TierListRow>(
    `select tl.*, u.username, u.display_name, u.avatar_url
     from tier_lists tl join users u on u.id = tl.user_id
     where tl.slug = ?`,
    [slug]
  );
  if (!rows.length) return null;
  const list = toTierList(rows[0]);
  if (!list.is_public && list.user_id !== user?.id) return null;
  const items = await d1Query<TierListItem>(
    "select * from tier_list_items where tier_list_id = ? order by position",
    [list.id]
  );
  return { ...list, items };
}

export async function getPublicTierLists(limit = 30): Promise<TierList[]> {
  const rows = await d1Query<TierListRow>(
    `select tl.*, u.username, u.display_name, u.avatar_url
     from tier_lists tl join users u on u.id = tl.user_id
     where tl.is_public = 1 order by tl.updated_at desc limit ?`,
    [limit]
  );
  return rows.map(toTierList);
}

export async function getMyTierLists(): Promise<TierList[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const rows = await d1Query<TierListRow>(
    "select * from tier_lists where user_id = ? order by updated_at desc",
    [user.id]
  );
  return rows.map(toTierList);
}
