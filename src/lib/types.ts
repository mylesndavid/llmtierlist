export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = string;

export interface TierDef {
  key: string;
  label: string;
  color: string;
}

export const DEFAULT_TIERS: TierDef[] = [
  { key: "S", label: "S", color: "#ff7f7e" },
  { key: "A", label: "A", color: "#ffbf7f" },
  { key: "B", label: "B", color: "#ffdf80" },
  { key: "C", label: "C", color: "#ffff7f" },
  { key: "D", label: "D", color: "#bfff7f" },
  { key: "F", label: "F", color: "#7fff7f" },
];

export const TIER_PALETTE = [
  "#ff7f7e", "#ffbf7f", "#ffdf80", "#ffff7f", "#bfff7f", "#7fff7f",
  "#7fffff", "#7fbfff", "#bf7fff", "#ff7fbf", "#d4d4d4", "#8c8c8c",
];

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarded: boolean;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  list_count: number;
  review_count: number;
  vote_count: number;
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
  tiers: TierDef[];
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface TierListItem {
  tier_list_id: string;
  model_id: string;
  tier: string;
  tier_index: number;
  position: number;
}
