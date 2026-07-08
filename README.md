# Fantasy Gaffer

A mobile app for Fantasy Premier League (FPL) managers that goes beyond stats display and
tells you **what to actually do** — who to captain, who to bench, which transfer to make,
and when to play a chip — backed by an in-house expected-points model instead of just
re-displaying FPL's own numbers.

Built with Expo / React Native and a Supabase backend. Currently in **Phase 5 (launch
readiness)** — see [Product timeline](#product-timeline) below.

## Table of contents

- [What this is](#what-this-is)
- [Tech stack](#tech-stack)
- [Running it locally](#running-it-locally)
- [Testing](#testing)
- [End-to-end tests (Maestro)](#end-to-end-tests-maestro)
- [Architecture](#architecture)
- [Repo layout](#repo-layout)
- [Product timeline](#product-timeline)
- [Further reading](#further-reading)

## What this is

[Fantasy Premier League](https://fantasy.premierleague.com) has ~11M managers but its own
app/site only shows raw stats — it doesn't tell you what to do with them. Fantasy Gaffer is
a companion app that:

- **Reads** a manager's FPL team (by connecting an existing FPL Team ID — no FPL login
  required, since FPL has no public OAuth) and the wider public FPL dataset (players,
  fixtures, prices, ownership).
- **Computes an expected-points ("xPts") number per player**, using an in-house model
  trained on historical per-fixture data — this is the app's core differentiator over
  just re-displaying FPL's own `ep_next` estimate. See [xPts model](#the-xpts-model) below.
- **Turns that into advice**, not just numbers: optimal starting XI, captain/vice-captain
  (with a safe-vs-explosive ceiling call), bench order, ranked transfer suggestions on a
  3-gameweek horizon, and chip timing (Wildcard / Free Hit / Bench Boost / Triple Captain)
  aware of double/blank gameweeks.

**Today the app is read + advisory only.** It tells you what to do; it doesn't (yet) do it
for you — FPL has no public write API, so applying a transfer or setting a captain still
happens in the official FPL app. Write-back (Phase 6, below) is the planned next leg, once
a user connects their FPL account credentials through a dedicated auth flow.

The product is designed to grow beyond FPL to other fantasy football games later — "league"
is meant to become a first-class dimension of the data model rather than something baked
into the app's identity — but that's deliberately not built yet; FPL is the only supported
game today.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 54 / React Native 0.81 / React 19, [expo-router](https://docs.expo.dev/router/introduction/) v6 (file-based routing) |
| Language | TypeScript |
| Server state | [TanStack Query](https://tanstack.com/query) — the only layer that talks to Supabase/FPL; persisted to `AsyncStorage` for offline read access |
| Client state | [Zustand](https://zustand.docs.pmnd.rs) — small stores for auth, theme, biometric, team selection |
| Backend | [Supabase](https://supabase.com) — Postgres + Row Level Security for auth/data, Deno Edge Functions for custom server logic, `pg_cron` for scheduled ingestion jobs |
| Upstream data | The public [Fantasy Premier League API](https://fantasy.premierleague.com/api/bootstrap-static/) (no key required, no official docs — see `docs/fpl-api.md`) |
| Modeling | Python (`model/`) — quantile regression / simulation-based expected-points model, trained offline and served via a nightly Supabase Edge Function job |
| Analytics | [PostHog](https://posthog.com) (product analytics + feature flags) |
| Crash reporting | [Sentry](https://sentry.io) |
| Styling | Custom token-based theme system (`src/constants/theme.ts`) — no Tailwind/NativeWind |
| Testing | Jest (`jest-expo` preset) for unit/component tests, [Maestro](https://maestro.mobile.dev) for end-to-end flows |
| Native builds | [EAS Build](https://docs.expo.dev/eas/) — dev-client, preview, and production profiles |

## Running it locally

### Prerequisites

- **Node.js** (LTS) and npm.
- A [Supabase](https://supabase.com) project (free tier is fine), **or** the
  [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker Desktop if you want to run
  the whole backend locally instead of against a hosted project.
- For iOS: a Mac with **Xcode** and an iOS Simulator runtime installed.
- For Android: **Android Studio** with an emulator (AVD) configured, or a device with USB
  debugging enabled.
- To run on a physical device with all native features (push, biometrics, etc.): the
  [Expo Go](https://expo.dev/go) app for a quick start, or a custom **dev client** build
  (see below) for anything Expo Go can't do.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your Supabase
project's Settings → API page. Everything else in `.env.example` (PostHog key, Sentry DSN)
is optional — those integrations no-op cleanly when their key is unset, so you can develop
fully without them. These vars are only ever read in `app.config.ts` and forwarded through
Expo's `extra` field; see `docs/architecture.md` for why.

If you want a fully local backend instead of a hosted Supabase project:

```bash
supabase start   # boots local Postgres + Auth + Edge Functions in Docker
```

### 3. Start the app

```bash
npm start          # Expo dev server — scan the QR code with Expo Go, or press i/a/w
npm run ios        # launch directly in the iOS Simulator
npm run android    # launch directly in the Android emulator
npm run web        # launch in a browser
```

**Expo Go vs. a dev client:** most of the app runs fine in [Expo Go](https://expo.dev/go)
(the fastest way to iterate — just scan the QR code from `npm start`, on simulator or a
physical device on the same Wi‑Fi network). Some native modules (push notifications,
background fetch, Sentry native crash capture) **require a custom dev-client build** and
silently no-op or aren't testable in Expo Go. To build one:

```bash
npm install -g eas-cli
eas login
eas build --profile development-simulator --platform ios      # for the simulator
eas build --profile development --platform ios                # for a physical device
eas build --profile development --platform android
```

then run `npx expo start --dev-client` and open the resulting build instead of Expo Go.
`eas.json` also has `preview` and `production` profiles for internal-distribution and
store builds respectively.

> **Read the versioned Expo docs before writing Expo code in this repo:**
> https://docs.expo.dev/versions/v56.0.0/ — this SDK band changed meaningfully
> (`expo-router` v6, `expo-glass-effect`, `expo-symbols`, `@expo/ui` beta), so APIs from
> memory/older tutorials are frequently wrong here.

## Testing

```bash
npm test                                 # full Jest suite (jest-expo preset)
npx jest path/to/file.test.ts            # a single file
npx jest -t "test name substring"        # a single test by name
npx tsc --noEmit                         # type-check (Jest does NOT type-check)
npm run lint                             # expo lint
```

Tests only run from `**/__tests__/**/*.test.ts(x)` — `src/__tests__/` mirrors the `src/`
tree. If Jest hangs after you've run the Expo dev server, it's a Watchman recrawl artifact,
not a real hang: `watchman shutdown-server` then re-run with
`npx jest --watchman=false --runInBand --forceExit`.

## End-to-end tests (Maestro)

A hermetic Maestro suite drives the real compiled app against a **local** Supabase stack
and a **local** FPL fixture server — no live FPL API, no production data, fully offline
once set up. It exists because Jest + `tsc` have both missed real bugs that only surface
when the app boots against real storage and a real navigator.

**One-time setup** (see `docs/e2e.md` for full detail and troubleshooting):

```bash
brew install openjdk supabase/tap/supabase jq   # Maestro needs a real JDK
export JAVA_HOME="$(brew --prefix openjdk)"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
curl -Ls "https://get.maestro.mobile.dev" | bash
npm install -g eas-cli && eas login             # only needed once, to fetch the test app build
```

You'll also need Docker Desktop running and an iPhone 16-class simulator installed in Xcode.

**Run the whole suite:**

```bash
./e2e/run.sh
```

This resolves/downloads the dev-client test build, regenerates the fixture dataset, boots a
local Supabase stack + fixture server + Metro, launches the simulator, and runs all three
flows (sign-in → team advice, connect-team import, tab sweep + legal + relaunch persistence
+ sign-out). A clean run ends with `[e2e] GREEN — all flows passed`.

**Iterate on a single flow:**

```bash
./e2e/run.sh e2e/flows/signin-team.yaml
```

If another dev server is already holding port 8081, run beside it with
`E2E_METRO_PORT=8082 ./e2e/run.sh` — don't kill the other process.

## Architecture

```
┌─────────────────────┐      reads/writes       ┌───────────────────────────┐
│   Expo / React       │◄───────────────────────►│   Supabase (hosted)        │
│   Native app          │      (auth, profile)    │  - Postgres + RLS          │
│   (this repo)         │                         │  - Auth (email/Google)     │
│                        │                         │  - Edge Functions (Deno)  │
│  expo-router v6        │                         │  - pg_cron (nightly jobs) │
│  TanStack Query        │      reads (public,     └────────────┬──────────────┘
│  Zustand               │◄──────no auth)                       │ nightly ingest
└───────────┬────────────┘                                      ▼
            │                                          ┌───────────────────────┐
            ▼                                          │  Fantasy Premier League │
┌─────────────────────┐                                 │  public API (upstream) │
│  FPL public API       │◄───────────────────────────────┴───────────────────────┘
│  (bootstrap, fixtures,│
│  live scores, entry)  │           offline training / nightly serving
└─────────────────────┘           ┌───────────────────────────────────┐
                                    │  xPts model (model/, Python)       │
                                    │  → coefficient artifact committed  │
                                    │  → scored nightly by an Edge Fn    │
                                    │  → written to `projections` table  │
                                    └───────────────────────────────────┘
```

- **Routing** — `expo-router` v6, file-based under `src/app/`. Two route groups:
  `(onboarding)` (sign-in/sign-up/connect-team/reset) and `(home)` (post-auth tabs — team /
  top picks / transfers — plus player/profile/settings), gated by session + profile state.
- **Data layer** — TanStack Query owns all server state. There are exactly two HTTP egress
  points: `src/api/fpl-client.ts` (public FPL endpoints, with retry/backoff) and
  `src/lib/supabase.ts` (the Supabase client). Everything under `src/api/*` is a hook or
  fetch function — UI components never call Supabase or FPL directly. The whole query cache
  is persisted to `AsyncStorage` so the last-known team/data is available offline.
- **Client state** — a handful of narrow Zustand stores (`src/store/`) for things that
  aren't server data: auth session, theme, biometric preference, team selection.
- **Decision layer** — pure, fully unit-tested TypeScript modules (`src/utils/*Advice.ts`)
  that turn model output + squad state into advice: best XI/captain/bench
  (`gafferAdvice.ts`), transfer suggestions (`transferAdvice.ts`), and chip timing
  (`chipAdvice.ts`). No React, no I/O — easy to reason about and to extend.
- **The xPts model** — a from-scratch expected-points model (not a re-display of FPL's own
  `ep_next`), trained offline in Python (`model/`) against historical per-fixture data and
  validated with a walk-forward backtest. The committed coefficient artifact is scored
  nightly by a Supabase Edge Function (`supabase/functions/fpl-project/`) and written to a
  `projections` table the client reads via `useProjections()`. A from-scratch,
  simulation-based v2 architecture is under active research/backtesting in parallel
  (currently shadow-served, not yet promoted — see `docs/xpts-model.md` /
  `docs/xpts-prospective.md`).
- **Backend** — Supabase Postgres with Row Level Security for authorization, Deno Edge
  Functions for custom server logic (FPL ingestion, model serving), `pg_cron` for scheduled
  jobs. `supabase/migrations/` is the source of truth for schema — migrations are additive
  and never edited after being applied.
- **Observability** — PostHog (product analytics + feature flags) and Sentry (crash
  reporting) as disabled-without-a-key no-op singletons, so the app runs fully without
  either configured.

## Repo layout

```
fpl-gaffer-react-native-app/
├─ src/
│  ├─ app/            # expo-router file-based routes ((onboarding), (home), legal)
│  ├─ api/             # the only place Supabase/FPL HTTP calls happen; query hooks + keys
│  ├─ components/      # UI components
│  ├─ store/           # Zustand stores (auth, theme, biometric, team)
│  ├─ utils/           # decision-layer advice modules (captain/transfer/chip)
│  ├─ lib/              # Supabase client, analytics/monitoring/a11y egresses, query persister
│  ├─ constants/        # theming, brand tokens, club colors, jerseys
│  └─ __tests__/        # Jest suites, mirrors the src/ tree
├─ supabase/
│  ├─ migrations/       # schema source of truth (append-only)
│  ├─ functions/        # Deno Edge Functions (fpl-ingest, fpl-project, ping)
│  └─ scripts/          # local test/ingest harnesses
├─ model/                # Python offline toolchain for the xPts model (train/backtest/serve)
├─ e2e/                  # Maestro end-to-end suite (flows, fixture server, seeding)
├─ docs/                 # architecture, schema, auth flows, a11y, xPts results, this app's design docs
└─ app.config.ts         # Expo config; the only place EXPO_PUBLIC_* env vars are read
```

## Product timeline

Development has run in phases, tracked as GitHub issues on this repo:

| Phase | Scope | Status |
|---|---|---|
| 1 | Backend foundation, auth (email/password + Google), schema, live FPL data replacing mocks | ✅ Shipped |
| 2 | Core screens with real content — team view, player detail, squad import by Team ID, settings | ✅ Shipped |
| 3 | **Decision layer** — the xPts model v1, captain/best-XI/bench optimizer, transfer suggestions, chip advice, Top Picks ranking | ✅ Shipped |
| 4 | Monetization instrumentation & retention — PostHog analytics, background price refresh, offline read cache | ✅ Shipped (push notification *dispatcher* and live in-gameweek scoring held to pre/post-launch, see below) |
| 5 | **Launch readiness** (current phase) — crash reporting, privacy policy/terms, accessibility audit, Maestro E2E suite, onboarding, store listings | 🚧 In progress |
| 6 | **Write-back to FPL** — actually submitting transfers, captaincy, chips, and lineup changes to a user's real FPL team | 📋 Planned, not started |

**Within Phase 5**, most engineering work is done — crash reporting, legal content,
accessibility, and the E2E suite are all shipped. What's left is largely **gated on paid
developer accounts** (Apple Developer / Google Play) rather than code: production EAS
builds, store listings, and the RevenueCat paywall (deliberately placed *after* launch,
once usage data shows which advisory feature is the "aha" moment worth paywalling).

**Not yet started:** push notification delivery (client-side plumbing is built, the
dispatcher is held until push credentials are provisioned) and live in-gameweek score
updates (deferred post-launch — it's the heaviest and most season-dependent feature to
validate). **Phase 6** (writing changes back to FPL) is the biggest remaining piece of
scope — FPL has no public OAuth, so it needs its own credential-handling design before
work starts.

In parallel, the expected-points model has its own research track (**v2**, tracked in issue
#107): a from-scratch match-simulation architecture is being iteratively built and
backtested against the current model, currently shadow-serving in production for a live
comparison. It only replaces the current model if it wins a strict, pre-registered
promotion bar over several real gameweeks — see `docs/xpts-model.md` for the full history.

This table is a snapshot as of writing. GitHub issue state on this repo isn't always kept in
sync with what's actually merged (some shipped work is tracked on an issue left open for a
follow-up, or simply never closed) — `CLAUDE.md`'s per-phase sections are the most
up-to-date narrative of what's actually done.

## Further reading

- `docs/architecture.md` — backend stack rationale, environment setup, deploy flow
- `docs/schema.md` — database schema
- `docs/fpl-api.md` — notes on the upstream (undocumented) FPL API
- `docs/auth-*.md` — per-provider auth flow details (email/password, Google, biometric, account deletion)
- `docs/a11y.md` — accessibility conventions and manual validation checklist
- `docs/e2e.md` — full Maestro E2E runbook and troubleshooting
- `docs/xpts-model.md` / `docs/xpts-prospective.md` — expected-points model results and the v2 research arc
- `docs/pre-production-cleanup.md` — running list of dev-only shortcuts that need cleanup before public launch
- `CLAUDE.md` / `AGENTS.md` — day-to-day engineering conventions and gotchas for this repo
