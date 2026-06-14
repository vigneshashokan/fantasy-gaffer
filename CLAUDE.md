# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The `@AGENTS.md` import above is load-bearing: **read https://docs.expo.dev/versions/v56.0.0/ before writing any Expo code.** APIs in this SDK band changed meaningfully (`expo-router` v6, `expo-glass-effect`, `expo-symbols`, `@expo/ui` beta) — don't write from memory.

FPL Gaffer is an Expo / React Native (SDK 54, RN 0.81, React 19) app backed by Supabase, wrapping the public Fantasy Premier League API.

## Commands

```bash
npm start                 # expo start (dev server)
npm run ios | android | web
npm run lint              # expo lint
npm test                  # jest (jest-expo preset)
npx jest path/to/file.test.ts      # single file
npx jest -t "name substring"       # single test by name
```

Tests are only collected from `**/__tests__/**/*.test.ts(x)` (see `testMatch` in `package.json`) — a `*.test.ts` outside an `__tests__/` dir is silently ignored. `src/__tests__/` mirrors the `src/` tree.

Supabase (local stack + edge functions in `supabase/`):

```bash
supabase start                          # local Postgres/Auth/Functions in Docker
supabase db push                        # apply migrations to linked project
supabase functions deploy fpl-ingest    # or: ping
./supabase/scripts/test-ingest-locally.sh
```

CI (`.github/workflows/deploy-supabase.yml`) runs `db push` + deploys both functions on merge to `main`, path-filtered to `supabase/**`, so UI-only PRs don't spend CI minutes.

## Architecture (the parts that span files)

- **Routing** — `expo-router` v6, file-based under `src/app/`. `src/app/index.tsx` redirects on `authStore.session` to either `(onboarding)` or `(home)/(tabs)/team`. Two route groups: `(onboarding)` (signin/signup/connect-team/reset flows) and `(home)` (post-auth tabs: team / top-picks / transfer, plus player/profile/settings). `typedRoutes` and `reactCompiler` are both enabled experiments in `app.config.ts` — **React Compiler is on, so don't hand-roll `useMemo`/`useCallback`/`React.memo` for memoization** unless profiling proves it's needed.

- **Auth gating** — `src/lib/useProfileGate.ts` resolves a session into one of `loading | pending_deletion | missing | complete` (checks `profiles` + `account_deletions` tables; `pending_deletion` wins). Onboarding routes branch on this status. `src/app/_layout.tsx` holds the splash screen until fonts **and** auth/theme stores have hydrated, and wraps the tree in `QueryClientProvider`, `SafeAreaProvider`, `AuthErrorBoundary`, and `AuthCacheClear`.

- **Data layer** — TanStack Query owns all server state. The two HTTP egress points are the only places network calls happen:
  - `src/api/fpl-client.ts` — `fplGet()` wraps the public FPL API with timeout + retry (4xx never retried, 5xx backs off; throws `FplFetchError`). Swapping in a future `fpl-proxy` Edge Function only changes the base URL here.
  - `src/lib/supabase.ts` — the `@supabase/supabase-js` singleton (AsyncStorage-backed session).
  - Everything in `src/api/*` is a hook or fetch fn; UI never calls Supabase/FPL directly. **Cache keys live only in `src/api/queryKeys.ts` — never hand-roll a key array**, or invalidation breaks. FPL player ids are strings in our maps (`byId.get(String(pick.element))`); the "squad" is `/entry/{id}/event/{gw}/picks/` joined against `usePlayers()`.

- **Client state** — Zustand stores in `src/store/` (`auth`, `biometric`, `team`, `theme`), persisted via AsyncStorage. Keep them narrow: anything server-derived belongs in React Query, not a store.

- **Theming** — there is **no Tailwind/NativeWind** here (the lone `src/global.css` only declares web font variables). Styling runs off a custom token system: `src/constants/theme.ts` defines a `Theme` shape and three palettes (`classic | pitch | electric`), selected via `themeStore`. Companion tokens in `constants/apexTokens.ts`, `clubColors.ts`, `jerseys.ts`. Fonts are Archivo (display) + JetBrains Mono, loaded at the root layout.

- **Env vars** — `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are read **only** in `app.config.ts`, which forwards them into Expo's `extra`. App code reads them via `Constants.expoConfig?.extra?.*` (see `src/lib/supabase.ts`). Reading `process.env.EXPO_PUBLIC_*` from app code yields `undefined` at runtime. Copy `.env.example` → `.env` for local dev.

- **Backend** — Supabase Postgres + RLS for authz, Deno Edge Functions for server logic, `pg_cron` for the FPL ingest. `supabase/migrations/` is the source of truth — **never edit an applied migration; add a new timestamped one.** `supabase/functions/**` is a separate Deno toolchain: it's excluded from `tsconfig.json` and ignored by Jest — don't run repo TS/lint/test tooling against it. Cron-driven ingest needs secrets seeded once per environment via `vault.create_secret` (the exact SQL is in `docs/architecture.md`).

- **Path aliases** — `@/*` → `src/*`, `@/assets/*` → `assets/*` (in `tsconfig.json`, mirrored in the Jest `moduleNameMapper`).

## Docs worth reading before non-trivial work

- `docs/architecture.md` — stack rationale, env/Vault setup, deploy flow
- `docs/schema.md` — DB schema · `docs/fpl-api.md` — upstream FPL API notes
- `docs/auth-*.md` — per-provider auth flows (email/password, Google, biometric, account deletion)
