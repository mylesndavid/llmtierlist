# llmtierlist.com

Crowdsourced LLM rankings — vote models up or down, write reviews, build and
share your own tier lists, and see the community's aggregate tier list.

**Stack:** Next.js 16 (App Router) · Cloudflare D1 (SQLite) · WorkOS AuthKit · Tailwind CSS · dnd-kit

## Features

- **Leaderboard** (`/`) — models ranked by net upvotes
- **Model directory** (`/models`) — the full OpenRouter catalog (~417 models), searchable, filterable by lab / license / recency
- **Reviews** — star ratings + written reviews, one per user per model
- **Tier list maker** (`/tierlists/new`) — drag-and-drop S–F builder with lab logos, pool filters (labs include/exclude, open/closed weights, release window), share links (`/t/<slug>`)
- **OG images** — shared tier list links render the actual board as the social preview
- **Community tier list** (`/tiers`) — aggregate tiers from votes + public placements
- **Auth** — WorkOS AuthKit (hosted sign-in: Google, GitHub, email), session in a signed httpOnly cookie

## Architecture

- **D1 over REST** — the app talks to D1 through Cloudflare's REST API
  (`src/lib/d1.ts`), so it deploys anywhere (Vercel, Cloudflare, a VPS) with no
  Workers binding required. Authorization is enforced in the app layer
  (`src/lib/actions.ts`); there is no RLS.
- **Model catalog** — `npm run sync:models` pulls the OpenRouter catalog into
  the `models` table (the DB is the cache; upsert on OpenRouter id) and copies
  lab logos from `@lobehub/icons-static-svg` into `public/logos/`. Re-run to
  pick up new releases; wire into a daily cron for production.
- **Schema** — `db/schema.sql`. Apply with
  `npx wrangler d1 execute llmtierlist --remote --file db/schema.sql`
  (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment).
- **Auth flow** — `/login` → AuthKit hosted page → `/auth/callback` exchanges
  the code, upserts the `users` row, sets a 30-day JWT cookie (`src/lib/auth.ts`).

## Local development

```bash
npm install
npm run dev
```

`.env.local` needs the variables in `.env.example` (Cloudflare token/account/db,
WorkOS keys, a session secret). Dev talks to the same remote D1 database — no
local database to run.

**WorkOS setup (one-time, in the [dashboard](https://dashboard.workos.com)):**
under Redirects, add `http://localhost:3000/auth/callback` (and the production
`https://llmtierlist.com/auth/callback` when deploying).

## Deploying

1. Host the Next.js app anywhere (Vercel is simplest) with the `.env.example`
   variables set.
2. Add the production redirect URI in WorkOS and switch to a production
   (`sk_live_…`) API key.
3. Point llmtierlist.com DNS at the host.
4. Schedule `npm run sync:models` daily (GitHub Action / cron) to keep the
   catalog fresh.

## Repo notes

- `supabase/` is the retired first iteration (the app ran on Supabase before
  moving to D1 + WorkOS) — safe to delete.
- Community tier math lives in `src/lib/tiers.ts`: net votes + a capped bonus
  from public tier-list placements, bucketed by percentile (top 10% = S).
