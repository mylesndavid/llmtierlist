-- llmtierlist.com initial schema

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- auto-create a profile on signup from OAuth metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    split_part(new.email, '@', 1),
    'user'
  );
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g'));
  if base_username = '' then base_username := 'user'; end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', final_username),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ models ============
create table public.models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  vendor text not null,
  description text not null default '',
  license text not null default 'proprietary' check (license in ('proprietary', 'open-weights')),
  release_date date,
  context_window integer,
  accent_color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

alter table public.models enable row level security;

create policy "models are viewable by everyone"
  on public.models for select using (true);

-- ============ votes ============
create table public.votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, model_id)
);

alter table public.votes enable row level security;

create policy "votes are viewable by everyone"
  on public.votes for select using (true);

create policy "users can insert own votes"
  on public.votes for insert with check (auth.uid() = user_id);

create policy "users can update own votes"
  on public.votes for update using (auth.uid() = user_id);

create policy "users can delete own votes"
  on public.votes for delete using (auth.uid() = user_id);

create index votes_model_id_idx on public.votes (model_id);

-- ============ reviews ============
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text not null default '',
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, model_id)
);

alter table public.reviews enable row level security;

create policy "reviews are viewable by everyone"
  on public.reviews for select using (true);

create policy "users can insert own reviews"
  on public.reviews for insert with check (auth.uid() = user_id);

create policy "users can update own reviews"
  on public.reviews for update using (auth.uid() = user_id);

create policy "users can delete own reviews"
  on public.reviews for delete using (auth.uid() = user_id);

create index reviews_model_id_idx on public.reviews (model_id);

-- ============ tier lists ============
create table public.tier_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tier_lists enable row level security;

create policy "public tier lists are viewable, own always"
  on public.tier_lists for select using (is_public or auth.uid() = user_id);

create policy "users can insert own tier lists"
  on public.tier_lists for insert with check (auth.uid() = user_id);

create policy "users can update own tier lists"
  on public.tier_lists for update using (auth.uid() = user_id);

create policy "users can delete own tier lists"
  on public.tier_lists for delete using (auth.uid() = user_id);

create index tier_lists_user_id_idx on public.tier_lists (user_id);

create table public.tier_list_items (
  tier_list_id uuid not null references public.tier_lists (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  tier text not null check (tier in ('S', 'A', 'B', 'C', 'D', 'F')),
  position integer not null default 0,
  primary key (tier_list_id, model_id)
);

alter table public.tier_list_items enable row level security;

create policy "items of visible tier lists are viewable"
  on public.tier_list_items for select using (
    exists (
      select 1 from public.tier_lists tl
      where tl.id = tier_list_id and (tl.is_public or tl.user_id = auth.uid())
    )
  );

create policy "users can insert items into own tier lists"
  on public.tier_list_items for insert with check (
    exists (
      select 1 from public.tier_lists tl
      where tl.id = tier_list_id and tl.user_id = auth.uid()
    )
  );

create policy "users can update items in own tier lists"
  on public.tier_list_items for update using (
    exists (
      select 1 from public.tier_lists tl
      where tl.id = tier_list_id and tl.user_id = auth.uid()
    )
  );

create policy "users can delete items from own tier lists"
  on public.tier_list_items for delete using (
    exists (
      select 1 from public.tier_lists tl
      where tl.id = tier_list_id and tl.user_id = auth.uid()
    )
  );

create index tier_list_items_model_id_idx on public.tier_list_items (model_id);

-- ============ aggregated stats ============
-- Per-model aggregate: net vote score, counts, avg rating, avg community tier.
-- Tier placements map S=5 .. F=0; only public tier lists count.
create or replace view public.model_stats
with (security_invoker = off) as
select
  m.id as model_id,
  coalesce(v.upvotes, 0)::int as upvotes,
  coalesce(v.downvotes, 0)::int as downvotes,
  coalesce(v.net_score, 0)::int as net_score,
  coalesce(r.review_count, 0)::int as review_count,
  r.avg_rating::numeric(3, 2) as avg_rating,
  t.placement_count::int as placement_count,
  t.avg_tier_value::numeric(3, 2) as avg_tier_value
from public.models m
left join (
  select model_id,
    count(*) filter (where value = 1) as upvotes,
    count(*) filter (where value = -1) as downvotes,
    sum(value) as net_score
  from public.votes group by model_id
) v on v.model_id = m.id
left join (
  select model_id, count(*) as review_count, avg(rating) as avg_rating
  from public.reviews group by model_id
) r on r.model_id = m.id
left join (
  select i.model_id,
    count(*) as placement_count,
    avg(case i.tier when 'S' then 5 when 'A' then 4 when 'B' then 3
                    when 'C' then 2 when 'D' then 1 else 0 end) as avg_tier_value
  from public.tier_list_items i
  join public.tier_lists tl on tl.id = i.tier_list_id and tl.is_public
  group by i.model_id
) t on t.model_id = m.id;

grant select on public.model_stats to anon, authenticated;

-- ============ grants (RLS still applies) ============
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.models, public.votes, public.reviews,
  public.tier_lists, public.tier_list_items to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.votes, public.reviews,
  public.tier_lists, public.tier_list_items to authenticated;
