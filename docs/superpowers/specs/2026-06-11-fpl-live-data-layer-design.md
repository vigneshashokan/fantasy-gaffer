# FPL Live Data Layer — Design

**Issue:** [#21 — Replace mock data with live API](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/21)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-06-11

## Goal

Delete `src/constants/data.ts` as a source of UI data. All five tabs read live data through hooks: reference data from Supabase (`clubs`, `players`, `fixtures`, `profiles`), and user-specific game state from the public FPL endpoints (`/entry/{id}/`, `/entry/{id}/event/{gw}/picks/`, `/entry/{id}/history/`), all cached client-side via TanStack Query.

This makes good on the architectural doctrine from `docs/schema.md` L8 — we are an "extended view" of FPL, not a parallel ledger — and unblocks #22 (squad import), which writes only `profiles.fpl_team_id` and lets this layer read the rest.

## Non-goals

- **No new tables.** No `squads`, `chips_state`, `manager_history`, etc. The DB stays at four tables (`clubs`, `players`, `fixtures`, `profiles`) plus the auth/notification rows.
- **No mutations.** Squad-import writes are #22. Live scoring is #37.
- **No Gaffer recommendation engine.** Captain picks, transfer suggestions, and sub tips were hand-written copy in the mock. The hooks return empty arrays for these fields; the UI surfaces an honest "no tips yet" empty state. The engine is a separate feature.
- **No offline persistence.** TanStack persistence to AsyncStorage is offline-shaped work, owned by #39.
- **No `fpl-proxy` Edge Function.** Direct client calls now. A proxy is a follow-up if FPL adds rate limits or geo-blocks. We are explicit about this trade-off in the FPL access section.

## Architecture

```
                  ┌────────────────────────┐
                  │  React Native screens  │
                  │  (no data.ts imports)  │
                  └────────────┬───────────┘
                               │
                               ▼ hooks (usePlayers, useSquad, …)
                  ┌────────────────────────┐
                  │   TanStack QueryCache  │  ← in-memory, stale-while-revalidate
                  └─────┬─────────────┬────┘
                        │             │
        DB-backed       │             │  user-state (live FPL)
        (clubs/players/ │             │  /entry/{id}/, /event/{gw}/picks/,
         fixtures/      │             │  /history/
         profiles)      │             │
                        ▼             ▼
            ┌──────────────────┐  ┌──────────────────┐
            │  supabase-js     │  │  fpl-client.ts   │
            │  (already exists)│  │  (fetch + retry) │
            └──────────────────┘  └──────────────────┘
                        │             │
                        ▼             ▼
                    Supabase     fantasy.premierleague.com/api
```

**Invariants:**
- Hook = the single render contract. Each hook returns the same UI-oriented shape today's screens consume (`Player`, `TopPickPlayer`, `TeamInfo`, etc.). Mapping from raw DB/FPL shapes happens **inside** the resource file (`src/api/*.ts`), so screens stay ignorant of the source.
- `QueryClientProvider` mounts in `src/app/_layout.tsx`, wrapping the existing tree. One cache, app-wide.
- No new DB tables (schema.md L8).

## FPL access pattern: hybrid (direct now, proxy when needed)

For user-specific endpoints (`/entry/{id}/...`), the React Native client calls `fantasy.premierleague.com` directly. The endpoints are unauthenticated and CORS-permissive, so no Edge Function is required in this PR.

This adds one risk: if FPL ever adds rate limits or geo-blocks, we'd have to retrofit a proxy. The mitigation is to keep all FPL traffic behind a single `fpl-client.ts` module — when the proxy lands, only its base URL changes.

Reference data (`clubs`, `players`, `fixtures`) goes through Supabase as today; no FPL traffic from the client for those.

## Resource map

Each hook returns a UI-shaped value. The "source" column shows where it reads from; the mapping logic lives in the corresponding `src/api/*.ts` file.

| Hook | Source | Returns | Notes |
|---|---|---|---|
| `useClubs()` | Supabase `clubs` | `Record<ClubCode, Club>` | Replaces `CLUBS`. Adapter joins `short_name → ClubCode`. Kit hex colors come from `src/constants/clubColors.ts` (design-time, not fetched). |
| `usePlayers()` | Supabase `players` + `clubs` | `Player[]` | Foundation for derivations. Mapping: `now_cost / 10 → p`, `parseFloat(form) → f`, `total_points → tp`, `parseFloat(selected_by_percent) → own`, `parseFloat(ep_next) → gw`. |
| `useTopPicks()` | derived from `usePlayers()` | `Record<Position, TopPickPlayer[]>` | Client-side: group by `position`, sort by `ep_next desc`, slice top 8 per position. No extra fetch. |
| `useCurrentGameweek()` | FPL `bootstrap-static.events` | `number` | The current event id. Cached for an hour; used as the default gameweek by squad/fixtures hooks. |
| `useFixturesByGw(gw)` | Supabase `fixtures` | `Partial<Record<ClubCode, Fixture>>` | Replaces `FIXTURES`. Default `gw = useCurrentGameweek()`. |
| `useProfile()` | Supabase `profiles` | `Profile` and `fpl_team_id: number \| null` | Replaces `PROFILE`. Consumers branch on `fpl_team_id === null` for the empty-state UX. |
| `useManager()` | FPL `/entry/{id}/` | `TeamInfo` | Replaces `TEAM_INFO`. `enabled: fpl_team_id != null`. |
| `useSquad()` | FPL `/entry/{id}/event/{currentGw}/picks/` + `usePlayers()` | `{ starters: Player[]; bench: Player[] }` | Replaces `SQUAD`. Joins picks → player rows. `enabled: fpl_team_id != null`. |
| `useApexTeam()` | composition of `useSquad`, `useManager`, `useFixturesByGw` | shape of `APEX_TEAM` **minus Gaffer fields** | Replaces `APEX_TEAM`. Live fields populated from FPL: `teamName`, `gw`, `gwPts`, `totalPoints`, `pitch`, `bench`, `captainApplied`, `transfer.{freeTransfers,squadValue,inBank,nextGw,deadline,captain,pitch}`. Empty by design: `avgPoints`, `highestPoints` (FPL doesn't expose), `captainPicks`, `suggestions`, `transfer.transferSuggestions`, `transfer.chips[].tip` (these belong to the Gaffer engine, owned by a future ticket). UI shows empty-state cards where these were. |
| `useChips()` | FPL `/entry/{id}/history/.chips` | `Chip[]` and `TransferChip[]` | Replaces `CHIPS` and `transfer.chips`. Played-week derived from history. |

Derived hooks (`useTopPicks`, `useApexTeam`) sit entirely in front of the cache — they `useQuery` their dependencies and compute, no extra fetch. Consumers don't know they're composed.

## Module layout (`src/api/`)

```
src/api/
  fpl-client.ts        FPL public-API fetch wrapper: base URL, JSON parsing,
                       timeout, retry with backoff.
  queryKeys.ts         The single key factory (see below).
  players.ts           queryPlayers + usePlayers + useTopPicks
  fixtures.ts          queryFixtures + useFixturesByGw + useCurrentGameweek
  clubs.ts             queryClubs + useClubs
  manager.ts           queryManager + useManager + useChips + useTeamInfo
  squad.ts             querySquad + useSquad + useApexTeam
  profile.ts           queryProfile + useProfile

src/types/fpl.ts       All shape types (Player, Position, ClubCode, Club,
                       TopPickPlayer, Chip, Fixture, PitchPlayer,
                       TransferPitchPlayer, CaptainPick, Suggestion,
                       TransferSuggestion, TransferChip, TeamInfo, Profile).
                       Moved out of src/constants/data.ts.

src/constants/clubColors.ts
                       Design-time kit color table only (the existing `CLUBS`
                       hex map). Renamed from data.ts.
```

Co-locating query function + hook per resource matches the codebase's existing style (e.g. `src/lib/auth/email.ts`) and keeps each file under ~150 lines. Eight small files instead of double that count split across `api/queries/` and `hooks/`.

## Query keys and caching policy

### Query key factory (`src/api/queryKeys.ts`)

```ts
export const queryKeys = {
  clubs:        ['clubs'] as const,
  players:      ['players'] as const,
  fixtures:     (gw: number)       => ['fixtures', gw] as const,
  currentGw:    ['currentGw'] as const,
  profile:      (userId: string)   => ['profile', userId] as const,
  manager:      (teamId: number)   => ['manager', teamId] as const,
  squad:        (teamId: number, gw: number) => ['squad', teamId, gw] as const,
  chips:        (teamId: number)   => ['chips', teamId] as const,
};
```

One file, one place to invalidate. Derived hooks don't get their own keys.

### Stale / GC times

| Resource | `staleTime` | `gcTime` | Reasoning |
|---|---|---|---|
| `clubs`, `players`, `fixtures` | 10 min | 30 min | DB-backed; ingestion runs ≤ 2×/day. Refetch on screen mount after 10 min idle is plenty fresh. |
| `currentGw` | 1 hour | 1 hour | Almost-static within a session. |
| `profile` | `Infinity` | session | Mutated only by the user in-app; we invalidate on mutation. |
| `manager`, `chips`, `squad` | **15 min** | **30 min** | Conservative pre-launch; the season is over and this is for testing. Tighten before go-live (see follow-up issue). |

**Refetch triggers (foreground only):** A query refetches when (1) a component mounts and the cache entry is stale, or (2) the device reconnects to the network and the entry is stale. There is **no timer-based polling** — `refetchInterval` is unset. We also set `refetchOnWindowFocus: false` and do not wire `focusManager` to `AppState`, so backgrounding the RN app does not refetch anything. Idle = zero traffic.

**Defaults set on the `QueryClient`:**
- `retry: 2`
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: true`

**Expected FPL traffic per ~5-min user session:** ≈ 3 calls (one each to `useManager`, `useChips`, `useSquad`), assuming all three screens are visited. Idle sessions and background time produce zero FPL traffic.

## Error handling

Three failure modes, three behaviors.

1. **Supabase auth failure (401 from session expiry).** A top-level effect in `_layout.tsx` watches the `QueryCache` for supabase-js 401s. On detection: call `supabase.auth.refreshSession()` once. If that also fails, `supabase.auth.signOut()` (existing `useProfileGate` then routes to `/(onboarding)`). This satisfies the issue's "Auth failures route back to /(onboarding)" criterion.
2. **FPL fetch failure (timeout, 5xx, network).** `fpl-client.ts` retries twice with exponential backoff. On final failure, the hook surfaces `error`. Screens render an inline "couldn't reach FPL" card with a retry button. Never routes away — FPL outages are not auth problems.
3. **Empty / missing data** (e.g. `fpl_team_id === null`). Treated as a valid state, **not** an error. Team and Transfer tabs render an empty card with a "Link your FPL team" CTA. The CTA is non-functional in #21; #22 wires it to the import flow.

## Loading UX

Skeletons, not spinners. One new primitive:

```
src/components/ui/Skeleton.tsx
```

A height-keyed shimmer placeholder. Used by each card that depends on a `pending` hook. Spinners on cards we already styled read as "broken"; skeletons read as "loading."

## Screen and component edits

Today's grep shows 19 imports of `@/constants/data` across screens, components, and tests. They split into two flavors:

### Type-only imports (10 files, mechanical)

`ApexPitch.tsx`, `Pitch.tsx`, `PlayerToken.tsx`, `Kit.tsx`, `PicksCard.tsx`, `TransferPitch.tsx`, `TransferSuggestionsCard.tsx`, `ChipsRow.tsx`, `CaptainPickCard.tsx`, `ApexDugout.tsx`, `SuggestionsCard.tsx`, `xpts.ts`, and `__tests__/components.test.tsx` — change import path from `@/constants/data` to `@/types/fpl`. No logic change.

### Value imports (5 files, real work)

| File | From | To |
|---|---|---|
| `app/(home)/(tabs)/team.tsx` | `APEX_TEAM` | `useApexTeam()` → skeleton / empty / error / data. Empty when `fpl_team_id == null`. |
| `app/(home)/(tabs)/transfer.tsx` | `APEX_TEAM` | `useApexTeam()` (same hook, different slice). |
| `app/(home)/(tabs)/top-picks.tsx` | `TOP_PICKS`, `TEAM_INFO` | `useTopPicks()`, `useCurrentGameweek()` (only `TEAM_INFO.gw` is used here — no manager fetch needed, so the screen still renders fully for users without a linked team). |
| `app/(home)/profile.tsx` | `PROFILE` | `useProfile()`. |
| `app/(home)/player/[name].tsx` | `APEX_TEAM`, `CLUBS` | `useSquad()` (find the matching player) + `useClubs()`. |
| `components/picks/PickRow.tsx` | `FIXTURES`, `SQUAD` | **Prop-drill** `fixtures` and `squad` from `top-picks.tsx`. Don't hook in the leaf. |

The `PickRow` decision is a targeted improvement that comes with this work: leaf components shouldn't reach into global mock data, and they shouldn't reach into the query cache either. Hooks live at the screen level; leaves take props. This is the right place to fix the smell — the file is already being touched.

## `_layout.tsx` changes

```tsx
const queryClient = useMemo(
  () => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  }),
  [],
);

