-- llmtierlist.com D1 (SQLite) schema
-- Auth is WorkOS; users.id is the WorkOS user id. Authorization is enforced in
-- the app layer (D1 has no RLS).

create table if not exists users (
  id text primary key,
  email text not null,
  username text not null unique,
  display_name text,
  avatar_url text,
  avatar_blob text,                 -- data URI of the uploaded avatar, served via /avatars/[username]
  bio text not null default '',
  onboarded integer not null default 0,
  created_at text not null default (datetime('now'))
);

create table if not exists models (
  id text primary key,              -- OpenRouter id, e.g. "anthropic/claude-opus-4.5"
  slug text not null unique,
  name text not null,
  vendor text not null,
  vendor_slug text not null default '',
  description text not null default '',
  license text not null default 'proprietary' check (license in ('proprietary', 'open-weights')),
  release_date text,
  context_window integer,
  base_model_id text,               -- set on variants (thinking mode / service tier)
  variant text,                     -- 'thinking' | 'service' | null (base model)
  created_at text not null default (datetime('now'))
);
create index if not exists models_vendor_slug_idx on models (vendor_slug);

create table if not exists votes (
  user_id text not null references users (id) on delete cascade,
  model_id text not null references models (id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at text not null default (datetime('now')),
  primary key (user_id, model_id)
);
create index if not exists votes_model_id_idx on votes (model_id);

create table if not exists reviews (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  model_id text not null references models (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text not null default '',
  body text not null check (length(body) between 1 and 5000),
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (user_id, model_id)
);
create index if not exists reviews_model_id_idx on reviews (model_id);

create table if not exists tier_lists (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  slug text not null unique,
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  is_public integer not null default 1,
  tiers text,                       -- JSON [{key,label,color}] row definitions; null = default S-F
  rank_modes integer not null default 0, -- 1 = ranked at thinking-mode granularity
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists tier_lists_user_id_idx on tier_lists (user_id);

create table if not exists tier_list_items (
  tier_list_id text not null references tier_lists (id) on delete cascade,
  model_id text not null references models (id) on delete cascade,
  tier text not null,               -- key into the list's tier definitions
  tier_index integer not null default 0, -- row position at save time (0 = top)
  position integer not null default 0,
  primary key (tier_list_id, model_id)
);
create index if not exists tier_list_items_model_id_idx on tier_list_items (model_id);

drop view if exists model_stats;
create view model_stats as
select
  m.id as model_id,
  coalesce(v.upvotes, 0) as upvotes,
  coalesce(v.downvotes, 0) as downvotes,
  coalesce(v.net_score, 0) as net_score,
  coalesce(r.review_count, 0) as review_count,
  r.avg_rating as avg_rating,
  t.placement_count as placement_count,
  t.avg_tier_value as avg_tier_value
from models m
left join (
  select model_id,
    sum(case when value = 1 then 1 else 0 end) as upvotes,
    sum(case when value = -1 then 1 else 0 end) as downvotes,
    sum(value) as net_score
  from votes group by model_id
) v on v.model_id = m.id
left join (
  select model_id, count(*) as review_count, avg(rating) as avg_rating
  from reviews group by model_id
) r on r.model_id = m.id
left join (
  select i.model_id,
    count(*) as placement_count,
    avg(case when i.tier_index >= 5 then 0 else 5 - i.tier_index end) as avg_tier_value
  from tier_list_items i
  join tier_lists tl on tl.id = i.tier_list_id and tl.is_public = 1
  group by i.model_id
) t on t.model_id = m.id;

create table if not exists list_votes (
  user_id text not null references users (id) on delete cascade,
  tier_list_id text not null references tier_lists (id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at text not null default (datetime('now')),
  primary key (user_id, tier_list_id)
);
create index if not exists list_votes_list_idx on list_votes (tier_list_id);

create table if not exists og_cache (
  tier_list_id text primary key references tier_lists (id) on delete cascade,
  png text not null,                -- base64 of the pre-rendered OG image
  updated_at text not null default (datetime('now'))
);

create table if not exists og_home_cache (
  id integer primary key check (id = 1), -- single row: the site-wide OG image
  png text not null,
  updated_at text not null default (datetime('now'))
);

-- First-party analytics: one row per (day, visitor). Visitor is a daily
-- sha-256 of ip+user-agent (Plausible-style) — no cookies, not reversible.
create table if not exists visits (
  day text not null,
  visitor text not null,
  views integer not null default 1,
  primary key (day, visitor)
);
create table if not exists anon_votes (
  anon_id text not null,
  model_id text not null references models (id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  ip_hash text,                     -- daily-salted; one anon vote per network per model
  created_at text not null default (datetime('now')),
  primary key (anon_id, model_id)
);
create index if not exists anon_votes_model_idx on anon_votes (model_id);

create table if not exists anon_list_votes (
  anon_id text not null,
  tier_list_id text not null references tier_lists (id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  ip_hash text,
  created_at text not null default (datetime('now')),
  primary key (anon_id, tier_list_id)
);
create index if not exists anon_list_votes_list_idx on anon_list_votes (tier_list_id);

create table if not exists rate_limits (
  bucket text not null,
  day text not null,
  count integer not null default 0,
  primary key (bucket, day)
);

drop view if exists model_stats;
create view model_stats as
select
  m.id as model_id,
  coalesce(v.upvotes, 0) as upvotes,
  coalesce(v.downvotes, 0) as downvotes,
  coalesce(v.net_score, 0) as net_score,
  coalesce(r.review_count, 0) as review_count,
  r.avg_rating as avg_rating,
  t.placement_count as placement_count,
  t.avg_tier_value as avg_tier_value
from models m
left join (
  select model_id,
    sum(case when value = 1 then 1 else 0 end) as upvotes,
    sum(case when value = -1 then 1 else 0 end) as downvotes,
    sum(value) as net_score
  from (
    select model_id, value from votes
    union all
    select model_id, value from anon_votes
  )
  group by model_id
) v on v.model_id = m.id
left join (
  select model_id, count(*) as review_count, avg(rating) as avg_rating
  from reviews group by model_id
) r on r.model_id = m.id
left join (
  select i.model_id,
    count(*) as placement_count,
    avg(case when i.tier_index >= 5 then 0 else 5 - i.tier_index end) as avg_tier_value
  from tier_list_items i
  join tier_lists tl on tl.id = i.tier_list_id and tl.is_public = 1
  group by i.model_id
) t on t.model_id = m.id;

-- Daily snapshot of each tracked model's standing, for score-over-time charts.
create table if not exists model_score_history (
  model_id text not null references models (id) on delete cascade,
  day text not null,
  net_score integer not null default 0,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  placements integer not null default 0,
  primary key (model_id, day)
);
create index if not exists msh_day_idx on model_score_history (day);
