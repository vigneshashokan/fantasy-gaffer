# Player Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `player/[name].tsx` with a real, read-only player detail screen that works for any player (Team pitch, Transfer pitch, Top Picks) and shows real season data.

**Architecture:** Route by player **id**. Hero / availability banner / key-stats come instantly from the cached `usePlayers()` pool (extended with 5 columns we already ingest). A single new live `element-summary` fetch powers a last-5-GW form sparkline and a next-5 FDR fixture strip, each loading/failing independently. No charting library — bars and FDR pills are plain Views.

**Tech Stack:** Expo / React Native (SDK 54, RN 0.81, React 19), expo-router v6 (`typedRoutes`), TanStack Query, Supabase, Jest (jest-expo) + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-06-13-player-detail-design.md`

**Conventions:** React Compiler is on — no manual `useMemo`/`useCallback`/`memo`. Cache keys live only in `src/api/queryKeys.ts`. Every commit ends with the trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

Run a single test file with `npx jest path/to/file.test.tsx`. Tests are only collected under `src/__tests__/**`.

---

## File Structure

**New files**
- `src/constants/fdr.ts` — `fdrColor(difficulty, dark)` + 5-band palette.
- `src/utils/availability.ts` — `availabilityState(status, chanceNext)`.
- `src/api/playerSummary.ts` — `ElementSummary` types, `last5FromHistory`, `next5Fixtures`, `fetchPlayerSummary`, `useElementSummary`.
- `src/components/player/{PlayerHero,AvailabilityBanner,KeyStatsRow,FormSparkline,FixtureStrip}.tsx` — presentational units.
- Tests: `src/__tests__/fdr.test.ts`, `src/__tests__/availability.test.ts`, `src/__tests__/api/playerSummary.test.tsx`, `src/__tests__/api/clubsByTeamId.test.tsx`, `src/__tests__/playerDetailScreen.test.tsx`, `src/__tests__/pickRowNav.test.tsx`.

**Modified files**
- `src/types/fpl.ts` — extend `Player`; add `id` to `PitchPlayer`, `TransferPitchPlayer`, `TopPickPlayer`.
- `src/api/players.ts` — pool select/type/mapper; `id` in `useTopPicks`.
- `src/api/squad.ts` — `id` in pitch mappers.
- `src/api/clubs.ts` — `clubCodeByTeamIdFromRows` + `useClubCodeByTeamId`.
- `src/api/queryKeys.ts` — `elementSummary`, `clubsByTeamId`.
- `src/app/(home)/player/[name].tsx` → renamed `[id].tsx`, rewritten.
- `src/app/(home)/_layout.tsx` — `Stack.Screen name="player/[id]"`.
- `src/app/(home)/(tabs)/{team,transfer}.tsx` — navigate by id.
- `src/components/picks/PickRow.tsx` — pressable row → navigate by id.
- `src/__tests__/api/players.test.tsx`, `src/__tests__/api/squad.test.tsx` — fixture updates.

---

## Task 1: FDR colour helper

**Files:**
- Create: `src/constants/fdr.ts`
- Test: `src/__tests__/fdr.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/fdr.test.ts
import { fdrColor } from '@/constants/fdr';

describe('fdrColor', () => {
  it('returns the easy band for difficulty 2 in light mode', () => {
    expect(fdrColor(2, false)).toEqual({ bg: '#4FC07E', text: '#06281A' });
  });
  it('returns the very-hard band for difficulty 5 in dark mode', () => {
    expect(fdrColor(5, true)).toEqual({ bg: '#7A1031', text: '#FFE3EA' });
  });
  it('clamps out-of-range difficulty into 1..5', () => {
    expect(fdrColor(0, false)).toEqual(fdrColor(1, false));
    expect(fdrColor(9, false)).toEqual(fdrColor(5, false));
  });
  it('rounds fractional difficulty', () => {
    expect(fdrColor(3.4, false)).toEqual(fdrColor(3, false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/fdr.test.ts`
Expected: FAIL — cannot find module `@/constants/fdr`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/constants/fdr.ts
//
// Fixture Difficulty Rating colour scale. FPL difficulty is 1..5:
// 1-2 easy (green), 3 neutral (grey), 4-5 hard (red). Tuned for legible
// text on each band in both light and dark mode.

export interface FdrColor {
  bg: string;
  text: string;
}

const LIGHT: Record<1 | 2 | 3 | 4 | 5, FdrColor> = {
  1: { bg: '#1A8A4F', text: '#FFFFFF' },
  2: { bg: '#4FC07E', text: '#06281A' },
  3: { bg: '#D8DAE3', text: '#2A2F3D' },
  4: { bg: '#FF5274', text: '#FFFFFF' },
  5: { bg: '#8E1338', text: '#FFFFFF' },
};

const DARK: Record<1 | 2 | 3 | 4 | 5, FdrColor> = {
  1: { bg: '#12653A', text: '#EAFBF1' },
  2: { bg: '#2E9D62', text: '#EAFBF1' },
  3: { bg: '#2A3145', text: '#C7CEE0' },
  4: { bg: '#C9344F', text: '#FFFFFF' },
  5: { bg: '#7A1031', text: '#FFE3EA' },
};

export function fdrColor(difficulty: number, dark: boolean): FdrColor {
  const clamped = Math.min(5, Math.max(1, Math.round(difficulty))) as 1 | 2 | 3 | 4 | 5;
  return (dark ? DARK : LIGHT)[clamped];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/fdr.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/constants/fdr.ts src/__tests__/fdr.test.ts
git commit -m "feat(player-detail): FDR colour helper"
```

---

## Task 2: Availability helper

**Files:**
- Create: `src/utils/availability.ts`
- Test: `src/__tests__/availability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/availability.test.ts
import { availabilityState } from '@/utils/availability';

describe('availabilityState', () => {
  it('returns null for a fully available player', () => {
    expect(availabilityState('a', null)).toBeNull();
  });
  it('returns null when FPL tags a fit player chance=100', () => {
    expect(availabilityState('a', 100)).toBeNull();
  });
  it('flags an injured player as out', () => {
    expect(availabilityState('i', 0)).toEqual({ severity: 'out' });
  });
  it('flags a suspended player as out', () => {
    expect(availabilityState('s', null)).toEqual({ severity: 'out' });
  });
  it('flags a doubtful player as doubt', () => {
    expect(availabilityState('d', 75)).toEqual({ severity: 'doubt' });
  });
  it('flags an available player with a sub-100 chance as doubt', () => {
    expect(availabilityState('a', 50)).toEqual({ severity: 'doubt' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/availability.test.ts`
Expected: FAIL — cannot find module `@/utils/availability`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/availability.ts
//
// Maps FPL player availability into a banner state, or null when the
// player is fully fit. status: 'a' available · 'd' doubt · 'i' injured ·
// 's' suspended · 'u' unavailable · 'n' not in squad. chanceNext is
// 0..100 or null (null = no concern flagged).

export type AvailabilitySeverity = 'out' | 'doubt';

export interface AvailabilityState {
  severity: AvailabilitySeverity;
}

export function availabilityState(
  status: string,
  chanceNext: number | null,
): AvailabilityState | null {
  const flaggedByStatus = status !== 'a';
  const flaggedByChance = chanceNext != null && chanceNext < 100;
  if (!flaggedByStatus && !flaggedByChance) return null;
  const out = status === 'i' || status === 's' || status === 'u' || status === 'n';
  return { severity: out ? 'out' : 'doubt' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/availability.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/availability.ts src/__tests__/availability.test.ts
git commit -m "feat(player-detail): availability state helper"
```

---

## Task 3: element-summary data layer (parse + fetch + hook)

**Files:**
- Modify: `src/api/queryKeys.ts`
- Create: `src/api/playerSummary.ts`
- Test: `src/__tests__/api/playerSummary.test.tsx`

- [ ] **Step 1: Add the query key**

In `src/api/queryKeys.ts`, inside the `queryKeys` object, add after the `squad:` line:

```ts
  elementSummary: (id: string) => ['elementSummary', id] as const,
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/__tests__/api/playerSummary.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  last5FromHistory,
  next5Fixtures,
  useElementSummary,
} from '@/api/playerSummary';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
import { fplGet } from '@/api/fpl-client';

beforeEach(() => jest.clearAllMocks());

describe('last5FromHistory', () => {
  it('returns the last 5 rounds ascending as {round, points}', () => {
    const history = [
      { round: 1, total_points: 2 },
      { round: 2, total_points: 7 },
      { round: 3, total_points: 0 },
      { round: 4, total_points: 12 },
      { round: 5, total_points: 5 },
      { round: 6, total_points: 9 },
    ];
    expect(last5FromHistory(history)).toEqual([
      { round: 2, points: 7 },
      { round: 3, points: 0 },
      { round: 4, points: 12 },
      { round: 5, points: 5 },
      { round: 6, points: 9 },
    ]);
  });
  it('handles fewer than 5 rounds', () => {
    expect(last5FromHistory([{ round: 1, total_points: 3 }])).toEqual([
      { round: 1, points: 3 },
    ]);
  });
});

describe('next5Fixtures', () => {
  it('maps up to 5 fixtures, resolving opponent by home/away', () => {
    const fixtures = [
      { event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 },
      { event: 8, is_home: false, team_h: 4, team_a: 13, difficulty: 4 },
    ];
    expect(next5Fixtures(fixtures)).toEqual([
      { event: 7, isHome: true, opponentTeamId: 1, difficulty: 2 },
      { event: 8, isHome: false, opponentTeamId: 4, difficulty: 4 },
    ]);
  });
});

describe('useElementSummary', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={makeTestQueryClient()}>{children}</QueryClientProvider>
  );
  it('fetches element-summary for the id', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({ history: [], fixtures: [] });
    const { result } = renderHook(() => useElementSummary('401'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/element-summary/401/');
  });
  it('stays idle when id is undefined', () => {
    const { result } = renderHook(() => useElementSummary(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/api/playerSummary.test.tsx`
Expected: FAIL — cannot find module `@/api/playerSummary`.

- [ ] **Step 4: Write the implementation**

```ts
// src/api/playerSummary.ts
//
// Lazy per-player history + upcoming fixtures from the public FPL
// /element-summary/{id}/ endpoint. history[] drives the form sparkline;
// fixtures[] drives the next-5 FDR strip. Other fields in the payload
// (expected_goals, etc.) are intentionally ignored at this tier.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';

export interface SummaryHistoryRow {
  round: number;
  total_points: number;
}
export interface SummaryFixtureRow {
  event: number | null;
  is_home: boolean;
  team_h: number;
  team_a: number;
  difficulty: number;
}
export interface ElementSummary {
  history: SummaryHistoryRow[];
  fixtures: SummaryFixtureRow[];
}

export interface FormPoint {
  round: number;
  points: number;
}
export interface NextFixture {
  event: number | null;
  isHome: boolean;
  opponentTeamId: number;
  difficulty: number;
}

export function last5FromHistory(history: SummaryHistoryRow[]): FormPoint[] {
  return [...history]
    .sort((a, b) => a.round - b.round)
    .slice(-5)
    .map((h) => ({ round: h.round, points: h.total_points }));
}

export function next5Fixtures(fixtures: SummaryFixtureRow[]): NextFixture[] {
  return fixtures.slice(0, 5).map((f) => ({
    event: f.event,
    isHome: f.is_home,
    opponentTeamId: f.is_home ? f.team_a : f.team_h,
    difficulty: f.difficulty,
  }));
}

export function fetchPlayerSummary(id: string): Promise<ElementSummary> {
  return fplGet<ElementSummary>(`/element-summary/${id}/`);
}

export function useElementSummary(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.elementSummary(id ?? ''),
    queryFn: () => fetchPlayerSummary(id as string),
    enabled: !!id,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/api/playerSummary.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/playerSummary.ts src/api/queryKeys.ts src/__tests__/api/playerSummary.test.tsx
git commit -m "feat(player-detail): element-summary fetch + parse helpers"
```

---

## Task 4: clubs team-id → code map

**Files:**
- Modify: `src/api/queryKeys.ts`, `src/api/clubs.ts`
- Test: `src/__tests__/api/clubsByTeamId.test.tsx`

- [ ] **Step 1: Add the query key**

In `src/api/queryKeys.ts`, add to the object:

```ts
  clubsByTeamId:  ['clubsByTeamId'] as const,
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/__tests__/api/clubsByTeamId.test.tsx
import { clubCodeByTeamIdFromRows } from '@/api/clubs';

describe('clubCodeByTeamIdFromRows', () => {
  it('maps numeric team id to club code, dropping unknown codes', () => {
    const rows = [
      { id: 1, short_name: 'ARS', name: 'Arsenal' },
      { id: 13, short_name: 'MCI', name: 'Man City' },
      { id: 99, short_name: 'ZZZ', name: 'Not Real' },
    ];
    expect(clubCodeByTeamIdFromRows(rows)).toEqual({ 1: 'ARS', 13: 'MCI' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/__tests__/api/clubsByTeamId.test.tsx`
Expected: FAIL — `clubCodeByTeamIdFromRows` is not exported.

- [ ] **Step 4: Implement in `src/api/clubs.ts`**

Add these two exports at the end of the file (the `ClubRow` interface and `KNOWN_CODES` already exist above):

```ts
export function clubCodeByTeamIdFromRows(rows: ClubRow[]): Record<number, ClubCode> {
  const out: Record<number, ClubCode> = {};
  for (const row of rows) {
    if (!KNOWN_CODES.has(row.short_name)) continue;
    out[row.id] = row.short_name as ClubCode;
  }
  return out;
}

export function useClubCodeByTeamId() {
  return useQuery({
    queryKey: queryKeys.clubsByTeamId,
    queryFn: async () => {
      const { data, error } = await supabase.from('clubs').select('id, short_name, name');
      if (error) throw error;
      return clubCodeByTeamIdFromRows((data ?? []) as ClubRow[]);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/api/clubsByTeamId.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/api/clubs.ts src/api/queryKeys.ts src/__tests__/api/clubsByTeamId.test.tsx
git commit -m "feat(player-detail): team-id to club-code map"
```

---

## Task 5: Extend the players pool (Player type + usePlayers)

**Files:**
- Modify: `src/types/fpl.ts:20-34` (`Player`), `src/api/players.ts`
- Test: `src/__tests__/api/players.test.tsx`, `src/__tests__/api/squad.test.tsx`

- [ ] **Step 1: Update the failing test (players.test.tsx)**

In `src/__tests__/api/players.test.tsx`, replace `FIXTURE_ROWS` (lines 13-24) with:

```tsx
const FIXTURE_ROWS = [
  {
    id: 401, web_name: 'Haaland', team_id: 13,
    position: 'FWD', now_cost: 142, form: '8.4',
    total_points: 175, selected_by_percent: '62.3', ep_next: '9.1',
    status: 'a', news: '', chance_of_playing_next_round: null,
    ict_index: '312.4', bps: 640,
  },
  {
    id: 233, web_name: 'Saka', team_id: 1,
    position: 'MID', now_cost: 92, form: '6.1',
    total_points: 131, selected_by_percent: '38.6', ep_next: '7.2',
    status: 'a', news: '', chance_of_playing_next_round: null,
    ict_index: '288.1', bps: 510,
  },
];
```

And replace the Haaland `toEqual` (lines 32-42) with:

```tsx
    expect(result[0]).toEqual({
      id: '401',
      name: 'Haaland',
      pos: 'FWD',
      club: 'MCI',
      p: 14.2,
      f: 8.4,
      tp: 175,
      own: 62.3,
      gw: 9.1,
      status: 'a',
      news: '',
      chanceNext: null,
      ict: 312.4,
      bps: 640,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/api/players.test.tsx`
Expected: FAIL — received object is missing `status/news/chanceNext/ict/bps`.

- [ ] **Step 3: Extend the `Player` type**

In `src/types/fpl.ts`, change the `Player` interface (lines 20-34) to add five fields before the optional flags:

```ts
export interface Player {
  id: string;
  name: string;
  pos: Position;
  club: ClubCode;
  p: number;
  f: number;
  tp: number;
  own: number;
  gw: number;
  status: string;
  news: string;
  chanceNext: number | null;
  ict: number;
  bps: number;
  capt?: boolean;
  vice?: boolean;
  sub?: number;
  subIn?: number;
}
```

- [ ] **Step 4: Extend the query + mapper in `src/api/players.ts`**

Add the columns to `PlayerRow`:

```ts
interface PlayerRow {
  id: number;
  web_name: string;
  team_id: number;
  position: Position;
  now_cost: number;
  form: string;
  total_points: number;
  selected_by_percent: string;
  ep_next: string;
  status: string;
  news: string;
  chance_of_playing_next_round: number | null;
  ict_index: string;
  bps: number;
}
```

In `playersFromRows`, add the five fields to the pushed object:

```ts
    out.push({
      id: String(row.id),
      name: row.web_name,
      pos: row.position,
      club: code as ClubCode,
      p: row.now_cost / 10,
      f: safeFloat(row.form),
      tp: row.total_points,
      own: safeFloat(row.selected_by_percent),
      gw: safeFloat(row.ep_next),
      status: row.status,
      news: row.news,
      chanceNext: row.chance_of_playing_next_round,
      ict: safeFloat(row.ict_index),
      bps: row.bps,
    });
```

In `queryPlayers`, extend the `players` select string:

```ts
    supabase.from('players').select(
      'id, web_name, team_id, position, now_cost, form, total_points, selected_by_percent, ep_next, status, news, chance_of_playing_next_round, ict_index, bps',
    ),
```

- [ ] **Step 5: Fix the squad.test fixture for type-cleanliness**

In `src/__tests__/api/squad.test.tsx`, replace the `PLAYERS_FIXTURE` block with the extended literals (runtime passes already; this keeps `tsc` clean):

```tsx
const PLAYERS_FIXTURE: Player[] = [
  { id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1, status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640 },
  { id: '233', name: 'Saka',    pos: 'MID', club: 'ARS', p: 9.2,  f: 6.1, tp: 131, own: 38.6, gw: 7.2, status: 'a', news: '', chanceNext: null, ict: 288.1, bps: 510 },
  { id: '100', name: 'Sub',     pos: 'DEF', club: 'CHE', p: 4.0,  f: 4.0, tp: 30,  own: 1.0,  gw: 2.0, status: 'a', news: '', chanceNext: null, ict: 40.0,  bps: 90 },
];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/api/players.test.tsx src/__tests__/api/squad.test.tsx`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add src/types/fpl.ts src/api/players.ts src/__tests__/api/players.test.tsx src/__tests__/api/squad.test.tsx
git commit -m "feat(player-detail): surface status/news/chance/ict/bps in players pool"
```

---

## Task 6: Thread `id` through pitch + top-pick view-models

**Files:**
- Modify: `src/types/fpl.ts` (`PitchPlayer`, `TransferPitchPlayer`, `TopPickPlayer`), `src/api/squad.ts`, `src/api/players.ts`

This is an additive, type-only change (nothing consumes the new `id` yet); existing tests stay green and verify nothing regressed.

- [ ] **Step 1: Add `id` to the three view-model types**

In `src/types/fpl.ts`, add `id: string;` as the first field of each:

```ts
export interface TopPickPlayer {
  id: string;
  name: string;
  club: ClubCode;
  p: number;
  f: number;
  tp: number;
  own: number;
  gw: number;
}
```
```ts
export interface PitchPlayer {
  id: string;
  name: string;
  pts: number | null;
  club?: ClubCode;
  capt?: boolean;
  ball?: boolean;
  sub?: number;
  subIn?: number;
  cards?: Array<'yellow' | 'red'>;
  gk?: boolean;
  alert?: boolean;
}
```
```ts
export interface TransferPitchPlayer {
  id: string;
  name: string;
  p: number;
  pos: Position;
  club: ClubCode;
  tp: number;
  f: number;
  own: number;
  gw: number;
  capt?: boolean;
}
```

- [ ] **Step 2: Populate `id` in the squad.ts mappers**

In `src/api/squad.ts`:

- `groupByPosition` (the `.map((p): PitchPlayer => ({ ... }))`): add `id: p.id,` as the first property.
- The bench map in `buildApexTeam` (`squad.bench.map((p): PitchPlayer => ({ ... }))`): add `id: p.id,` as the first property.
- `groupTransferPitch` (the `.map((p): TransferPitchPlayer => ({ ... }))`): add `id: p.id,` as the first property.

For example `groupByPosition` becomes:

```ts
      .map((p): PitchPlayer => ({
        id: p.id, name: p.name, pts: ptsFor(p, liveById), capt: p.capt, gk: pos === 'GKP', club: p.club,
      })),
```

- [ ] **Step 3: Populate `id` in useTopPicks**

In `src/api/players.ts`, `useTopPicks`, change the pushed object to include `id`:

```ts
      buckets[p.pos].push({
        id: p.id, name: p.name, club: p.club, p: p.p, f: p.f, tp: p.tp, own: p.own, gw: p.gw,
      });
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx jest src/__tests__/api/squad.test.tsx src/__tests__/api/players.test.tsx`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/types/fpl.ts src/api/squad.ts src/api/players.ts
git commit -m "feat(player-detail): thread player id through pitch + top-pick view-models"
```

---

## Task 7: Presentational components

**Files:**
- Create: `src/components/player/PlayerHero.tsx`, `AvailabilityBanner.tsx`, `KeyStatsRow.tsx`, `FormSparkline.tsx`, `FixtureStrip.tsx`

No standalone tests — these are exercised end-to-end by the screen test in Task 8. Each file compiles against types defined in earlier tasks.

- [ ] **Step 1: PlayerHero**

```tsx
// src/components/player/PlayerHero.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode, Position } from '@/types/fpl';
import { Kit } from '@/components/ui/Kit';

interface Props {
  name: string;
  club: ClubCode;
  clubName: string;
  pos: Position;
  price: number;
  ownership: number;
  tk: ApexTokens;
}

export function PlayerHero({ name, club, clubName, pos, price, ownership, tk }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Kit club={club} size={72} playerName={name} />
      <Text style={[styles.name, { color: tk.text }]}>{name}</Text>
      <Text style={[styles.club, { color: tk.faint }]}>{clubName} · {pos}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: tk.text }]}>£{price.toFixed(1)}m</Text>
        <Text style={[styles.meta, { color: tk.faint }]}>{ownership.toFixed(1)}% owned</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  name: { fontFamily: 'Archivo_900Black', fontSize: 26, letterSpacing: -0.78, marginTop: 12 },
  club: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  meta: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
```

- [ ] **Step 2: AvailabilityBanner**

```tsx
// src/components/player/AvailabilityBanner.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import { availabilityState } from '@/utils/availability';

interface Props {
  status: string;
  news: string;
  chanceNext: number | null;
  tk: ApexTokens;
}

export function AvailabilityBanner({ status, news, chanceNext, tk }: Props) {
  const state = availabilityState(status, chanceNext);
  if (!state) return null;
  const bg = state.severity === 'out' ? tk.pinkSoft : tk.yellowSoft;
  const fg = state.severity === 'out' ? tk.pink : tk.yellow;
  const headline =
    chanceNext != null ? `${chanceNext}% to play` : state.severity === 'out' ? 'Unavailable' : 'Doubtful';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={[styles.headline, { color: fg }]}>{headline}</Text>
      {!!news && <Text style={[styles.news, { color: tk.text }]}>{news}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  headline: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13, letterSpacing: 0.3 },
  news: { fontFamily: 'Archivo_500Medium', fontSize: 13 },
});
```

- [ ] **Step 3: KeyStatsRow**

```tsx
// src/components/player/KeyStatsRow.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';

interface Props {
  form: number;
  total: number;
  ep: number;
  ict: number;
  bps: number;
  tk: ApexTokens;
}

export function KeyStatsRow({ form, total, ep, ict, bps, tk }: Props) {
  const stats = [
    { label: 'Form', value: form.toFixed(1) },
    { label: 'Total', value: String(total) },
    { label: 'ePts', value: ep.toFixed(1) },
    { label: 'ICT', value: ict.toFixed(1) },
    { label: 'BPS', value: String(bps) },
  ];
  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.tile, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
          <Text style={[styles.label, { color: tk.faint }]}>{s.label}</Text>
          <Text style={[styles.value, { color: tk.text }]}>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  tile: { flexGrow: 1, flexBasis: '30%', borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  label: { fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', marginBottom: 4 },
  value: { fontFamily: 'Archivo_800ExtraBold', fontSize: 18 },
});
```

- [ ] **Step 4: FormSparkline**

```tsx
// src/components/player/FormSparkline.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { FormPoint } from '@/api/playerSummary';

const MAX_H = 48;

interface Props {
  points: FormPoint[];
  tk: ApexTokens;
}

export function FormSparkline({ points, tk }: Props) {
  if (points.length === 0) {
    return <Text style={[styles.empty, { color: tk.faint }]}>No appearances yet</Text>;
  }
  const max = Math.max(1, ...points.map((p) => p.points));
  return (
    <View style={styles.wrap}>
      {points.map((p) => {
        const h = Math.max(3, (Math.max(0, p.points) / max) * MAX_H);
        return (
          <View key={p.round} style={styles.col}>
            <Text style={[styles.val, { color: tk.text }]}>{p.points}</Text>
            <View style={[styles.bar, { height: h, backgroundColor: tk.green }]} />
            <Text style={[styles.round, { color: tk.faint }]}>GW{p.round}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, height: MAX_H + 44 },
  col: { alignItems: 'center', gap: 4 },
  val: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  bar: { width: 28, borderRadius: 6 },
  round: { fontFamily: 'Archivo_500Medium', fontSize: 11 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 12 },
});
```

- [ ] **Step 5: FixtureStrip**

```tsx
// src/components/player/FixtureStrip.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { NextFixture } from '@/api/playerSummary';
import { fdrColor } from '@/constants/fdr';

interface Props {
  fixtures: NextFixture[];
  codeByTeamId: Record<number, ClubCode>;
  dark: boolean;
  tk: ApexTokens;
}

export function FixtureStrip({ fixtures, codeByTeamId, dark, tk }: Props) {
  if (fixtures.length === 0) {
    return <Text style={[styles.empty, { color: tk.faint }]}>No upcoming fixtures</Text>;
  }
  return (
    <View style={styles.wrap}>
      {fixtures.map((f, i) => {
        const c = fdrColor(f.difficulty, dark);
        const opp = codeByTeamId[f.opponentTeamId] ?? '—';
        return (
          <View key={`${f.event}-${i}`} style={[styles.chip, { backgroundColor: c.bg }]}>
            <Text style={[styles.opp, { color: c.text }]}>{opp}</Text>
            <Text style={[styles.ha, { color: c.text }]}>{f.isHome ? 'H' : 'A'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  opp: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13, letterSpacing: 0.3 },
  ha: { fontFamily: 'Archivo_600SemiBold', fontSize: 10, opacity: 0.85 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 12 },
});
```

- [ ] **Step 6: Verify components compile**

Run: `npx tsc --noEmit`
Expected: no errors in `src/components/player/*`. (Pre-existing unrelated errors, if any, are out of scope — the five new files must be clean.)

- [ ] **Step 7: Commit**

```bash
git add src/components/player
git commit -m "feat(player-detail): presentational components"
```

---

## Task 8: Rewrite the screen + wire id-based routing end to end

**Files:**
- Rename: `src/app/(home)/player/[name].tsx` → `src/app/(home)/player/[id].tsx` (rewritten)
- Modify: `src/app/(home)/_layout.tsx:22`, `src/app/(home)/(tabs)/team.tsx:114-119`, `src/app/(home)/(tabs)/transfer.tsx` (`openPlayer`), `src/components/picks/PickRow.tsx`
- Test: `src/__tests__/playerDetailScreen.test.tsx`, `src/__tests__/pickRowNav.test.tsx`

- [ ] **Step 1: Write the failing screen test**

```tsx
// src/__tests__/playerDetailScreen.test.tsx
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './utils/renderWithProviders';

const mockBack = jest.fn();
let mockParams: { id?: string } = { id: '401' };

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('@/components/ui/Kit', () => ({ __esModule: true, Kit: () => null }));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));

const PLAYER = {
  id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI',
  p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
  status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640,
};
let mockPlayers: { data: unknown; isPending: boolean } = { data: [PLAYER], isPending: false };
jest.mock('@/api/players', () => ({ __esModule: true, usePlayers: () => mockPlayers }));
jest.mock('@/api/clubs', () => ({
  __esModule: true,
  useClubs: () => ({ data: { MCI: { name: 'Man City', kit: '#fff', kit2: '#fff', ink: '#000' } } }),
  useClubCodeByTeamId: () => ({ data: { 1: 'ARS', 13: 'MCI' } }),
}));

let mockSummary: {
  isPending: boolean; isError: boolean; refetch: jest.Mock; data: unknown;
};
jest.mock('@/api/playerSummary', () => {
  const actual = jest.requireActual('@/api/playerSummary');
  return { __esModule: true, ...actual, useElementSummary: () => mockSummary };
});

import PlayerDetail from '@/app/(home)/player/[id]';

const freshSummary = () => ({
  isPending: false,
  isError: false,
  refetch: jest.fn(),
  data: {
    history: [
      { round: 4, total_points: 8 },
      { round: 5, total_points: 12 },
    ],
    fixtures: [{ event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 }],
  },
});

describe('Player detail screen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockParams = { id: '401' };
    mockPlayers = { data: [PLAYER], isPending: false };
    mockSummary = freshSummary();
  });

  it('renders hero, key stats, form sparkline and the resolved next fixture', () => {
    const { getByText, queryByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('Man City · FWD')).toBeTruthy();
    expect(getByText('ICT')).toBeTruthy();
    expect(getByText('ARS')).toBeTruthy(); // opponent team id 1 → ARS
    expect(queryByText('Unavailable')).toBeNull();
    expect(queryByText('Doubtful')).toBeNull();
  });

  it('shows the availability banner for a flagged player', () => {
    mockPlayers = {
      data: [{ ...PLAYER, status: 'i', news: 'Hamstring injury', chanceNext: 25 }],
      isPending: false,
    };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('25% to play')).toBeTruthy();
    expect(getByText('Hamstring injury')).toBeTruthy();
  });

  it('shows not-found when the id is not in the pool', () => {
    mockParams = { id: '999' };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('Player not found')).toBeTruthy();
  });

  it('shows an inline retry when the summary fails', () => {
    const refetch = jest.fn();
    mockSummary = { isPending: false, isError: true, refetch, data: undefined };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/playerDetailScreen.test.tsx`
Expected: FAIL — cannot find module `@/app/(home)/player/[id]`.

- [ ] **Step 3: Rename the route file**

```bash
git mv "src/app/(home)/player/[name].tsx" "src/app/(home)/player/[id].tsx"
```

- [ ] **Step 4: Rewrite the screen** (`src/app/(home)/player/[id].tsx`)

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { usePlayers } from '@/api/players';
import { useClubs, useClubCodeByTeamId } from '@/api/clubs';
import { useElementSummary, last5FromHistory, next5Fixtures } from '@/api/playerSummary';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { PlayerHero } from '@/components/player/PlayerHero';
import { AvailabilityBanner } from '@/components/player/AvailabilityBanner';
import { KeyStatsRow } from '@/components/player/KeyStatsRow';
import { FormSparkline } from '@/components/player/FormSparkline';
import { FixtureStrip } from '@/components/player/FixtureStrip';

export default function PlayerDetailModal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const { data: players, isPending } = usePlayers();
  const { data: clubs } = useClubs();
  const { data: codeByTeamId } = useClubCodeByTeamId();
  const summary = useElementSummary(id);

  if (isPending || !players) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={120} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
      </View>
    );
  }

  const player = players.find((p) => p.id === id);
  if (!player) {
    return (
      <View style={[styles.empty, { backgroundColor: tk.bg }]}>
        <Text style={[styles.notFound, { color: tk.text }]}>Player not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: tk.green }]}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const clubName = clubs?.[player.club]?.name ?? player.club;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tk.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevL" color={tk.text} size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tk.text }]}>Player</Text>
        <View style={{ width: 24 }} />
      </View>

      <PlayerHero
        name={player.name}
        club={player.club}
        clubName={clubName}
        pos={player.pos}
        price={player.p}
        ownership={player.own}
        tk={tk}
      />

      <AvailabilityBanner status={player.status} news={player.news} chanceNext={player.chanceNext} tk={tk} />

      <KeyStatsRow form={player.f} total={player.tp} ep={player.gw} ict={player.ict} bps={player.bps} tk={tk} />

      <Text style={[styles.sectionTitle, { color: tk.text }]}>Last 5 gameweeks</Text>
      {summary.isError ? (
        <SummaryError tk={tk} onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <FormSparkline points={last5FromHistory(summary.data.history)} tk={tk} />
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <Skeleton height={80} radius={14} />
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: tk.text }]}>Next 5 fixtures</Text>
      {summary.isError ? null : summary.data ? (
        <FixtureStrip
          fixtures={next5Fixtures(summary.data.fixtures)}
          codeByTeamId={codeByTeamId ?? {}}
          dark={dark}
          tk={tk}
        />
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <Skeleton height={48} radius={14} />
        </View>
      )}
    </ScrollView>
  );
}

function SummaryError({ tk, onRetry }: { tk: ReturnType<typeof apexTokens>; onRetry: () => void }) {
  return (
    <View style={styles.errRow}>
      <Text style={[styles.errText, { color: tk.faint }]}>Couldn&apos;t load recent form &amp; fixtures.</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={[styles.retry, { color: tk.green }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  notFound: { fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeBtn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  closeText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 16 },
  sectionTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 2 },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  errText: { fontFamily: 'Archivo_500Medium', fontSize: 13, flexShrink: 1 },
  retry: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13 },
});
```

- [ ] **Step 5: Update the modal route registration**

In `src/app/(home)/_layout.tsx`, change line 22:

```tsx
      <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
```

- [ ] **Step 6: Update the Team pitch call site**

In `src/app/(home)/(tabs)/team.tsx`, replace `openPlayer`:

```tsx
  const openPlayer = (p: PitchPlayer) => {
    router.push({
      pathname: '/(home)/player/[id]',
      params: { id: p.id },
    });
  };
```

- [ ] **Step 7: Update the Transfer pitch call site**

In `src/app/(home)/(tabs)/transfer.tsx`, replace `openPlayer`:

```tsx
  const openPlayer = (p: TransferPitchPlayer) => {
    router.push({
      pathname: '/(home)/player/[id]',
      params: { id: p.id },
    });
  };
```

- [ ] **Step 8: Make Top Picks rows navigate (PickRow)**

In `src/components/picks/PickRow.tsx`: import `Pressable` and `useRouter`, and wrap the row. Change the imports line 2 to:

```tsx
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
```

Add below the other imports:

```tsx
import { useRouter } from 'expo-router';
```

Inside `PickRow`, add at the top of the function body:

```tsx
  const router = useRouter();
```

Change the outermost `<View style={[styles.row, …]}>…</View>` to a `<Pressable>` with the same style and an `onPress`:

```tsx
    <Pressable
      onPress={() => router.push({ pathname: '/(home)/player/[id]', params: { id: p.id } })}
      style={[
        styles.row,
        {
          backgroundColor: zebra ? tk.zebra : 'transparent',
          borderBottomColor: tk.line,
          borderBottomWidth: last ? 0 : 1,
          opacity: owned ? 0.5 : 1,
        },
      ]}
    >
```

(Close with `</Pressable>` instead of `</View>` at the end of the returned element.)

- [ ] **Step 9: Write the PickRow navigation test**

```tsx
// src/__tests__/pickRowNav.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: mockPush }) }));

import { PickRow } from '@/components/picks/PickRow';

const PLAYER: TopPickPlayer = {
  id: '401', name: 'Haaland', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
};

describe('PickRow navigation', () => {
  beforeEach(() => mockPush.mockReset());
  it('navigates to the player detail route by id on press', () => {
    const { getByText } = render(
      <PickRow
        p={PLAYER}
        zebra={false}
        last
        tk={apexTokens(true, 'classic')}
        dark
        fixtures={{}}
        squadNames={new Set()}
      />,
    );
    fireEvent.press(getByText('Haaland'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(home)/player/[id]',
      params: { id: '401' },
    });
  });
});
```

- [ ] **Step 10: Run the screen + nav tests**

Run: `npx jest src/__tests__/playerDetailScreen.test.tsx src/__tests__/pickRowNav.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 11: Regenerate typed routes, then commit**

Typed routes are generated by Metro. Start it once so `.expo/types` picks up the `[id]` route, then stop it (Ctrl-C):

Run: `npm start` → wait for "Waiting on http://localhost…" → Ctrl-C.

```bash
git add "src/app/(home)/player/[id].tsx" src/app/\(home\)/_layout.tsx "src/app/(home)/(tabs)/team.tsx" "src/app/(home)/(tabs)/transfer.tsx" src/components/picks/PickRow.tsx src/__tests__/playerDetailScreen.test.tsx src/__tests__/pickRowNav.test.tsx
git commit -m "feat(player-detail): real screen + id-based routing from team/transfer/top-picks"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Pay attention to the `player/[id]` route pathname in `team.tsx`, `transfer.tsx`, `PickRow.tsx` resolving against regenerated typed routes.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in touched files.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all suites PASS (including the pre-existing `players`/`squad` suites updated in Task 5).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run ios` (or `npm start`). Open the app → Top Picks → tap a player → detail opens with hero, stats, sparkline, fixtures. Repeat from the Team and Transfer pitches. Find a flagged player (e.g. one with an injury) to see the availability banner.

- [ ] **Step 5: Commit any lint fixups**

```bash
git add -A
git commit -m "chore(player-detail): lint + typecheck fixups"
```

(Skip if Steps 1-3 produced no changes.)

---

## Self-Review

**Spec coverage:**
- Routing by id + Top Picks navigation → Tasks 6, 8. ✓
- Pool extension (status/news/chance/ict/bps) → Task 5. ✓
- element-summary fetch + last5/next5 → Task 3. ✓
- Hero / availability banner / key stats / form sparkline / fixture strip → Tasks 2, 7, 8. ✓
- Opponent resolution (team-id→code) + FDR colour → Tasks 1, 4. ✓
- States: pool loading, not-found, summary loading/error/empty-history → Task 8 screen + Task 7 empty states. ✓
- Tests: pure utils, api parse, screen, wiring → Tasks 1-5, 8. ✓
- Out of scope (transfer-in CTA, watchlist, heavier charts/comparison) → not built. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `FormPoint`/`NextFixture` (Task 3) consumed by `FormSparkline`/`FixtureStrip` (Task 7) and the screen (Task 8). `Player` new fields (Task 5: `status`, `news`, `chanceNext`, `ict`, `bps`) consumed by the screen + `AvailabilityBanner`/`KeyStatsRow`. `id` added to view-models (Task 6) consumed by call sites (Task 8). `availabilityState` (Task 2) used by `AvailabilityBanner` (Task 7). `fdrColor` (Task 1) used by `FixtureStrip` (Task 7). `useClubCodeByTeamId` (Task 4) used by the screen (Task 8). All consistent. ✓
