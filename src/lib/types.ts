export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIERS)[number];

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Model {
  id: string; // OpenRouter id, e.g. "anthropic/claude-opus-4.5"
  slug: string;
  name: string;
  vendor: string;
  vendor_slug: string;
  description: string;
  license: "proprietary" | "open-weights";
  release_date: string | null;
  context_window: number | null;
}

export interface ModelStats {
  model_id: string;
  upvotes: number;
  downvotes: number;
  net_score: number;
  review_count: number;
  avg_rating: number | null;
  placement_count: number | null;
  avg_tier_value: number | null;
}

export type ModelWithStats = Model & { stats: ModelStats };

export interface Profile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Review {
  id: string;
  user_id: string;
  model_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface TierList {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface TierListItem {
  tier_list_id: string;
  model_id: string;
  tier: Tier;
  position: number;
}
