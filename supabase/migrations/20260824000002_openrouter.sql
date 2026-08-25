-- Models are now synced from the OpenRouter catalog (scripts/sync-models.mjs).
alter table public.models
  add column or_id text unique,
  add column vendor_slug text not null default '';

create index models_vendor_slug_idx on public.models (vendor_slug);

-- service_role bypasses RLS but still needs SQL-level privileges (used by sync script)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
