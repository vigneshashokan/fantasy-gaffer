# Player Detail Screen — Real Content — Design

**Issue:** [#28 — [Phase 2] Player detail screen — real content](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/28)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-06-13

## Goal

Replace the placeholder `player/[name].tsx` (a kit, a name, and a 5-stat grid sourced only from the user's own squad) with a real, read-only player detail view that works for **any** player — opened from the Team pitch, the Transfer pitch, or Top Picks — and shows real season data pulled live from FPL.

## Reframing the issue

The issue body is an aspirational wishlist written before the data layer existed. Reconciled against what FPL actually exposes and the Phase 2/6 split:

- **Lookup is currently broken for the ACs.** The screen resolves players from `useSquad()` and matches by `name`. A Top Picks player (an explicit AC) is not in the squad, so it can't open. The fix is to look players up in the full pool (`usePlayers()`) keyed by **player id**, not name.
- **Impossible from FPL data — dropped:** `key passes` and `shots in box`. FPL's public API does not expose Opta event stats. They cannot be built and are removed.
- **Out by the Phase 2/6 reframe — excluded:** the **"Transfer in" CTA** drives transfers (#24), now Phase 6; the **Watchlist toggle** is a write feature needing its own table. Both are out of this screen.
- **Cut by the agreed scope (Lean MVP) — deferred:** season cumulative-points chart, price-history chart, the per-game `xG/xA/xGI/minutes/bonus` block, and the "better at the same price" comparison. Each is real but beyond "simple, only relevant data."

## Scope decisions (from brainstorming)

Ship the **Lean MVP** tier. Sections, in order:

1. **Hero** — kit, name, club, position, price, ownership. (from pool)
2. **Availability banner** — renders only when the player is genuinely flagged: `status !== 'a'`, or `chance_of_playing_next_round` is non-null **and `< 100`** (FPL sometimes tags fit players `chance = 100`, which must not surface a banner). Shows the FPL `news` string + chance. (from pool)
3. **Key-stats row** — Form, Total points, ePts (`ep_next`), ICT index, BPS. (from pool)
4. **Form sparkline** — last 5 gameweeks' points as a 5-bar mini-chart. (from `element-summary`)
5. **Fixture strip** — next 5 fixtures, opponent + H/A, each tinted by FPL difficulty (FDR). (from `element-summary`)

The hero/banner/stats come from the already-cached players pool and paint instantly. Sections 4–5 depend on a single new live fetch and load/fail independently of the rest of the screen.

## Non-goals

- **No new charting dependency.** Bars and FDR pills are plain Views. `react-native-svg` (already a dep) is not needed for this tier.
- **No write paths.** No watchlist table, no transfer-in, no captain/transfer mutations — read-only.
- **No ingest changes.** Everything is sourced from the existing `players`/`clubs` tables plus the live `element-summary` endpoint. We do **not** add `xG/xA/...` columns to the `players` table for this issue.
- **No heavier charts** (cumulative points, price history) and **no comparison list** — explicitly deferred above.

## Architecture

```
player/[id].tsx  (modal route)
   │
   ├── usePlayers()                ── cached pool (Supabase `players`)
   │     byId.get(id) → Player+    ── hero · availability · key stats     [instant]
   │
   ├── useClubs()                  ── team-id → ClubCode (opponent labels)
   │
   └── useElementSummary(id)       ── NEW · fplGet('/element-summary/{id}/')   [live]
         ├─ history[]   → last5    → <FormSparkline>
         └─ fixtures[]  → next5    → <FixtureStrip>  (difficulty → fdrColor)

render order:
   <PlayerHero> <AvailabilityBanner?> <KeyStatsRow>   ← pool, always present
   <FormSparkline> <FixtureStrip>                     ← summary; own skeleton / error / empty
```

## Routing & identity

Route renamed `player/[name].tsx` → `player/[id].tsx` (modal `Stack.Screen` in `(home)/_layout.tsx` updated; `typedRoutes` regenerates). The numeric FPL element id (stored as a `string` in our maps) becomes the route param.

The id must reach the navigation call sites, which today only have player view-models carrying `name`. Thread an `id: string` field through:

- **Types** (`src/types/fpl.ts`): add `id` to `PitchPlayer`, `TransferPitchPlayer`, `TopPickPlayer`.
- **Mappers**: `squad.ts` (`groupByPosition`, the bench `.map`, `groupTransferPitch` — all already iterate `SquadPlayer`, which has `id`); `players.ts` (`useTopPicks`, which maps from `Player`).
- **Call sites**: `team.tsx` and `transfer.tsx` push `{ pathname: '/(home)/player/[id]', params: { id: p.id } }`. `PicksCard` rows become pressable and navigate the same way (this is the previously-unwired Top Picks AC).

Why id, not name: the screen must call `element-summary` by numeric id regardless, and `web_name` is not collision-proof — resolving name→id in-screen could load the wrong player's history. Keying on id removes the ambiguity at the source.

## Data layer

**Extend the pool** (`src/api/players.ts`): add `status`, `news`, `chance_of_playing_next_round`, `ict_index`, `bps` to the Supabase `select`, to `PlayerRow`, to the `Player` type, and to `playersFromRows`. All five columns already exist in the `players` table — this is additive and low-risk. The detail screen reads its player from this cache by id (no extra round-trip; the pool is already loaded app-wide).

**New live fetch** (`src/api/playerSummary.ts`):
- `fetchPlayerSummary(id)` → `fplGet<ElementSummary>('/element-summary/${id}/')` (inherits timeout/retry/`FplFetchError` from `fpl-client`).
- `useElementSummary(id)` query, keyed by a new `queryKeys.elementSummary(id)`.
- Parsing helpers (pure, unit-tested): `last5FromHistory(history)` → up to 5 `{ round, points }` (latest rounds); `next5Fixtures(fixtures)` → up to 5 `{ event, isHome, opponentTeamId, difficulty }`.
- `expected_goals`/`expected_assists` etc. are present in the payload but ignored at this tier.

**Opponent resolution** (`src/api/clubs.ts`): `element-summary` fixtures reference clubs by **numeric team id**, but `useClubs()` currently keys by `ClubCode` and discards the numeric `id` (it is selected in `queryClubs` but dropped by `clubsFromRows`). Add an id-keyed accessor — a `clubCodeByTeamId: Record<number, ClubCode>` derived from the same query — so the FixtureStrip can turn an opponent team id into a club code + kit colours.

**FDR colouring** (new — none exists today): `fdrColor(difficulty: 1..5)` helper returning a dark-mode-aware `{ bg, text }` over a 5-band scale (2 easy / 1 neutral / 2 hard). Defined once (e.g. `src/constants/fdr.ts`) and unit-tested.

## Components (new, under `src/components/player/`)

Each is a small, presentational unit taking already-shaped props + the `apexTokens` theme object (matching the existing `components/team`, `components/picks` conventions):

- `PlayerHero` — kit + name + club + position pill + price + ownership.
- `AvailabilityBanner` — flagged-only; severity colour from `status`/`chance`.
- `KeyStatsRow` — reuses the existing `Stat` tile pattern; Form / Total / ePts / ICT / BPS.
- `FormSparkline` — 5 bars, height ∝ points (scaled to the max of the window); empty state "No appearances yet".
- `FixtureStrip` — 5 chips, opponent short code + `H`/`A`, tinted via `fdrColor`.

`player/[id].tsx` is the orchestrator: pool lookup + the two render paths. It owns no presentational styling beyond layout.

## States & error handling

- **Pool loading** → existing skeleton.
- **Id not in pool** → existing "not found" card (kept).
- **Summary loading** → skeletons on the sparkline + fixture strip only; hero/stats already visible.
- **Summary error** (`FplFetchError`) → inline row "Couldn't load recent form & fixtures · Retry" (re-runs the query); the rest of the screen stays usable.
- **Empty history** (new signing, no minutes) → sparkline shows "No appearances yet"; fixture strip still renders.

## Testing (TDD)

- **Pure utils** (`src/__tests__/utils/`): `last5FromHistory`, `next5Fixtures`, `fdrColor`, and an `availabilityState(status, chance)` helper (drives banner show/hide + severity).
- **API** (`src/__tests__/api/playerSummary.test.ts`): parse a representative `element-summary` JSON fixture into the last-5 / next-5 shapes.
- **Screen** (`src/__tests__/playerDetailScreen.test.tsx`, mirroring `settingsScreen.test.tsx`): renders with mocked pool + summary; asserts the five sections, banner show/hide, not-found, and the summary-error inline state.
- **Wiring**: Top Picks / Transfer / Team navigate with `id` (assert the `router.push` param shape).

## Acceptance criteria (revised — replaces #28's original list)

- [ ] Tapping any player on the **Transfer** pitch opens the detail view (by id).
- [ ] Tapping any player on the **Team** pitch opens the detail view (by id).
- [ ] Tapping a player in **Top Picks** opens the detail view (by id).
- [ ] Hero, availability banner, and key-stats row render from the players pool.
- [ ] Form sparkline and next-5 FDR fixture strip render from real `element-summary` data.
- [ ] Loading, summary-error, not-found, and empty-history states all degrade gracefully.

*(The original "all charts render" item is satisfied by the form sparkline; cumulative/price charts, the xG/xA block, comparison, transfer-in CTA, and watchlist are out of scope per the reframe above.)*

## Files touched

**New:** `src/api/playerSummary.ts` · `src/components/player/{PlayerHero,AvailabilityBanner,KeyStatsRow,FormSparkline,FixtureStrip}.tsx` · `src/constants/fdr.ts` · tests under `src/__tests__/{,api/,utils/}`.

**Modified:** `src/app/(home)/player/[name].tsx` → renamed `[id].tsx` (rewritten) · `src/app/(home)/_layout.tsx` (Stack.Screen name) · `src/api/players.ts` (pool fields + `useTopPicks` id) · `src/api/squad.ts` (id in mappers) · `src/api/clubs.ts` (team-id→code map) · `src/api/queryKeys.ts` (`elementSummary`) · `src/types/fpl.ts` (`Player` fields; `id` on three view-models) · `src/app/(home)/(tabs)/{team,transfer}.tsx` (pass id) · `src/components/picks/PicksCard.tsx` (pressable rows → navigate).
