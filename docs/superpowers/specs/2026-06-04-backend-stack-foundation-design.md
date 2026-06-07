# Backend Stack Foundation — Design Spec

**Issue**: [#10 — Choose backend stack and provision infrastructure](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/10)
**Date**: 2026-06-04
**Status**: Approved

---

## Purpose

Pick the backend stack and lay the minimum scaffolding so the mobile app can call a deployed endpoint over an env-driven URL. This is the foundation for all of Phase 1 (auth, DB schema, FPL data ingestion, replacing mock data).

Out of scope: auth implementation, real schema beyond a smoke-test table, FPL ingestion, replacing mock data — each is a separate Phase 1 issue (#11–#21).

## Decisions

| Layer | Choice | Why |
|---|---|---|
| Auth | Supabase Auth | Built-in Google / Apple / email providers — covers issues #13–#16 with no extra infra. |
| Database | Supabase Postgres | Real Postgres (not Firestore), free tier sufficient for development. |
| Authz | Row Level Security policies | Native to Postgres, keeps authz next to data. |
| API surface | Supabase REST/RPC (PostgREST) + Edge Functions (Deno) | PostgREST covers most CRUD; Edge Functions handle custom logic (e.g. the eventual FPL ingestion). |
| Scheduled jobs | pg_cron + Edge Functions | Stays inside Supabase — no separate worker provider to provision. If a job outgrows Edge Functions later, the worker can move to Fly.io / Railway / Render without changing auth or DB. |
| Region | us-east-1 (N. Virginia) | Balanced for a Canada-based developer releasing worldwide. ~25ms dev latency, decent for North America + UK, common neutral default. |
| Environments | Local (`supabase start`) + Production (single hosted project) | Solo-dev friction minimised. Migration path to Staging + Prod kept open via env-driven config (see "Future: adding staging" below). |
| Mobile client | Existing Expo/RN, adds `@supabase/supabase-js` | One SDK for auth + DB + functions; client singleton in `src/lib/supabase.ts`. |
| Code layout | Monorepo — `supabase/` directory in this repo | Single source of truth; migrations + functions versioned alongside the app code. |

### Alternatives considered

- **Pure-Supabase from day one (skip the "custom worker" idea)** — chosen. The hybrid option in the original issue (Supabase + custom Node worker) was rejected during brainstorming after we realised pg_cron + Edge Functions cover the ingestion workload for the foreseeable future.
- **Firebase** — not chosen. Firestore (NoSQL) is a worse fit than Postgres for the relational FPL data model (players ↔ fixtures ↔ teams ↔ user-squads).
- **Custom Node/TS API on Fly.io/Railway/Render** — not chosen. More DevOps surface than the project needs at this stage.
- **`eu-west-2` (London) region** — not chosen despite the FPL audience skewing UK. Dev-loop latency from Canada would be ~80–100ms on every CLI round-trip, and "worldwide" weakens the case for any single regional bias.
- **`ca-central-1` (Montreal) region** — not chosen. Best dev experience but worst for the US/UK user majority.
- **Staging + Production from day one** — deferred. Doubles the surface to manage with no immediate payoff; can be added later in ~30 minutes once the app is closer to launch.

## Repo Layout

```
fpl-gaffer-react-native-app/
├─ supabase/                          # NEW — Supabase CLI workspace
│  ├─ config.toml                     # project ref, local stack ports
│  ├─ migrations/
│  │  └─ 20260604000000_init.sql      # creates "health" table for smoke test
│  └─ functions/
│     └─ ping/
│        └─ index.ts                  # Deno Edge Function, returns {status: "ok"}
├─ src/
│  └─ lib/
│     └─ supabase.ts                  # NEW — @supabase/supabase-js client singleton
├─ docs/
│  └─ architecture.md                 # NEW — stack decisions, how to run locally, deploy
├─ .github/
│  └─ workflows/
│     └─ deploy-supabase.yml          # NEW — push migrations + functions on merge to main
├─ .env.example                       # NEW — EXPO_PUBLIC_SUPABASE_URL, ANON_KEY
└─ app.config.ts                      # MODIFIED — read env vars into Expo "extra"
```

## App-Client Wiring

**`src/lib/supabase.ts`** — singleton, reads from Expo's `extra` config:

```ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**`app.config.ts`** — pull env vars into Expo runtime config:

```ts
export default {
  expo: {
    /* …existing config… */
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
```

**`.env.example`** (committed; real `.env` stays gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

**Why `EXPO_PUBLIC_*`**: Expo embeds these in the JS bundle. The anon key is safe to ship — RLS does the actual gatekeeping. Anything not prefixed stays server-only.

**Verification path** (the "hello-world" required by the AC): a throwaway dev-only button on the Settings screen calls the `ping` Edge Function via `supabase.functions.invoke('ping')` and displays the response. Removed once #21 lands and real screens are wired.

## Edge Function

**`supabase/functions/ping/index.ts`**:

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(() =>
  new Response(
    JSON.stringify({ status: 'ok', ts: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  ),
);
```

**`supabase/migrations/20260604000000_init.sql`** — a `health` table so the DB side is reachable too:

```sql
create table if not exists public.health (id int primary key, note text not null);
insert into public.health (id, note) values (1, 'ok') on conflict do nothing;
alter table public.health enable row level security;
create policy "health read for anon" on public.health for select using (true);
```

## CI/CD

**`.github/workflows/deploy-supabase.yml`** — triggers on `push` to `main`, path-filtered to `supabase/**` so UI-only PRs don't spend CI minutes. Steps:

1. Checkout
2. Install Supabase CLI (`supabase/setup-cli@v1`)
3. `supabase link --project-ref $SUPABASE_PROJECT_REF`
4. `supabase db push` — applies any new migrations to prod
5. `supabase functions deploy ping --no-verify-jwt` — deploys/updates the function

**Secrets the user adds in repo settings after Supabase is provisioned**:

| Secret | Source |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID |
| `SUPABASE_DB_PASSWORD` | The DB password set at project creation |

**Mobile-app env vars** (separate from CI — go in local `.env` now; EAS env setup deferred to Phase 5 when builds land):

| Var | Where |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Local `.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Local `.env` |

## Architecture Doc

`docs/architecture.md` content outline:

```
# Architecture

## Stack
- Mobile: Expo / React Native (existing)
- Backend: Supabase (hosted)
  - Postgres + RLS for data and authz
  - Auth for Google / Apple / email
  - Edge Functions (Deno) for custom server logic
  - pg_cron for scheduled jobs (FPL ingestion)
- Region: us-east-1

## Why Supabase
[2–3 sentence rationale: managed BaaS removes auth/DB/cron toil for a
solo project, RLS gives Postgres-native authz, Deno functions cover
the few custom endpoints we need.]

## Environments
- Local: `supabase start` (Docker stack matches prod)
- Production: single hosted project

### Future: adding staging
[5-line recipe: new project, copy schema via `supabase db dump`, swap
CI secret, add an EAS Build profile.]

## Repo layout
[copy of the repo-layout tree from this spec]

## First-time setup
1. Create Supabase account at supabase.com
2. Create project — name it, set DB password, pick region us-east-1
3. Grab Project Ref (Settings → General), anon key + URL (Settings → API)
4. Create a Supabase access token (Account → Access Tokens) for CI
5. Add 3 GitHub Actions secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD
6. Locally: `cp .env.example .env` and fill in URL + anon key
7. Install Supabase CLI: `brew install supabase/tap/supabase`

## Running locally
- `cp .env.example .env` + fill values from your Supabase project
- `supabase start` for a local backend (optional)
- `npm start` for the Expo dev server

## Deploying
- Merge to main → GitHub Actions runs `supabase db push` + `supabase functions deploy`
- Mobile app deploys via EAS separately (Phase 5)
```

## Manual Steps the User Performs (Out of Band)

These can't be automated from a coding agent — they need a logged-in human:

1. Create Supabase account at supabase.com
2. Create a new project; pick region `us-east-1`; set a strong DB password (saved in a password manager)
3. From the dashboard, capture: Project Ref, Anon key, Project URL, Service Role key (for later)
4. Create a Supabase personal access token (Account → Access Tokens) for CI
5. Add the 3 GitHub Actions secrets listed above
6. Locally: `cp .env.example .env` and paste in URL + anon key
7. Install the Supabase CLI: `brew install supabase/tap/supabase`

The spec's implementation plan will reference this list; the actual `docs/architecture.md` written during implementation will include it as the "First-time setup" checklist.

## Acceptance Criteria

From the issue (#10), each AC mapped to where it's satisfied by this design:

- [x] Stack chosen and documented in repo (`docs/architecture.md`) — covered by the architecture doc above.
- [x] API host provisioned with a hello-world endpoint reachable from the app — `ping` Edge Function, called from a dev-only button in the app.
- [x] Postgres provisioned with connection string in secrets — Supabase project created in manual step (2); connection string never leaves Supabase (we use the SDK with URL + anon key from `.env`).
- [x] CI deploys to staging on merge to main — interpreted as "CI deploys to the live project on merge to main" per the agreed Local + Prod environments choice; the future-staging recipe is documented for when staging is added.
- [x] App client has an env-var-driven `API_BASE_URL` — `EXPO_PUBLIC_SUPABASE_URL` in `app.config.ts → extra → supabaseUrl`, consumed in `src/lib/supabase.ts`.

## Risks & Migration Paths

- **Vendor lock-in to Supabase**: mitigated by using standard Postgres (not Firestore-style proprietary). Schema is portable; only the auth and Edge Function code would need rewriting if we migrated off.
- **Region locked to us-east-1**: changing region later requires `supabase db dump` → new project in target region → restore. Doable but disruptive after launch.
- **pg_cron + Edge Functions outgrows simple ingestion**: if the FPL ingestion grows to need long-running compute, queues, or third-party libraries Deno can't run, the worker can move to Fly.io / Railway / Render. The DB and auth stay where they are.
- **Local + Prod means broken merges hit real data**: mitigated by local testing (`supabase start` is a full local stack) and `supabase db push --dry-run` in pre-commit / PR checks. Adding staging later (see migration recipe) hedges this further.

## What This Issue Does NOT Include

- Auth schema, providers, or UI (#13 Google OAuth, #14 Apple, #15 email/password, #16 sign-up, #17 forgot password, #18 biometric)
- User / squad / fixture schema (#11)
- AsyncStorage persistence for theme/palette (#12)
- FPL data ingestion function or pg_cron job (#20)
- Replacing mock data with live API calls (#21)
- EAS Build env setup (Phase 5)

Each is its own follow-up issue.