// auth-error sweep
useEffect(() => {
  return queryClient.getQueryCache().subscribe((event) => {
    const err = event.query.state.error as { status?: number } | null;
    if (err?.status === 401) handleSupabaseAuthFailure();
  });
}, [queryClient]);

return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider …>
      {/* existing tree */}
    </ThemeProvider>
  </QueryClientProvider>
);
```

`useMemo` so reanimated hot-reload doesn't blow away the cache.

## Testing strategy

### Existing 103 tests

| Category | Count | Treatment |
|---|---|---|
| Pure-logic (`xpts`, `apexTokens`, `theme`, `data`) | ~30 | Keep. Move test fixtures from `data.ts` to `src/__tests__/fixtures/`. |
| Auth + store (`authStore`, `biometricStore`, `useProfileGate`, supabase, auth screens) | ~40 | No change. They don't touch `@/constants/data`. |
| Screen rendering (`profileScreen`, `settingsScreen`, `signinScreen`, etc.) | ~30 | Wrap renders in `<QueryClientProvider>` via a new helper. Mock hooks at the `@/api/*` module boundary; return canned data for loading / success / error / empty states. |

### New test helpers

```
src/__tests__/fixtures/
  players.ts       canned Player[] (carved from today's mock)
  squad.ts         canned SQUAD shape
  topPicks.ts      canned TOP_PICKS shape
  apexTeam.ts      canned APEX_TEAM (sans Gaffer fields)
  manager.ts       canned TeamInfo

src/__tests__/utils/
  renderWithProviders.tsx
                   mounts QueryClientProvider with a fresh client per test
```

### New tests

| File | Coverage |
|---|---|
| `src/api/fpl-client.test.ts` | Base URL, JSON parsing, 5xx → retry, timeout, network error. Mock `fetch`. |
| `src/api/players.test.ts` | Adapter: `now_cost / 10`, `parseFloat(form)`, etc. against frozen DB-shape input. |
| `src/api/manager.test.ts` | Adapter from `/entry/{id}/` JSON → `TeamInfo`. |
| `src/api/squad.test.ts` | Joining picks → player rows; captain / vice flags carry through. |
| `team.test.tsx`, `transfer.test.tsx` | "no fpl_team_id → empty CTA", "pending → skeleton", "FPL error → retry card". |

We do **not** add network-touching integration tests in this PR. FPL outages would flake CI; adapter tests against frozen fixtures get the same correctness signal.

## Acceptance criteria mapping

| Issue #21 criterion | How this design satisfies it |
|---|---|
| All five tabs render without using `data.ts` constants | Hooks at screen level, leaves take props. Post-PR `grep "from '@/constants/data'"` returns zero hits. |
| Loading states show skeleton / spinner instead of empty layouts | `<Skeleton />` primitive in `src/components/ui/`, used by each card on `pending`. |
| Auth failures route back to `/(onboarding)` | `QueryCache` subscriber in `_layout.tsx` watches for supabase-js 401; refresh → fail → sign out (existing `useProfileGate` path). |
| All 103 tests updated or replaced with mocked-API equivalents | Per the table above. New total around 115 (+12 for adapter coverage). |

## File inventory

**Added:**
- `src/api/fpl-client.ts`, `queryKeys.ts`, `players.ts`, `fixtures.ts`, `clubs.ts`, `manager.ts`, `squad.ts`, `profile.ts`
- `src/types/fpl.ts`
- `src/components/ui/Skeleton.tsx`
- `src/__tests__/utils/renderWithProviders.tsx`
- `src/__tests__/fixtures/{players,squad,topPicks,apexTeam,manager}.ts`
- `src/api/{fpl-client,players,manager,squad}.test.ts`

**Modified:**
- `src/app/_layout.tsx` (+QueryClientProvider, +auth-error effect)
- 5 screen files, ~10 component files (import path swaps + hook adoption)
- Most screen test files (wrap in `renderWithProviders`, mock `@/api/*`)
- `package.json` (+`@tanstack/react-query`)

**Removed:**
- All non-type exports from `src/constants/data.ts`.

**Renamed:**
- `src/constants/data.ts` → `src/constants/clubColors.ts` (kit color map only).

## Follow-up issues to file after this PR

- **Pre-launch FPL cadence tuning.** Revisit `staleTime` and `gcTime` for `useManager`, `useSquad`, `useChips` before the 2026/27 season starts (2026-08-15). Current 15-min values are conservative for off-season testing.
- **Gaffer recommendation engine.** Wire up `captainPicks`, `suggestions`, `transferSuggestions`, and chip tips. Probably overlaps with #30.
- **`fpl-proxy` Edge Function.** Only if FPL adds rate limits or geo-blocks. Spec describes the single `fpl-client.ts` swap point.
