# FPL Squad Import — Design

**Issue:** [#22 — Squad import from existing FPL Team ID](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/22)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-06-12

## Goal

Let a returning FPL player link their existing FPL team ID so the app can render their live squad. Concretely: write `profiles.fpl_team_id`. Everything else flows automatically — `useProfile()` refetches, `useApexTeam()` flips `noTeam → false`, and the Team / Transfer tabs render live data the next time they mount.

This unblocks the empty-state CTA that #21 left in place and removes the only thing currently holding new users at an empty home tab.

## Non-goals

- **No `squads` table.** The original ticket says "persists 15-player squad + bench order + captain/vice to our DB" — that wording predates `docs/schema.md` L8 ("we deliberately do not persist FPL game state"). #21 wired `useSquad()` to fetch live from FPL; #22 just enables it by setting the team ID.
- **No `useProfileGate` extension.** The gate stays at profile-row existence. A user who quits mid-flow re-opens at `/team` with the CTA, identically to a user who tapped Skip. One predictable failure mode.
- **No new mutations beyond the one `profiles.fpl_team_id` UPDATE.**
- **No manual-team builder.** That's #23. Skip routes to `/team`; when #23 ships, the LinkTeamCta gains a second affordance.
- **No telemetry hooks.** Owned by #41.

## Architecture

```
                ┌──────────────────────┐
                │  Complete Profile    │  (existing)
                └─────────┬────────────┘
                          │ onSubmit → router.replace
                          ▼
              ┌──────────────────────────────┐
              │  /(onboarding)/connect-team  │  ← NEW
              │  state: idle | validating |  │
              │   invalid | fetch_error |    │
              │   confirming | linking |     │
              │   link_error                 │
              └──┬───────────────────────┬───┘
                 │                       │
       Skip / Wrong team                Link team
                 │                       │
                 ▼                       ▼
        ┌────────────────────────────────────┐
        │  Mutation: UPDATE profiles SET     │
        │  fpl_team_id = … WHERE user_id = … │
        │  (skip path: no-op)                │
        └───────────────────┬────────────────┘
                            │ on success: invalidate ['profile', 'current']
                            ▼
                ┌──────────────────────┐
                │  /(home)/(tabs)/team │
                └──────────────────────┘

Also reachable: LinkTeamCta (Team / Transfer tabs)
              → router.push('/(onboarding)/connect-team')
              → same screen, same state machine
```

**Invariants:**
- **One route, two entry points.** Both onboarding (from `complete-profile.tsx`) and in-app (from `LinkTeamCta`) push the same `/(onboarding)/connect-team` route.
- **Skip is route-level, not mutation-level.** Tapping Skip just routes to `/team` without touching the DB.
- **Single screen, two states.** Input and confirm live in the same screen file with a local state machine; "Wrong team" returns to the input view without unmounting.

## UX

### Input view (`idle` state)

Layout follows the "Collapsed help link" mockup approved during brainstorming: title, single numeric field, a `Where do I find my team ID?` link that opens a bottom sheet, then **Continue** (disabled until the input matches `/^\d{1,10}$/`) and **Skip for now**. Numeric keyboard, max length 10 (FPL IDs are ~8 digits today; 10 is conservative headroom). Input is formatted with thin spaces for readability (`1 234 567`) but stored as digits only.

### Confirm view (`confirming` state)

Layout follows the "C identity-first + full 15-player pitch" mockup:

1. **Heading:** "Is this you?"
2. **Hero card:** purple gradient. Team name (`entry.name`) on top, manager name (`player_first_name + player_last_name`) under it, then three stats — Rank, Total pts, Captain — laid out horizontally.
3. **"Your XI" label** (small uppercase).
4. **4-3-3 pitch:** four rows (FWD / MID / DEF / GKP) of club-colored discs with the player's club code on the disc and `web_name` below. Captain ringed in gold. Vice gets a small "V" badge. Visual vocabulary matches the existing `<ApexPitch />`.
5. **Bench strip:** four smaller discs in a separate card, slightly muted.
6. **Buttons:** **Yes, link team** (primary purple) and **Wrong team — go back** (ghost).

The confirm-view components are deliberately separate from the live `ApexPitch` and `HeroCard` — preview data is sparser (no points, no fixtures) and forcing the live components to handle that would muddy them.

### Error views

| State | UX |
|---|---|
| `invalid` (FPL 404) | Inline error under the field: "We couldn't find a team with that ID." Continue re-enabled. |
| `invalid` (other 4xx) | Same shape, copy: "That doesn't look like a valid FPL team ID." |
| `fetch_error` (5xx / network / timeout) | Inline retry card "Couldn't reach FPL — Try again". Original input preserved. |
| `link_error` (Supabase update failed) | Toast "Couldn't save — try again." Confirm view stays mounted, button re-enabled. 401s are caught by the existing `AuthErrorBoundary` from #21. |

### Pre-season behavior

If `/entry/{id}/` succeeds but `/event/{currentGw}/picks/` fails for any reason (e.g. FPL hasn't published picks for the current GW yet during a season switch), the failure falls into the standard `fetch_error` state with the same generic "Couldn't reach FPL — Try again" copy. Specialized pre-season messaging would require pre-season detection logic that we don't have — defer until real users hit it.

## Module layout

```
src/app/(onboarding)/connect-team.tsx          Screen + state machine
src/components/connect-team/TeamIdInput.tsx    Numeric field, help link, error display
src/components/connect-team/TeamHelpSheet.tsx  Bottom sheet: 3 lines explaining where the ID lives
src/components/connect-team/ConfirmHero.tsx    Gradient card with team name + manager + stats
src/components/connect-team/ConfirmPitch.tsx   4-3-3 pitch + bench preview (lightweight Preview shape)
src/api/teamPreview.ts                         useTeamPreview hook + composePreview adapter
src/api/linkTeam.ts                            useLinkTeam mutation
```

Co-locating the connect-team component family in `src/components/connect-team/` mirrors the existing `team/`, `transfer/`, `picks/` folder pattern.

## Local state machine

```ts
type State =
  | { kind: 'idle';        teamId: string }
  | { kind: 'validating';  teamId: string }
  | { kind: 'invalid';     teamId: string; reason: string }
  | { kind: 'fetch_error'; teamId: string }
  | { kind: 'confirming';  teamId: number; preview: Preview }
  | { kind: 'linking';     teamId: number; preview: Preview }
  | { kind: 'link_error';  teamId: number; preview: Preview };

interface Preview {
  teamName: string;
  managerName: string;
  rank: number;
  totalPoints: number;
  captainName: string;
  starters: PreviewPlayer[];   // 11, position-ordered
  bench: PreviewPlayer[];      // 4
}

interface PreviewPlayer {
  name: string;
  club: ClubCode;
  capt?: boolean;
  vice?: boolean;
}
```

Body rendering by state:

| State | Renders |
|---|---|
| `idle` | `<TeamIdInput />`, help link, **Continue** (disabled until `/^\d{1,10}$/`), **Skip for now** |
| `validating` | `<TeamIdInput disabled />`, **Continue** replaced with spinner |
| `invalid` | `<TeamIdInput error={reason} />`, **Continue** re-enabled |
| `fetch_error` | `<TeamIdInput />`, inline retry card |
| `confirming` | `<ConfirmHero />` + `<ConfirmPitch />` + **Yes, link team** + **Wrong team — go back** |
| `linking` | Confirm view with spinner on **Yes** |
| `link_error` | Confirm view with toast + button re-enabled |

## Hooks

### `useTeamPreview(teamId: number | null)`

Composed read-only query in `src/api/teamPreview.ts`. Fetches `/entry/{teamId}/` and `/entry/{teamId}/event/{currentGw}/picks/` in parallel, joins picks against `usePlayers()` for names and clubs, returns `Preview`.

```ts
function useTeamPreview(teamId: number | null) {
  const players = usePlayers();
  const currentGw = useCurrentGameweek();

  return useQuery<Preview, FplFetchError>({
    queryKey: ['teamPreview', teamId, currentGw.data],
    queryFn: async () => {
      const [entry, picks] = await Promise.all([
        fplGet<FplEntry>(`/entry/${teamId}/`),
        fplGet<PicksResponse>(`/entry/${teamId}/event/${currentGw.data}/picks/`),
      ]);
      return composePreview(entry, picks, players.data ?? []);
    },
    enabled: teamId != null && currentGw.data != null && Array.isArray(players.data),
    retry: false,    // user-driven retry only
    staleTime: 0,    // every Continue tap is a fresh validation
    gcTime: 0,
  });
}
```

`retry: false` and `staleTime: 0` are deliberate — failed validations should not be cached or silently retried; each Continue tap should be observably fresh.

### `useLinkTeam()`

Single mutation in `src/api/linkTeam.ts`. UPDATEs `profiles.fpl_team_id` for the current user; on success invalidates the profile cache key so `useProfile()` refetches.

```ts
function useLinkTeam() {
  const qc = useQueryClient();
  return useMutation<void, PostgrestError, { teamId: number }>({
    mutationFn: async ({ teamId }) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user?.id;
      if (!userId) throw new Error('No authenticated user');

      const { error } = await supabase
        .from('profiles')
        .update({ fpl_team_id: teamId, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile('current') });
    },
  });
}
```

The mutation does **not** also invalidate `squad`, `manager`, or `chips` keys. Those queries are gated on `fplTeamId`; once `profile` updates they automatically `enabled: true` and fetch fresh. One invalidation, correct cascading.

### Status-code mapping (read in the screen)

| Hook state | Screen state |
|---|---|
| `isLoading` | `validating` |
| `isSuccess` | `confirming` |
| `isError && error.status === 404` | `invalid` ("We couldn't find a team with that ID.") |
| `isError && error.status >= 400 && < 500` | `invalid` ("That doesn't look like a valid FPL team ID.") |
| `isError && (no status \|\| status >= 500)` | `fetch_error` |

## Schema

`profiles.fpl_team_id` already exists per `supabase/migrations/20260607000000_initial_schema.sql` (nullable `integer`). The "update own row" RLS policy lets the authenticated user write it directly. **No SQL migration in this PR.**

## Testing strategy

| File | Coverage |
|---|---|
| `src/__tests__/api/teamPreview.test.tsx` | `composePreview` adapter: maps `FplEntry` + `PicksResponse` + `Player[]` → `Preview`. Captain/vice flags carry through. Players missing from the lookup are dropped silently. Hook test: 404 → `isError` with `status: 404`. |
| `src/__tests__/api/linkTeam.test.tsx` | Mutation: success writes `fpl_team_id`, fires `invalidateQueries(['profile', 'current'])`. Mocked supabase. Failure surfaces a `PostgrestError`. |
| `src/__tests__/connectTeamScreen.test.tsx` | State-machine transitions: input validation gate (button disabled until digits), tap Continue with valid input (hook mocked) → confirm view rendered. Tap "Wrong team" → back to input. Skip → `router.replace` to `/team`. |
| `src/__tests__/components/teamHelpSheet.test.tsx` | Renders three help lines. Trivial. |

Use `renderWithProviders` from #21. Mock `@/api/teamPreview` and `@/api/linkTeam` at the screen-test boundary.

## Acceptance-criteria mapping

| Issue #22 criterion | How this design satisfies it |
|---|---|
| Valid team ID → squad imported and visible on My Team tab | `useLinkTeam` writes `fpl_team_id`; `useProfile` refetches; `useApexTeam` flips `noTeam → false`; Team tab renders live data. |
| Invalid team ID → friendly error | `invalid` state with copy varying by 4xx subcode. |
| Can be skipped → routes to /team (deferred manual builder is #23) | Skip button calls `router.replace('/(home)/(tabs)/team')`. The `LinkTeamCta` remains the way back in for users who skipped. |

## File inventory

**Added:**
- `src/app/(onboarding)/connect-team.tsx`
- `src/components/connect-team/{TeamIdInput,TeamHelpSheet,ConfirmHero,ConfirmPitch}.tsx`
- `src/api/teamPreview.ts`, `src/api/linkTeam.ts`
- `src/__tests__/api/{teamPreview,linkTeam}.test.tsx`
- `src/__tests__/connectTeamScreen.test.tsx`
- `src/__tests__/components/teamHelpSheet.test.tsx`

**Modified:**
- `src/components/team/LinkTeamCta.tsx` — button becomes functional, `router.push('/(onboarding)/connect-team')`; copy drops the "Coming in #22" reference
- `src/app/(onboarding)/complete-profile.tsx` — `onSubmit` routes to `/(onboarding)/connect-team` (currently routes straight to `/(home)/(tabs)/team`)

## Follow-up issues

- #23 — Manual squad builder (gives Skip a second meaningful destination).
- Pre-season-aware error copy (detect "season hasn't started" and surface specific messaging on the connect-team error states) — revisit after the first season rollover if real users hit the generic copy.
