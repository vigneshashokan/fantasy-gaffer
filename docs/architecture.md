# Architecture

## Stack
- **Mobile**: Expo / React Native (this repo).
- **Backend**: Supabase (hosted)
  - **Postgres** + Row Level Security for data and authz.
  - **Auth** for Google / Apple / email (added in issues #13–#15).
  - **Edge Functions** (Deno) for custom server logic.
  - **pg_cron** for scheduled jobs (FPL ingestion lands in issue #20).
- **Region**: `us-east-1` (N. Virginia).

## Why Supabase
Managed BaaS removes the auth / DB / cron toil for a solo project, RLS gives Postgres-native authz next to the data, and Deno-based Edge Functions cover the few custom endpoints we need. If a workload outgrows Edge Functions later, the worker can move to Fly.io / Railway / Render without touching auth or DB.

## Environments
- **Local**: `supabase start` (full Docker stack matching prod).
- **Production**: one hosted Supabase project.

### Future: adding staging
When the app is closer to launch:
1. Create a second Supabase project in the same region; capture its Project Ref + anon key.
2. Apply the existing migrations to staging: `supabase link --project-ref <STAGING_REF>` then `supabase db push`. (Migrations in `supabase/migrations/` are the source of truth, so staging starts identical to prod.)
3. Add a `staging` set of GitHub Actions secrets (or rename the existing ones to `_PROD` and add `_STAGING`).
4. Change `deploy-supabase.yml` to target staging on merge to `main`; add a `workflow_dispatch` job that promotes staging → prod.
5. Add an EAS Build `staging` profile injecting the staging URL into `EXPO_PUBLIC_SUPABASE_*`.

## Per-environment one-time setup

Some features rely on values that live in Supabase Vault rather than CI secrets — they're referenced by SQL (`pg_cron`) and can't be passed via env vars.

For each environment (currently: prod), open Studio → SQL Editor and run **once**:

```sql
-- For the FPL ingestion cron (#20).
select vault.create_secret('https://<project-ref>.supabase.co', 'supabase_url');
select vault.create_secret('<anon key from Settings → API>',    'supabase_anon_key');

-- Shared secret authenticating the cron -> Edge Function calls (#165).
-- Generate with: openssl rand -hex 32
-- (hex, so there is no +, / or = to escape in an HTTP header)
select vault.create_secret('<value>', 'ingest_shared_secret');
```

Verify with `select name from vault.decrypted_secrets;` — all three names should appear.

**`ingest_shared_secret` must be seeded in TWO places, to the same value.** The
Vault copy above is what `pg_cron` sends; the functions read their own copy from
the runtime environment:

```bash
supabase secrets set INGEST_SHARED_SECRET=<same value>
```

Verify with `supabase secrets list`. The names are checkable; that the two
*values* match is not — get it right by construction.

`fpl-ingest` and `fpl-project` **fail closed**: an unset secret rejects every
request with 503 rather than quietly reverting to an open endpoint. So seed this
BEFORE deploying the functions that check it, or the scheduled jobs will 503
until you do. (`ping` is deliberately exempt — a static health check with no
database or upstream access.)

The `fpl-ingest` Edge Function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its runtime environment. **No setup required** — the Supabase platform auto-injects both into every Edge Function. (The CLI actively refuses `supabase secrets set` for any name starting with `SUPABASE_` because they're reserved for the platform.)

## Scheduled jobs (pg_cron)

All FPL-ingest jobs share one Vault-backed `x-ingest-secret` (see above) and are offset a few minutes apart so they don't hit FPL concurrently from one egress IP. Authoritative source: the `cron.schedule(...)` calls in `supabase/migrations/` (most recently consolidated in `20260726120000_cron_shared_secret_and_daily_fixtures.sql`; `season-history`'s own migration name and file link below).

| Job (`cron.schedule` name) | Schedule (UTC) | Calls | Notes |
|---|---|---|---|
| `fpl-ingest-bootstrap` | `0 3 * * *` (daily) | `fpl-ingest?source=bootstrap` | Players/clubs; calendar-gated off-season |
| `fpl-ingest-fixtures` | `15 3 * * *` (daily) | `fpl-ingest?source=fixtures` | Content-hash gated no-op on quiet days |
| `fpl-ingest-history` | `30 3 * * *` (daily) | `fpl-ingest?source=history` | Self-healing `player_gw_history` capture |
| `fpl-ingest-season-history` | `45 3 * * *` (daily) | `fpl-ingest?source=season-history` | **New (#212).** Runs after bootstrap (so `players.code` is fresh) and after history, before `fpl-project` reads the seeds. Self-limiting: skips wholesale once every player has a `player_season_history` row, so a saturated run is one cheap query. Migration: `20260727090100_season_history_cron.sql` |
| `fpl-project` | `0 4 * * *` (daily) | `fpl-project` | xPts serving; reads the fresh `players`/`fixtures`/history above |
| `fpl-ingest-snapshot` | `15 0,6,12,18 * * *` (6-hourly) | `fpl-ingest?source=snapshot` | Live-only bootstrap fields (`ep_next`, ownership, set-piece order) — unrecoverable if missed, so frequency is the redundancy |
| `purge-expired-account-deletions` | `0 3 * * *` (daily) | `purge_expired_account_deletions()` (SQL function, not an Edge Function) | Account deletion grace-period sweep (#19) |

`xpts-serve.yml` (the v3.1 shadow-serving batch, #128/#130) runs on **GitHub Actions**, not `pg_cron` — nightly 04:30 UTC, after `fpl-project`. See the xPts v2 section of `CLAUDE.md`.

## Repo layout

```
fantasy-gaffer/
├─ supabase/
│  ├─ config.toml
│  ├─ seed.sql
│  ├─ migrations/
│  │  └─ 20260604000000_init.sql
│  └─ functions/
│     └─ ping/
│        ├─ index.ts
│        ├─ deno.json
│        └─ .npmrc
├─ src/
│  └─ lib/supabase.ts     # @supabase/supabase-js client singleton
├─ app.config.ts          # Reads EXPO_PUBLIC_SUPABASE_* into Expo `extra`
├─ .env.example           # Template for the real `.env`
└─ .github/workflows/deploy-supabase.yml
```

## First-time setup
1. Install the Supabase CLI: `brew install supabase/tap/supabase`.
2. Create a Supabase account at https://supabase.com.
3. Create a new project; pick region `us-east-1`; set a strong DB password (save in a password manager).
4. Capture from the dashboard:
   - Project Reference ID (Settings → General).
   - Anon key + Project URL (Settings → API).
5. Create a personal access token (Account → Access Tokens) for CI.
6. Add these GitHub Actions secrets (Settings → Secrets and variables → Actions):
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
7. Locally: `cp .env.example .env`, then fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Running locally
- `cp .env.example .env` + fill in values from your Supabase project.
- (Optional, for a fully offline backend) `supabase start` to boot a local Postgres + Auth + Edge Functions stack in Docker.
- `npm start` to run the Expo dev server.

### How the app reads the env vars
`app.config.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` at bundle time and maps them into Expo's `extra` field. App code then reads them via `Constants.expoConfig?.extra?.supabaseUrl` (see `src/lib/supabase.ts`). Don't read `process.env.EXPO_PUBLIC_*` directly from app code — it'll be `undefined` at runtime.

## Deploying
- Merge to `main` → GitHub Actions runs `supabase db push` + `supabase functions deploy ping`. Path-filtered to `supabase/**`, so UI-only PRs don't spend CI minutes.
- Mobile app deploys via EAS separately (Phase 5).
