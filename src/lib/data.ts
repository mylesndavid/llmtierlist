import { d1Query } from "./d1";
import { getSessionUser } from "./auth";
import {
  DEFAULT_TIERS,
  type Model,
  type ModelStats,
  type ModelWithStats,
  type PublicProfile,
  type Review,
  type TierDef,
  type TierList,
  type TierListItem,
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

// Per-isolate cache for the hot catalog query (417 rows + stats aggregation).
// Busted by write actions in the same isolate; other isolates age out in 30s.
let modelsCache: { data: ModelWithStats[]; ts: number } | null = null;

export function bustModelsCache() {
  modelsCache = null;
}

export async function getModelsWithStats(): Promise<ModelWithStats[]> {
  if (modelsCache && Date.now() - modelsCache.ts < 30_000) return modelsCache.data;
  const rows = await d1Query<ModelRow>(`${MODEL_SELECT} order by m.name`);
  const data = rows.map(withStats);
  modelsCache = { data, ts: Date.now() };
  return data;
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

type TierListRow = Omit<TierList, "is_public" | "profiles" | "tiers"> & {
  is_public: number;
  tiers: string | null;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

function parseTiers(json: string | null): TierDef[] {
  if (!json) return DEFAULT_TIERS;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_TIERS;
}

function toTierList(row: TierListRow): TierList {
  const { username, display_name, avatar_url, ...rest } = row;
  return {
    ...rest,
    is_public: !!row.is_public,
    tiers: parseTiers(row.tiers),
    profiles: username
      ? { username, display_name: display_name ?? null, avatar_url: avatar_url ?? null }
      : undefined,
  };
}

export async function getTierListBySlug(
  slug: string
): Promise<
  | (TierList & { items: TierListItem[]; score: number; myVote: number })
  | null
> {
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
  const [items, scoreRows, voteRows] = await Promise.all([
    d1Query<TierListItem>(
      "select * from tier_list_items where tier_list_id = ? order by position",
      [list.id]
    ),
    d1Query<{ score: number | null }>(
      "select sum(value) as score from list_votes where tier_list_id = ?",
      [list.id]
    ),
    user
      ? d1Query<{ value: number }>(
          "select value from list_votes where tier_list_id = ? and user_id = ?",
          [list.id, user.id]
        )
      : Promise.resolve([]),
  ]);
  return {
    ...list,
    items,
    score: scoreRows[0]?.score ?? 0,
    myVote: voteRows[0]?.value ?? 0,
  };
}

export type BrowseTierList = TierList & {
  score: number;
  /** ordered vendor slugs per tier key, for the card mini-preview logos */
  tier_previews: Record<string, string[]>;
};

export async function getPublicTierLists(limit = 30): Promise<BrowseTierList[]> {
  const rows = await d1Query<TierListRow & { score: number | null }>(
    `select tl.*, u.username, u.display_name, u.avatar_url,
       (select sum(value) from list_votes lv where lv.tier_list_id = tl.id) as score
     from tier_lists tl join users u on u.id = tl.user_id
     where tl.is_public = 1
     order by coalesce(score, 0) desc, tl.updated_at desc limit ?`,
    [limit]
  );
  const lists = rows.map((r) => ({ ...toTierList(r), score: r.score ?? 0 }));
  if (lists.length === 0) return [];

  const items = await d1Query<{ tier_list_id: string; tier: string; vendor_slug: string }>(
    `select i.tier_list_id, i.tier, m.vendor_slug
     from tier_list_items i join models m on m.id = i.model_id
     where i.tier_list_id in (${lists.map(() => "?").join(",")})
     order by i.tier_index, i.position`,
    lists.map((l) => l.id)
  );
  const byList = new Map<string, Record<string, string[]>>();
  for (const it of items) {
    const rec = byList.get(it.tier_list_id) ?? {};
    (rec[it.tier] ??= []).push(it.vendor_slug);
    byList.set(it.tier_list_id, rec);
  }
  return lists.map((l) => ({ ...l, tier_previews: byList.get(l.id) ?? {} }));
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const rows = await d1Query<PublicProfile>(
    `select u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
       (select count(*) from tier_lists tl where tl.user_id = u.id and tl.is_public = 1) as list_count,
       (select count(*) from reviews r where r.user_id = u.id) as review_count,
       (select count(*) from votes v where v.user_id = u.id) as vote_count
     from users u where u.username = ?`,
    [username]
  );
  return rows[0] ?? null;
}

export async function getTierListsByUser(
  userId: string,
  includePrivate: boolean
): Promise<TierList[]> {
  const rows = await d1Query<TierListRow>(
    `select * from tier_lists where user_id = ? ${includePrivate ? "" : "and is_public = 1"}
     order by updated_at desc`,
    [userId]
  );
  return rows.map(toTierList);
}

export interface UserReview {
  rating: number;
  title: string;
  body: string;
  created_at: string;
  model_name: string;
  model_slug: string;
}

export async function getReviewsByUser(userId: string, limit = 10): Promise<UserReview[]> {
  return d1Query<UserReview>(
    `select r.rating, r.title, r.body, r.created_at, m.name as model_name, m.slug as model_slug
     from reviews r join models m on m.id = r.model_id
     where r.user_id = ? order by r.created_at desc limit ?`,
    [userId, limit]
  );
}

/** Full own-user row for the settings/welcome forms. */
export async function getOwnProfile() {
  const user = await getSessionUser();
  if (!user) return null;
  const rows = await d1Query<{
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string;
    onboarded: number;
  }>("select username, display_name, avatar_url, bio, onboarded from users where id = ?", [
    user.id,
  ]);
  return rows[0] ? { ...rows[0], onboarded: !!rows[0].onboarded } : null;
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
