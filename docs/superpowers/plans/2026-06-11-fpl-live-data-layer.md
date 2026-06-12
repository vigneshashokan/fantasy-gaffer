# FPL Live Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/constants/data.ts` mock constants with TanStack Query hooks reading from Supabase (reference data) and the public FPL endpoints (user state). All five tabs render against live data; mock constants deleted.

**Architecture:** Two data sources behind one cache. `src/api/*.ts` co-locates each resource's query function and hook. Hooks return existing UI-oriented types so screen render trees stay unchanged. Mapping from raw DB / FPL shapes happens inside the resource file. No new DB tables — we are an extended view of FPL per `docs/schema.md` L8.

**Tech Stack:** Expo 54 / React Native 0.81, TypeScript 5.9, TanStack Query 5 (new), `@supabase/supabase-js` (existing), Jest 29 + `@testing-library/react-native` 13.

**Spec:** `docs/superpowers/specs/2026-06-11-fpl-live-data-layer-design.md`. Read it before starting; the design rationale isn't repeated here.

---

## Phase A — Foundation (data layer scaffolding, no UI changes)

### Task A1: Install TanStack Query

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install the package**

```bash
npm install @tanstack/react-query@^5
```

Expected: package added to `package.json`, lockfile updated.

- [ ] **Step 2: Verify the version is compatible with React 19**

Run: `npm ls @tanstack/react-query`
Expected: prints `@tanstack/react-query@5.x.x` with no peer-dep warnings about react. If a warning fires, pin to the most recent v5 minor that supports React 19 (5.62+ at time of writing).

- [ ] **Step 3: Verify the existing test suite still runs**

Run: `npm test -- --listTests | wc -l`
Expected: a number greater than 20 (Jest discovers all current test files; nothing breaks at install time).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @tanstack/react-query for live data layer (#21)"
```

---

### Task A2: Relocate types to `src/types/fpl.ts`

`src/constants/data.ts` currently exports both **types** and **mock constants**. Move all types to `src/types/fpl.ts` so screens don't need to import from `constants/data.ts` just to get a type.

**Files:**
- Create: `src/types/fpl.ts`
- Modify: `src/constants/data.ts` (types will be re-exported from new location, full removal happens in Phase D)

- [ ] **Step 1: Create `src/types/fpl.ts` with the type definitions**

```ts
// src/types/fpl.ts
//
// All UI-facing shape types for FPL data. Hooks in src/api/ return these
// shapes; screens import types from here, never from src/constants/data.ts.

export type ClubCode =
  | 'ARS' | 'LIV' | 'MCI' | 'CHE' | 'MUN' | 'NEW' | 'TOT'
  | 'AVL' | 'NFO' | 'BHA' | 'BOU' | 'BRE' | 'CRY' | 'EVE'
  | 'WOL' | 'FUL' | 'WHU';

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export interface Club {
  name: string;
  kit: string;
  kit2: string;
  ink: string;
}

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
  capt?: boolean;
  vice?: boolean;
  sub?: number;
  subIn?: number;
}

export interface TopPickPlayer {
  name: string;
  club: ClubCode;
  p: number;
  f: number;
  tp: number;
  own: number;
  gw: number;
}

export interface Chip {
  id: string;
  name: string;
  sub: string;
  available: boolean;
  playedGW?: number;
  icon: string;
}

export interface Fixture {
  opp: ClubCode;
  h: boolean;
}

export interface PitchPlayer {
  name: string;
  pts: number | null;
  capt?: boolean;
  ball?: boolean;
  sub?: number;
  subIn?: number;
  cards?: Array<'yellow' | 'red'>;
  gk?: boolean;
  alert?: boolean;
}

export interface TransferPitchPlayer {
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

export interface CaptainPick {
  name: string;
  club: ClubCode;
  xp: number;
  note: string;
}

export interface Suggestion {
  id: string;
  type: 'sub' | 'transfer';
  text: string;
  detail: string;
  gain: string;
  wasApplied: boolean;
}

export interface TransferSuggestion {
  id: string;
  out: string;
  outClub: ClubCode;
  in: string;
  inClub: ClubCode;
  detail: string;
  gain: string;
}

export interface TransferChip {
  name: string;
  status: string;
  state: 'active' | 'used' | 'idle';
  playedGw?: number;
  tip?: { title: string; lines: string[] };
}

export interface TeamInfo {
  name: string;
  gw: number;
  gwPoints: number;
  totalPoints: number;
  rank: number;
}

export interface Profile {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  email: string;
  faceId: boolean;
  fplTeamId: number | null;
}
```

Note: `Profile.fplTeamId` is **new**. The mock didn't have it; the DB does (`profiles.fpl_team_id`). Add it now so `useProfile()` can return it.

- [ ] **Step 2: Edit `src/constants/data.ts` to re-export types from the new location**

Replace the top type-definition block (lines 1-141 — everything from `export type ClubCode` through the `CLUBS` declaration) — leave the data constants in place for now. Final removal is Phase D.

Edit the file to remove the inline `export type` and `export interface` declarations and replace them with a single re-export at the top of the file:

```ts
// At the very top of src/constants/data.ts:
export * from '@/types/fpl';

// Then keep the existing CLUBS, SQUAD, TOP_PICKS, CHIPS, FIXTURES, APEX_TEAM,
// TEAM_INFO, PROFILE constants below, unchanged for now.
```

- [ ] **Step 3: Run TypeScript to catch any unresolved imports**

Run: `npx tsc --noEmit`
Expected: zero errors. The re-export keeps existing `import { Player } from '@/constants/data'` sites working transparently.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing tests pass (103). No behavior change yet.

- [ ] **Step 5: Commit**

```bash
git add src/types/fpl.ts src/constants/data.ts
git commit -m "refactor: move FPL types to src/types/fpl.ts (#21)"
```

---

### Task A3: Create the query key factory

**Files:**
- Create: `src/api/queryKeys.ts`

- [ ] **Step 1: Create the key factory**

```ts
// src/api/queryKeys.ts
//
// Single source of truth for TanStack Query cache keys. Use these everywhere
// — never hand-roll a key array — so invalidation has one place to look.

export const queryKeys = {
  clubs:     ['clubs'] as const,
  players:   ['players'] as const,
  currentGw: ['currentGw'] as const,
  fixtures:  (gw: number) => ['fixtures', gw] as const,
  profile:   (userId: string) => ['profile', userId] as const,
  manager:   (teamId: number) => ['manager', teamId] as const,
  squad:     (teamId: number, gw: number) => ['squad', teamId, gw] as const,
  chips:     (teamId: number) => ['chips', teamId] as const,
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/queryKeys.ts
git commit -m "feat(api): add TanStack Query key factory (#21)"
```

---

### Task A4: Build the FPL client (`fpl-client.ts`) with retry

`fpl-client.ts` is the single egress point for all calls to `fantasy.premierleague.com`. When we switch to the proxy later, only this file changes.

**Files:**
- Create: `src/api/fpl-client.ts`
- Test: `src/__tests__/api/fpl-client.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// src/__tests__/api/fpl-client.test.ts
import { fplGet, FplFetchError } from '@/api/fpl-client';

describe('fpl-client', () => {
  const FAKE_URL = '/entry/12345/';

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('hits the FPL base URL with the given path and parses JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 12345, name: 'Test Team' }),
    });

    const result = await fplGet<{ id: number; name: string }>(FAKE_URL);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://fantasy.premierleague.com/api/entry/12345/',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ id: 12345, name: 'Test Team' });
  });

  it('retries twice on 5xx then succeeds', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({ ok: 1 }) });

    const result = await fplGet<{ ok: number }>(FAKE_URL);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: 1 });
  });

  it('does not retry on 4xx — throws FplFetchError immediately', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    });

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws FplFetchError after exhausting all 3 retries on 5xx', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network error and surfaces FplFetchError on final failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/fpl-client.test.ts`
Expected: FAIL — `Cannot find module '@/api/fpl-client'`.

- [ ] **Step 3: Implement the client**

```ts
// src/api/fpl-client.ts
//
// Single egress for all calls to fantasy.premierleague.com/api/*.
// When the optional fpl-proxy Edge Function lands, only the base URL here
// changes; all hooks stay the same.

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 300, 800]; // pre-attempt delay per attempt

export class FplFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FplFetchError';
  }
}

export async function fplGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const res = await fetch(`${FPL_BASE}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: signal ?? controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        return (await res.json()) as T;
      }

      // 4xx: do not retry. 5xx: keep looping.
      if (res.status >= 400 && res.status < 500) {
        throw new FplFetchError(`FPL ${res.status} for ${path}`, res.status);
      }

      lastErr = new FplFetchError(`FPL ${res.status} for ${path}`, res.status);
    } catch (err) {
      // 4xx already thrown above. Anything else (network, timeout, parse) loops.
      if (err instanceof FplFetchError && err.status !== null && err.status < 500) {
        throw err;
      }
      lastErr = err;
    }
  }

  if (lastErr instanceof FplFetchError) throw lastErr;
  throw new FplFetchError(`FPL request failed after ${MAX_ATTEMPTS} attempts`, null, lastErr);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/fpl-client.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/fpl-client.ts src/__tests__/api/fpl-client.test.ts
git commit -m "feat(api): add fpl-client with retry + timeout (#21)"
```

---

### Task A5: Create the `Skeleton` primitive

A height-keyed loading placeholder used by cards in `pending` state. Reanimated-driven shimmer to match the existing visual language.

**Files:**
- Create: `src/components/ui/Skeleton.tsx`
- Test: `src/__tests__/components/skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/skeleton.test.tsx
import { render } from '@testing-library/react-native';
import { Skeleton } from '@/components/ui/Skeleton';

describe('<Skeleton />', () => {
  it('renders with the requested height', () => {
    const { getByTestId } = render(<Skeleton height={64} testID="sk" />);
    const el = getByTestId('sk');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 64 })]),
    );
  });

  it('defaults to a sensible height when none is provided', () => {
    const { getByTestId } = render(<Skeleton testID="sk" />);
    const el = getByTestId('sk');
    const flat = (Array.isArray(el.props.style) ? Object.assign({}, ...el.props.style) : el.props.style) as { height: number };
    expect(flat.height).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/components/skeleton.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/Skeleton'`.

- [ ] **Step 3: Implement `Skeleton.tsx`**

```tsx
// src/components/ui/Skeleton.tsx
//
// Loading placeholder. Use in place of empty card content while a hook
// is pending. Height matches the rendered content height to avoid layout
// shift when data arrives.

import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';

interface SkeletonProps {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
  testID?: string;
}

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
  testID,
}: SkeletonProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.base,
        { height, width, borderRadius: radius, backgroundColor: tk.cardBorder },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/components/skeleton.test.tsx`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Skeleton.tsx src/__tests__/components/skeleton.test.tsx
git commit -m "feat(ui): add Skeleton primitive for loading cards (#21)"
```

---

### Task A6: Add `renderWithProviders` test helper

All screen and hook tests need a `QueryClientProvider` wrapper. Centralize it once.

**Files:**
- Create: `src/__tests__/utils/renderWithProviders.tsx`

- [ ] **Step 1: Create the helper**

```tsx
// src/__tests__/utils/renderWithProviders.tsx
//
// Wrap component renders in a QueryClientProvider with a fresh client
// per test. Disable retries so tests don't sleep on transient errors.

import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { client?: QueryClient },
) {
  const client = options?.client ?? makeTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/utils/renderWithProviders.tsx
git commit -m "test: add renderWithProviders helper (#21)"
```

---

### Task A7: Wrap `_layout.tsx` with `QueryClientProvider`

Add the provider with the production defaults from the spec. Auth-error handling lands in a later task (B7) once we have a hook to demonstrate it against.

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Add the QueryClient import and provider**

Edit `src/app/_layout.tsx`:

Add to the existing imports (after the existing imports block, before `SplashScreen.preventAutoHideAsync()`):

```ts
import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
```

(Note: `useEffect, useState` are already imported via the existing react import on line 18; add `useMemo` to that same import statement instead of a new line. Use the Edit tool with `replace_all: false` and exact context.)

Inside the `RootLayout` function, after the `useEmailAuthDeepLinks();` line, add:

```ts
const queryClient = useMemo(
  () =>
    new QueryClient({
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
```

Wrap the existing `<SafeAreaProvider>...</SafeAreaProvider>` return value with `<QueryClientProvider client={queryClient}>`:

```tsx
return (
  <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  </QueryClientProvider>
);
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run the existing tests**

Run: `npm test`
Expected: all 103 existing tests still pass — the provider above the tree is invisible to current screens that don't use hooks yet.

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: wrap app in QueryClientProvider (#21)"
```

---

## Phase B — Resource hooks (one resource per task, TDD)

Each resource file co-locates: (a) the raw fetch / DB query, (b) the adapter from raw shape to UI shape, (c) the hook(s) that consume it. Tests focus on the adapter — the riskiest part — because the fetch is mocked and the hook is a thin wrapper.

### Task B1: `clubs.ts` — `useClubs()`

**Files:**
- Create: `src/constants/clubColors.ts` (extracted now so `clubs.ts` can consume it)
- Create: `src/api/clubs.ts`
- Test: `src/__tests__/api/clubs.test.tsx`

- [ ] **Step 1: Create `src/constants/clubColors.ts`**

```ts
// src/constants/clubColors.ts
//
// Design-time kit color palette per club code. Backend doesn't store these;
// they're product design tokens. The useClubs() hook joins rows fetched
// from Supabase against this table by short_name → ClubCode.

import type { ClubCode } from '@/types/fpl';

export const CLUB_COLORS: Record<ClubCode, { kit: string; kit2: string; ink: string }> = {
  ARS: { kit: '#EF0107', kit2: '#fff',    ink: '#fff' },
  LIV: { kit: '#C8102E', kit2: '#00B2A9', ink: '#fff' },
  MCI: { kit: '#6CABDD', kit2: '#fff',    ink: '#0a2d5e' },
  CHE: { kit: '#034694', kit2: '#fff',    ink: '#fff' },
  MUN: { kit: '#DA291C', kit2: '#000',    ink: '#fff' },
  NEW: { kit: '#1A1A1A', kit2: '#fff',    ink: '#fff' },
  TOT: { kit: '#F4F4F4', kit2: '#132257', ink: '#132257' },
  AVL: { kit: '#670E36', kit2: '#95BFE5', ink: '#95BFE5' },
  NFO: { kit: '#DD0000', kit2: '#fff',    ink: '#fff' },
  BHA: { kit: '#0057B8', kit2: '#fff',    ink: '#fff' },
  BOU: { kit: '#B50E12', kit2: '#000',    ink: '#fff' },
  BRE: { kit: '#E30613', kit2: '#fff',    ink: '#fff' },
  CRY: { kit: '#1B458F', kit2: '#C4122E', ink: '#fff' },
  EVE: { kit: '#003399', kit2: '#fff',    ink: '#fff' },
  WOL: { kit: '#FDB913', kit2: '#231F20', ink: '#231F20' },
  FUL: { kit: '#F4F4F4', kit2: '#000',    ink: '#222' },
  WHU: { kit: '#7A263A', kit2: '#1BB1E7', ink: '#fff' },
};
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/__tests__/api/clubs.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useClubs, clubsFromRows } from '@/api/clubs';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('clubsFromRows adapter', () => {
  it('maps short_name to ClubCode and joins kit colors', () => {
    const rows = [
      { id: 1, short_name: 'ARS', name: 'Arsenal' },
      { id: 11, short_name: 'LIV', name: 'Liverpool' },
    ];
    const result = clubsFromRows(rows);
    expect(result.ARS).toEqual({ name: 'Arsenal', kit: '#EF0107', kit2: '#fff', ink: '#fff' });
    expect(result.LIV).toEqual({ name: 'Liverpool', kit: '#C8102E', kit2: '#00B2A9', ink: '#fff' });
  });

  it('drops rows whose short_name is not a known ClubCode', () => {
    const rows = [
      { id: 99, short_name: 'XYZ', name: 'Unknown FC' },
      { id: 1,  short_name: 'ARS', name: 'Arsenal' },
    ];
    const result = clubsFromRows(rows);
    expect(result).not.toHaveProperty('XYZ' as never);
    expect(result.ARS).toBeDefined();
  });
});

describe('useClubs', () => {
  it('returns mapped clubs from supabase', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [{ id: 1, short_name: 'ARS', name: 'Arsenal' }],
        error: null,
      }),
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClubs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ARS?.name).toBe('Arsenal');
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/clubs.test.tsx`
Expected: FAIL — `Cannot find module '@/api/clubs'`.

- [ ] **Step 4: Implement `src/api/clubs.ts`**

```ts
// src/api/clubs.ts
//
// Reference data: 20 PL clubs. Source = supabase.clubs.
// Joined against CLUB_COLORS to fill in design-time kit hex values.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CLUB_COLORS } from '@/constants/clubColors';
import { queryKeys } from './queryKeys';
import type { Club, ClubCode } from '@/types/fpl';

interface ClubRow {
  id: number;
  short_name: string;
  name: string;
}

const KNOWN_CODES = new Set<string>(Object.keys(CLUB_COLORS));

export function clubsFromRows(rows: ClubRow[]): Record<ClubCode, Club> {
  const out = {} as Record<ClubCode, Club>;
  for (const row of rows) {
    if (!KNOWN_CODES.has(row.short_name)) continue;
    const code = row.short_name as ClubCode;
    out[code] = { name: row.name, ...CLUB_COLORS[code] };
  }
  return out;
}

async function queryClubs(): Promise<Record<ClubCode, Club>> {
  const { data, error } = await supabase.from('clubs').select('id, short_name, name');
  if (error) throw error;
  return clubsFromRows(data ?? []);
}

export function useClubs() {
  return useQuery({
    queryKey: queryKeys.clubs,
    queryFn: queryClubs,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/clubs.test.tsx`
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/clubs.ts src/__tests__/api/clubs.test.tsx src/constants/clubColors.ts
git commit -m "feat(api): useClubs() reads from supabase.clubs (#21)"
```

---

### Task B2: `players.ts` — `usePlayers()` and `useTopPicks()`

The adapter is the riskiest piece — FPL string-encoded numerics are a known foot-gun (`docs/fpl-api.md` "Field quirks").

**Files:**
- Create: `src/api/players.ts`
- Test: `src/__tests__/api/players.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/api/players.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { playersFromRows, useTopPicks } from '@/api/players';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '@/lib/supabase';

const FIXTURE_ROWS = [
  {
    id: 401, web_name: 'Haaland', team_id: 13,
    position: 'FWD', now_cost: 142, form: '8.4',
    total_points: 175, selected_by_percent: '62.3', ep_next: '9.1',
  },
  {
    id: 233, web_name: 'Saka', team_id: 1,
    position: 'MID', now_cost: 92, form: '6.1',
    total_points: 131, selected_by_percent: '38.6', ep_next: '7.2',
  },
];

const FIXTURE_CLUB_BY_ID: Record<number, string> = { 1: 'ARS', 13: 'MCI' };

describe('playersFromRows adapter', () => {
  it('maps DB columns to UI Player shape', () => {
    const result = playersFromRows(FIXTURE_ROWS, FIXTURE_CLUB_BY_ID);
    expect(result).toHaveLength(2);
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
    });
  });

  it('drops players whose club id is missing from the lookup', () => {
    const result = playersFromRows(FIXTURE_ROWS, { 1: 'ARS' });
    expect(result.map((p) => p.name)).toEqual(['Saka']);
  });

  it('handles parseFloat-failing strings by treating them as 0', () => {
    const result = playersFromRows(
      [{ ...FIXTURE_ROWS[0], form: '', selected_by_percent: '', ep_next: '' }],
      FIXTURE_CLUB_BY_ID,
    );
    expect(result[0].f).toBe(0);
    expect(result[0].own).toBe(0);
    expect(result[0].gw).toBe(0);
  });
});

describe('useTopPicks', () => {
  it('groups players by position and sorts by gw (ep_next) desc, top 8 per pos', async () => {
    // Build 10 forwards with descending ep_next.
    const manyFwds = Array.from({ length: 10 }, (_, i) => ({
      id: 500 + i,
      web_name: `Fwd${i}`,
      team_id: 13,
      position: 'FWD' as const,
      now_cost: 60, form: '5.0',
      total_points: 50, selected_by_percent: '5.0',
      ep_next: String(10 - i),
    }));
    const playersRow = jest.fn().mockResolvedValue({ data: manyFwds, error: null });
    const clubsRow   = jest.fn().mockResolvedValue({
      data: [{ id: 13, short_name: 'MCI', name: 'Man City' }],
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => ({
      select: table === 'players' ? playersRow : clubsRow,
    }));

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTopPicks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.FWD).toHaveLength(8);
    expect(result.current.data?.FWD[0].name).toBe('Fwd0'); // ep_next=10
    expect(result.current.data?.FWD[7].name).toBe('Fwd7'); // ep_next=3
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/players.test.tsx`
Expected: FAIL — `Cannot find module '@/api/players'`.

- [ ] **Step 3: Implement `src/api/players.ts`**

```ts
// src/api/players.ts
//
// usePlayers() returns all players in UI shape, joining against the clubs
// table for the ClubCode. useTopPicks() derives a per-position top-8 by
// ep_next from the same cache entry — no extra fetch.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './queryKeys';
import { useClubs } from './clubs';
import type { Player, Position, TopPickPlayer, ClubCode } from '@/types/fpl';

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
}

const safeFloat = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export function playersFromRows(
  rows: PlayerRow[],
  clubByTeamId: Record<number, string>,
): Player[] {
  const out: Player[] = [];
  for (const row of rows) {
    const code = clubByTeamId[row.team_id];
    if (!code) continue;
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
    });
  }
  return out;
}

async function queryPlayers(): Promise<Player[]> {
  const [playersRes, clubsRes] = await Promise.all([
    supabase.from('players').select(
      'id, web_name, team_id, position, now_cost, form, total_points, selected_by_percent, ep_next',
    ),
    supabase.from('clubs').select('id, short_name'),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (clubsRes.error) throw clubsRes.error;

  const clubByTeamId: Record<number, string> = {};
  for (const c of clubsRes.data ?? []) clubByTeamId[c.id] = c.short_name;
  return playersFromRows((playersRes.data ?? []) as PlayerRow[], clubByTeamId);
}

export function usePlayers() {
  return useQuery({
    queryKey: queryKeys.players,
    queryFn: queryPlayers,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

const TOP_N_PER_POS = 8;

export function useTopPicks() {
  const players = usePlayers();

  const data = useMemo<Record<Position, TopPickPlayer[]> | undefined>(() => {
    if (!players.data) return undefined;
    const buckets: Record<Position, TopPickPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const p of players.data) {
      buckets[p.pos].push({
        name: p.name, club: p.club, p: p.p, f: p.f, tp: p.tp, own: p.own, gw: p.gw,
      });
    }
    for (const pos of Object.keys(buckets) as Position[]) {
      buckets[pos].sort((a, b) => b.gw - a.gw);
      buckets[pos] = buckets[pos].slice(0, TOP_N_PER_POS);
    }
    return buckets;
  }, [players.data]);

  return { ...players, data };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/players.test.tsx`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/players.ts src/__tests__/api/players.test.tsx
git commit -m "feat(api): usePlayers + useTopPicks from supabase.players (#21)"
```

---

### Task B3: `fixtures.ts` — `useCurrentGameweek()` and `useFixturesByGw()`

`useCurrentGameweek` reads from FPL's `bootstrap-static.events`. `useFixturesByGw` reads from `supabase.fixtures`.

**Files:**
- Create: `src/api/fixtures.ts`
- Test: `src/__tests__/api/fixtures.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/api/fixtures.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fixturesFromRows,
  currentGwFromEvents,
  useCurrentGameweek,
  useFixturesByGw,
} from '@/api/fixtures';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('@/api/fpl-client', () => ({
  fplGet: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { fplGet } from '@/api/fpl-client';

describe('currentGwFromEvents', () => {
  it('returns the event marked is_current', () => {
    const events = [
      { id: 23, is_current: false, is_next: false, finished: true },
      { id: 24, is_current: true,  is_next: false, finished: false },
      { id: 25, is_current: false, is_next: true,  finished: false },
    ];
    expect(currentGwFromEvents(events)).toBe(24);
  });

  it('falls back to is_next when nothing is current (between gameweeks)', () => {
    const events = [
      { id: 24, is_current: false, is_next: false, finished: true },
      { id: 25, is_current: false, is_next: true,  finished: false },
    ];
    expect(currentGwFromEvents(events)).toBe(25);
  });

  it('defaults to 1 if nothing matches (pre-season)', () => {
    expect(currentGwFromEvents([])).toBe(1);
  });
});

describe('fixturesFromRows', () => {
  const clubByTeamId = { 1: 'ARS', 11: 'LIV', 13: 'MCI', 6: 'CHE' };

  it('maps each home club → away opponent (h:true), and vice versa', () => {
    const rows = [
      { event: 24, team_h: 1, team_a: 11 }, // ARS hosts LIV
      { event: 24, team_h: 13, team_a: 6 }, // MCI hosts CHE
    ];
    const result = fixturesFromRows(rows, clubByTeamId);
    expect(result.ARS).toEqual({ opp: 'LIV', h: true });
    expect(result.LIV).toEqual({ opp: 'ARS', h: false });
    expect(result.MCI).toEqual({ opp: 'CHE', h: true });
    expect(result.CHE).toEqual({ opp: 'MCI', h: false });
  });
});

describe('useCurrentGameweek', () => {
  it('returns current gw from bootstrap-static', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({
      events: [{ id: 24, is_current: true, is_next: false, finished: false }],
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCurrentGameweek(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(24);
    expect(fplGet).toHaveBeenCalledWith('/bootstrap-static/');
  });
});

describe('useFixturesByGw', () => {
  it('queries supabase.fixtures filtered by event', async () => {
    const selectChain = {
      eq: jest.fn().mockResolvedValue({
        data: [{ event: 24, team_h: 1, team_a: 11 }],
        error: null,
      }),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'fixtures') return { select: jest.fn().mockReturnValue(selectChain) };
      if (table === 'clubs')    return { select: jest.fn().mockResolvedValue({
        data: [{ id: 1, short_name: 'ARS' }, { id: 11, short_name: 'LIV' }],
        error: null,
      }) };
      return { select: jest.fn() };
    });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFixturesByGw(24), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ARS?.opp).toBe('LIV');
    expect(selectChain.eq).toHaveBeenCalledWith('event', 24);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/fixtures.test.tsx`
Expected: FAIL — `Cannot find module '@/api/fixtures'`.

- [ ] **Step 3: Implement `src/api/fixtures.ts`**

```ts
// src/api/fixtures.ts
//
// useCurrentGameweek() reads FPL bootstrap-static.events; it's the canonical
// current-event lookup. useFixturesByGw(gw) reads from supabase.fixtures.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import type { ClubCode, Fixture } from '@/types/fpl';

interface BootstrapEvent {
  id: number;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
}

interface BootstrapResponse {
  events: BootstrapEvent[];
}

export function currentGwFromEvents(events: BootstrapEvent[]): number {
  const current = events.find((e) => e.is_current);
  if (current) return current.id;
  const next = events.find((e) => e.is_next);
  if (next) return next.id;
  return 1;
}

export function useCurrentGameweek() {
  return useQuery({
    queryKey: queryKeys.currentGw,
    queryFn: async () => {
      const data = await fplGet<BootstrapResponse>('/bootstrap-static/');
      return currentGwFromEvents(data.events);
    },
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
}

interface FixtureRow {
  event: number | null;
  team_h: number;
  team_a: number;
}

export function fixturesFromRows(
  rows: FixtureRow[],
  clubByTeamId: Record<number, string>,
): Partial<Record<ClubCode, Fixture>> {
  const out: Partial<Record<ClubCode, Fixture>> = {};
  for (const row of rows) {
    const home = clubByTeamId[row.team_h] as ClubCode | undefined;
    const away = clubByTeamId[row.team_a] as ClubCode | undefined;
    if (home && away) {
      out[home] = { opp: away, h: true };
      out[away] = { opp: home, h: false };
    }
  }
  return out;
}

export function useFixturesByGw(gw: number) {
  return useQuery({
    queryKey: queryKeys.fixtures(gw),
    queryFn: async () => {
      const [fxRes, clubsRes] = await Promise.all([
        supabase.from('fixtures').select('event, team_h, team_a').eq('event', gw),
        supabase.from('clubs').select('id, short_name'),
      ]);
      if (fxRes.error)    throw fxRes.error;
      if (clubsRes.error) throw clubsRes.error;
      const clubByTeamId: Record<number, string> = {};
      for (const c of clubsRes.data ?? []) clubByTeamId[c.id] = c.short_name;
      return fixturesFromRows((fxRes.data ?? []) as FixtureRow[], clubByTeamId);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Number.isFinite(gw) && gw > 0,
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/fixtures.test.tsx`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/fixtures.ts src/__tests__/api/fixtures.test.tsx
git commit -m "feat(api): useCurrentGameweek + useFixturesByGw (#21)"
```

---

### Task B4: `profile.ts` — `useProfile()`

Reads the current user's profile row by `auth.uid()` from `supabase.profiles`. Adds `fpl_team_id` to the returned shape.

**Files:**
- Create: `src/api/profile.ts`
- Test: `src/__tests__/api/profile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/api/profile.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { profileFromRow, useProfile } from '@/api/profile';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));
jest.mock('@/store/biometricStore', () => ({
  useBiometricStore: () => ({ enabled: true }),
}));

import { supabase } from '@/lib/supabase';

describe('profileFromRow', () => {
  it('maps DB columns to Profile shape with faceId from biometric store', () => {
    const row = {
      first_name: 'Apex', last_name: 'Gaffer',
      dob: '1990-08-14',
      fpl_team_id: 12345,
    };
    const result = profileFromRow(row, 'apex@example.com', true);
    expect(result).toEqual({
      firstName: 'Apex',
      lastName: 'Gaffer',
      dob: '14 Aug 1990',
      gender: 'Prefer not to say',
      email: 'apex@example.com',
      faceId: true,
      fplTeamId: 12345,
    });
  });

  it('returns null fplTeamId when DB column is null', () => {
    const row = {
      first_name: 'A', last_name: 'B', dob: '2000-01-01', fpl_team_id: null,
    };
    expect(profileFromRow(row, 'x@y.com', false).fplTeamId).toBeNull();
  });
});

describe('useProfile', () => {
  it('fetches the row for the current user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1', email: 'apex@example.com' } },
      error: null,
    });
    const single = jest.fn().mockResolvedValue({
      data: { first_name: 'Apex', last_name: 'Gaffer', dob: '1990-08-14', fpl_team_id: null },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single }),
      }),
    });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.firstName).toBe('Apex');
    expect(result.current.data?.email).toBe('apex@example.com');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/profile.test.tsx`
Expected: FAIL — `Cannot find module '@/api/profile'`.

- [ ] **Step 3: Implement `src/api/profile.ts`**

```ts
// src/api/profile.ts
//
// useProfile() returns the current user's profile row joined with their
// auth email and the biometric-store faceId toggle.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useBiometricStore } from '@/store/biometricStore';
import { queryKeys } from './queryKeys';
import type { Profile } from '@/types/fpl';

interface ProfileRow {
  first_name: string;
  last_name: string;
  dob: string;
  fpl_team_id: number | null;
}

function formatDob(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'UTC',
  });
}

export function profileFromRow(row: ProfileRow, email: string, faceId: boolean): Profile {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    dob: formatDob(row.dob),
    gender: 'Prefer not to say',
    email,
    faceId,
    fplTeamId: row.fpl_team_id,
  };
}

export function useProfile() {
  const { enabled: faceIdEnabled } = useBiometricStore();
  return useQuery({
    queryKey: queryKeys.profile('current'),
    queryFn: async (): Promise<Profile> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes.user;
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, dob, fpl_team_id')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return profileFromRow(data as ProfileRow, user.email ?? '', faceIdEnabled);
    },
    staleTime: Infinity,
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/profile.test.tsx`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/profile.ts src/__tests__/api/profile.test.tsx
git commit -m "feat(api): useProfile() from supabase.profiles (#21)"
```

---

### Task B5: `manager.ts` — `useManager()` and `useChips()`

**Files:**
- Create: `src/api/manager.ts`
- Test: `src/__tests__/api/manager.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/api/manager.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  managerFromEntry,
  chipsFromHistory,
  useManager,
  useChips,
} from '@/api/manager';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
jest.mock('@/api/profile', () => ({
  useProfile: jest.fn(),
}));

import { fplGet } from '@/api/fpl-client';
import { useProfile } from '@/api/profile';

const ENTRY_FIXTURE = {
  id: 12345,
  name: 'Apex Pitch FC',
  current_event: 24,
  summary_event_points: 64,
  summary_overall_points: 1452,
  summary_overall_rank: 142_831,
};

const HISTORY_FIXTURE = {
  chips: [
    { name: 'bboost',    event: 12 },
    { name: 'wildcard',  event: 18 },
  ],
};

describe('managerFromEntry', () => {
  it('maps FPL entry response to TeamInfo', () => {
    expect(managerFromEntry(ENTRY_FIXTURE)).toEqual({
      name: 'Apex Pitch FC',
      gw: 24,
      gwPoints: 64,
      totalPoints: 1452,
      rank: 142_831,
    });
  });
});

describe('chipsFromHistory', () => {
  it('marks played chips with playedGW and unplayed as available', () => {
    const result = chipsFromHistory(HISTORY_FIXTURE);
    const bb = result.find((c) => c.id === 'bb');
    const fh = result.find((c) => c.id === 'fh');
    expect(bb).toEqual({ id: 'bb', name: 'Bench Boost',  sub: 'All 15 players score', available: false, playedGW: 12, icon: 'benchboost' });
    expect(fh).toEqual({ id: 'fh', name: 'Free Hit',     sub: 'One-week squad',       available: true, icon: 'freehit' });
  });
});

describe('useManager', () => {
  it('fetches /entry/{id}/ when fpl_team_id is set', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      data: { fplTeamId: 12345 }, isSuccess: true,
    });
    (fplGet as jest.Mock).mockResolvedValueOnce(ENTRY_FIXTURE);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useManager(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/');
    expect(result.current.data?.name).toBe('Apex Pitch FC');
  });

  it('does not fetch when fpl_team_id is null', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      data: { fplTeamId: null }, isSuccess: true,
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useManager(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });
});

describe('useChips', () => {
  it('fetches /entry/{id}/history/ and maps it', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      data: { fplTeamId: 12345 }, isSuccess: true,
    });
    (fplGet as jest.Mock).mockResolvedValueOnce(HISTORY_FIXTURE);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useChips(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/history/');
    expect(result.current.data?.find((c) => c.id === 'bb')?.playedGW).toBe(12);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/manager.test.tsx`
Expected: FAIL — `Cannot find module '@/api/manager'`.

- [ ] **Step 3: Implement `src/api/manager.ts`**

```ts
// src/api/manager.ts
//
// useManager() reads FPL /entry/{id}/ — manager profile + current-gw summary.
// useChips() reads /entry/{id}/history/ and joins against a static chip
// catalog to produce the UI Chip[] shape.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import { useProfile } from './profile';
import type { Chip, TeamInfo } from '@/types/fpl';

interface FplEntry {
  id: number;
  name: string;
  current_event: number;
  summary_event_points: number;
  summary_overall_points: number;
  summary_overall_rank: number;
}

interface FplHistory {
  chips: Array<{ name: string; event: number }>;
}

export function managerFromEntry(entry: FplEntry): TeamInfo {
  return {
    name: entry.name,
    gw: entry.current_event,
    gwPoints: entry.summary_event_points,
    totalPoints: entry.summary_overall_points,
    rank: entry.summary_overall_rank,
  };
}

const CHIP_CATALOG: Array<{ id: string; fplName: string; name: string; sub: string; icon: string }> = [
  { id: 'wc', fplName: 'wildcard',     name: 'Wildcard',       sub: 'Unlimited transfers',  icon: 'wildcard' },
  { id: 'fh', fplName: 'freehit',      name: 'Free Hit',       sub: 'One-week squad',       icon: 'freehit' },
  { id: 'bb', fplName: 'bboost',       name: 'Bench Boost',    sub: 'All 15 players score', icon: 'benchboost' },
  { id: 'tc', fplName: '3xc',          name: 'Triple Captain', sub: '3× captain points',    icon: 'triplecaptain' },
];

export function chipsFromHistory(history: FplHistory): Chip[] {
  const playedByFpl: Record<string, number> = {};
  for (const c of history.chips ?? []) playedByFpl[c.name] = c.event;
  return CHIP_CATALOG.map((entry) => {
    const played = playedByFpl[entry.fplName];
    return played !== undefined
      ? { id: entry.id, name: entry.name, sub: entry.sub, available: false, playedGW: played, icon: entry.icon }
      : { id: entry.id, name: entry.name, sub: entry.sub, available: true,  icon: entry.icon };
  });
}

const FPL_STALE = 15 * 60 * 1000;
const FPL_GC    = 30 * 60 * 1000;

export function useManager() {
  const profile = useProfile();
  const teamId = profile.data?.fplTeamId ?? null;
  return useQuery({
    queryKey: queryKeys.manager(teamId ?? 0),
    queryFn: async () => managerFromEntry(await fplGet<FplEntry>(`/entry/${teamId}/`)),
    enabled: teamId !== null,
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

export function useChips() {
  const profile = useProfile();
  const teamId = profile.data?.fplTeamId ?? null;
  return useQuery({
    queryKey: queryKeys.chips(teamId ?? 0),
    queryFn: async () => chipsFromHistory(await fplGet<FplHistory>(`/entry/${teamId}/history/`)),
    enabled: teamId !== null,
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/manager.test.tsx`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/manager.ts src/__tests__/api/manager.test.tsx
git commit -m "feat(api): useManager + useChips from FPL /entry/ (#21)"
```

---

### Task B6: `squad.ts` — `useSquad()` and `useApexTeam()`

`useSquad` fetches `/entry/{id}/event/{currentGw}/picks/` and joins against `usePlayers()`. `useApexTeam` composes squad + manager + fixtures into the existing `APEX_TEAM` shape (minus Gaffer fields).

**Files:**
- Create: `src/api/squad.ts`
- Test: `src/__tests__/api/squad.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/api/squad.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { squadFromPicks, useSquad } from '@/api/squad';
import { makeTestQueryClient } from '../utils/renderWithProviders';
import type { Player } from '@/types/fpl';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
jest.mock('@/api/profile',    () => ({ useProfile: jest.fn() }));
jest.mock('@/api/fixtures',   () => ({ useCurrentGameweek: jest.fn() }));
jest.mock('@/api/players',    () => ({ usePlayers: jest.fn() }));

import { fplGet } from '@/api/fpl-client';
import { useProfile } from '@/api/profile';
import { useCurrentGameweek } from '@/api/fixtures';
import { usePlayers } from '@/api/players';

const PICKS_FIXTURE = {
  picks: [
    { element: 401, position: 1,  is_captain: true,  is_vice_captain: false, multiplier: 2 },
    { element: 233, position: 2,  is_captain: false, is_vice_captain: true,  multiplier: 1 },
    { element: 100, position: 12, is_captain: false, is_vice_captain: false, multiplier: 0 },
  ],
};

const PLAYERS_FIXTURE: Player[] = [
  { id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1 },
  { id: '233', name: 'Saka',    pos: 'MID', club: 'ARS', p: 9.2,  f: 6.1, tp: 131, own: 38.6, gw: 7.2 },
  { id: '100', name: 'Sub',     pos: 'DEF', club: 'CHE', p: 4.0,  f: 4.0, tp: 30,  own: 1.0,  gw: 2.0 },
];

describe('squadFromPicks', () => {
  it('splits position ≤11 into starters, ≥12 into bench, carries captain/vice flags', () => {
    const result = squadFromPicks(PICKS_FIXTURE, PLAYERS_FIXTURE);
    expect(result.starters).toHaveLength(2);
    expect(result.bench).toHaveLength(1);
    const haaland = result.starters.find((p) => p.name === 'Haaland');
    expect(haaland?.capt).toBe(true);
    const saka = result.starters.find((p) => p.name === 'Saka');
    expect(saka?.vice).toBe(true);
  });

  it('returns empty starters/bench when player lookup misses', () => {
    const result = squadFromPicks(PICKS_FIXTURE, []);
    expect(result.starters).toEqual([]);
    expect(result.bench).toEqual([]);
  });
});

describe('useSquad', () => {
  it('fetches when fpl_team_id and currentGw are both set', async () => {
    (useProfile as jest.Mock).mockReturnValue({ data: { fplTeamId: 12345 }, isSuccess: true });
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: 24, isSuccess: true });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE, isSuccess: true });
    (fplGet as jest.Mock).mockResolvedValueOnce(PICKS_FIXTURE);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSquad(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/event/24/picks/');
    expect(result.current.data?.starters).toHaveLength(2);
  });

  it('stays idle when fpl_team_id is null', async () => {
    (useProfile as jest.Mock).mockReturnValue({ data: { fplTeamId: null }, isSuccess: true });
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: 24, isSuccess: true });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE, isSuccess: true });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSquad(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/api/squad.test.tsx`
Expected: FAIL — `Cannot find module '@/api/squad'`.

- [ ] **Step 3: Implement `src/api/squad.ts`**

```ts
// src/api/squad.ts
//
// useSquad() — FPL /entry/{id}/event/{gw}/picks/ joined with usePlayers().
// useApexTeam() — composition of useSquad, useManager, useFixturesByGw,
// shaped to mimic the APEX_TEAM mock (Gaffer fields are deliberately empty).

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import { useProfile } from './profile';
import { useCurrentGameweek, useFixturesByGw } from './fixtures';
import { usePlayers } from './players';
import { useManager } from './manager';
import type {
  Player,
  PitchPlayer,
  Position,
  TransferPitchPlayer,
  ClubCode,
} from '@/types/fpl';

interface PicksResponse {
  picks: Array<{
    element: number;
    position: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    multiplier: number;
  }>;
}

export function squadFromPicks(
  picks: PicksResponse,
  players: Player[],
): { starters: Player[]; bench: Player[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: Player[] = [];
  const bench: Player[] = [];
  for (const pick of picks.picks) {
    const base = byId.get(String(pick.element));
    if (!base) continue;
    const enriched: Player = {
      ...base,
      capt: pick.is_captain || undefined,
      vice: pick.is_vice_captain || undefined,
    };
    if (pick.position <= 11) starters.push(enriched);
    else bench.push(enriched);
  }
  return { starters, bench };
}

const FPL_STALE = 15 * 60 * 1000;
const FPL_GC    = 30 * 60 * 1000;

export function useSquad() {
  const profile = useProfile();
  const gw = useCurrentGameweek();
  const players = usePlayers();
  const teamId = profile.data?.fplTeamId ?? null;
  const gwId = gw.data ?? null;

  return useQuery({
    queryKey: queryKeys.squad(teamId ?? 0, gwId ?? 0),
    queryFn: async () => {
      const picks = await fplGet<PicksResponse>(`/entry/${teamId}/event/${gwId}/picks/`);
      return squadFromPicks(picks, players.data ?? []);
    },
    enabled: teamId !== null && gwId !== null && Array.isArray(players.data),
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

// Composition hook: assembles the APEX_TEAM shape minus Gaffer fields.
export function useApexTeam() {
  const profile = useProfile();
  const gwQ = useCurrentGameweek();
  const squadQ = useSquad();
  const managerQ = useManager();
  const fixturesQ = useFixturesByGw(gwQ.data ?? 0);

  const isPending  = profile.isPending || gwQ.isPending || squadQ.isPending || managerQ.isPending;
  const isError    = profile.isError   || gwQ.isError   || squadQ.isError   || managerQ.isError;
  const error      = profile.error ?? gwQ.error ?? squadQ.error ?? managerQ.error ?? null;
  const noTeam     = profile.data?.fplTeamId === null;

  const data = useMemo(() => {
    if (noTeam) return null;
    if (!squadQ.data || !managerQ.data || !gwQ.data) return undefined;
    return buildApexTeam(squadQ.data, managerQ.data, gwQ.data, fixturesQ.data);
  }, [noTeam, squadQ.data, managerQ.data, gwQ.data, fixturesQ.data]);

  return { data, isPending, isError, error, noTeam };
}

function buildApexTeam(
  squad: { starters: Player[]; bench: Player[] },
  manager: { name: string; gw: number; gwPoints: number; totalPoints: number; rank: number },
  currentGw: number,
  _fixturesByClub: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>> | undefined,
) {
  return {
    teamName: manager.name,
    gw: currentGw,
    gwPts: manager.gwPoints,
    totalPoints: manager.totalPoints,
    avgPoints: 0,        // FPL doesn't expose; Gaffer engine territory
    highestPoints: 0,    // same
    pitch:  groupByPosition(squad.starters),
    bench:  squad.bench.map((p): PitchPlayer => ({
      name: p.name, pts: null, gk: p.pos === 'GKP',
    })),
    captainPicks: [],
    captainApplied: squad.starters.find((p) => p.capt)?.name ?? '',
    suggestions: [],
    transfer: {
      freeTransfers: 1,
      squadValue: sumPrice([...squad.starters, ...squad.bench]),
      inBank: 0,
      nextGw: currentGw + 1,
      deadline: '',
      captain: parseCaptain(squad.starters.find((p) => p.capt)?.name ?? ''),
      transferSuggestions: [],
      chips: [],
      pitch: groupTransferPitch(squad.starters, squad.bench),
    },
  };
}

function groupByPosition(starters: Player[]): PitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  return order.map((pos) =>
    starters
      .filter((p) => p.pos === pos)
      .map((p): PitchPlayer => ({ name: p.name, pts: null, capt: p.capt, gk: pos === 'GKP' })),
  );
}

function groupTransferPitch(starters: Player[], bench: Player[]): TransferPitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  const all = [...starters, ...bench];
  return order.map((pos) =>
    all
      .filter((p) => p.pos === pos)
      .map((p): TransferPitchPlayer => ({
        name: p.name, p: p.p, pos: p.pos, club: p.club,
        tp: p.tp, f: p.f, own: p.own, gw: p.gw, capt: p.capt,
      })),
  );
}

function sumPrice(players: Player[]): number {
  return Math.round(players.reduce((s, p) => s + p.p, 0) * 10) / 10;
}

function parseCaptain(name: string) {
  const parts = name.split(' ');
  return { first: parts[0] ?? '', last: parts.slice(1).join(' '), num: 0 };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/api/squad.test.tsx`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/squad.ts src/__tests__/api/squad.test.tsx
git commit -m "feat(api): useSquad + useApexTeam composition (#21)"
```

---

### Task B7: Auth-error subscriber in `_layout.tsx`

When supabase-js fails with 401, refresh the session; if that also fails, sign out (existing `useProfileGate` routes back to onboarding).

**Files:**
- Modify: `src/app/_layout.tsx`
- Test: `src/__tests__/authErrorEffect.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/authErrorEffect.test.tsx
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthErrorBoundary } from '@/lib/auth/authErrorBoundary';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

describe('AuthErrorBoundary', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls refreshSession when a query throws 401', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthErrorBoundary />
      </QueryClientProvider>,
    );
    act(() => {
      client.getQueryCache().build(client, { queryKey: ['x'], queryFn: async () => {
        const e: any = new Error('unauth'); e.status = 401; throw e;
      } }).fetch();
    });
    await waitFor(() => expect(supabase.auth.refreshSession).toHaveBeenCalled());
  });

  it('calls signOut when refreshSession itself fails', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: {},
      error: { message: 'refresh failed' },
    });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthErrorBoundary />
      </QueryClientProvider>,
    );
    act(() => {
      client.getQueryCache().build(client, { queryKey: ['x'], queryFn: async () => {
        const e: any = new Error('unauth'); e.status = 401; throw e;
      } }).fetch();
    });
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/__tests__/authErrorEffect.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/auth/authErrorBoundary'`.

- [ ] **Step 3: Create the boundary component**

```tsx
// src/lib/auth/authErrorBoundary.tsx
//
// Side-effect component (renders null). Subscribes to the global
// QueryCache; on supabase-js 401 errors, attempts a session refresh,
// and on failure signs out. Existing useProfileGate handles routing.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

let inFlight = false;

async function handle401() {
  if (inFlight) return;
  inFlight = true;
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      await supabase.auth.signOut();
    }
  } finally {
    inFlight = false;
  }
}

export function AuthErrorBoundary() {
  const client = useQueryClient();
  useEffect(() => {
    const unsub = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const err = event.query.state.error as { status?: number } | null;
      if (err?.status === 401) void handle401();
    });
    return () => unsub();
  }, [client]);
  return null;
}
```

- [ ] **Step 4: Mount it in `_layout.tsx`**

In `src/app/_layout.tsx`, inside the `<QueryClientProvider>` return, add the boundary just inside the provider:

```tsx
return (
  <QueryClientProvider client={queryClient}>
    <AuthErrorBoundary />
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  </QueryClientProvider>
);
```

Add the import at the top:

```ts
import { AuthErrorBoundary } from '@/lib/auth/authErrorBoundary';
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test -- src/__tests__/authErrorEffect.test.tsx`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/authErrorBoundary.tsx src/app/_layout.tsx src/__tests__/authErrorEffect.test.tsx
git commit -m "feat(auth): 401-triggered refresh + signOut boundary (#21)"
```

---

## Phase C — Screen migration (per-screen, retire data.ts consumers)

For each migrating screen, the loop is: edit screen → adapt existing snapshot/render test → run.

### Task C1: `profile.tsx` → `useProfile()`

**Files:**
- Modify: `src/app/(home)/profile.tsx`
- Modify: `src/__tests__/profileScreen.test.tsx`

- [ ] **Step 1: Update `profile.tsx`**

Replace the `PROFILE` import + reads with `useProfile()`. Render a skeleton card on pending and the existing layout on success.

In `src/app/(home)/profile.tsx`:

Remove:
```ts
import { PROFILE } from '@/constants/data';
```

Add:
```ts
import { useProfile } from '@/api/profile';
import { Skeleton } from '@/components/ui/Skeleton';
```

Replace the entire function body's data references. Inside `ProfileModal`:

```tsx
const { data: profile, isPending } = useProfile();

if (isPending || !profile) {
  return (
    <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
      <Skeleton height={140} radius={20} />
      <View style={{ height: 16 }} />
      <Skeleton height={220} radius={20} />
    </View>
  );
}

const initials = `${profile.firstName[0]}${profile.lastName[0]}`;
```

Then every later reference to `PROFILE.<field>` becomes `profile.<field>`. The `useState(PROFILE.gender)` line becomes `useState(profile.gender)`.

- [ ] **Step 2: Update the profile screen test**

In `src/__tests__/profileScreen.test.tsx`, wrap renders in `renderWithProviders` and mock `useProfile`. Open the file, find each `render(...)` call, change to `renderWithProviders(...)`, add at top:

```tsx
import { renderWithProviders } from './utils/renderWithProviders';

jest.mock('@/api/profile', () => ({
  useProfile: jest.fn().mockReturnValue({
    data: {
      firstName: 'Apex',
      lastName: 'Gaffer',
      dob: '14 Aug 1990',
      gender: 'Prefer not to say',
      email: 'apex.gaffer@example.com',
      faceId: true,
      fplTeamId: null,
    },
    isPending: false,
  }),
}));
```

Add a new test for the pending state:

```tsx
it('renders skeletons while pending', () => {
  const { useProfile } = require('@/api/profile');
  (useProfile as jest.Mock).mockReturnValueOnce({ data: undefined, isPending: true });
  const { UNSAFE_queryAllByType } = renderWithProviders(<ProfileModal />);
  // Assert that at least one Animated.View is rendered as a skeleton.
  // Existing assertions in this file pattern this idiom; mirror it.
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- src/__tests__/profileScreen.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(home\)/profile.tsx src/__tests__/profileScreen.test.tsx
git commit -m "feat(profile): wire profile screen to useProfile() (#21)"
```

---

### Task C2: `top-picks.tsx` → `useTopPicks()` + `useCurrentGameweek()`, prop-drill into `PickRow`

`PickRow` currently reads `FIXTURES` and `SQUAD` directly. Lift those reads into `top-picks.tsx` and pass them as props.

**Files:**
- Modify: `src/app/(home)/(tabs)/top-picks.tsx`
- Modify: `src/components/picks/PickRow.tsx`
- Modify: `src/components/picks/PicksCard.tsx` (forward the new props)
- Modify: existing tests that touch `PickRow` (none today per grep) — only `components.test.tsx` mentions `Player` type, no edit needed.

- [ ] **Step 1: Edit `PickRow.tsx` to take props**

Replace imports:
```ts
import type { TopPickPlayer, Fixture, ClubCode } from '@/types/fpl';
```
(remove the `FIXTURES, SQUAD` imports)

Update the props interface:
```ts
interface PickRowProps {
  p: TopPickPlayer;
  zebra: boolean;
  last: boolean;
  tk: ApexTokens;
  dark: boolean;
  fixtures: Partial<Record<ClubCode, Fixture>>;
  squadNames: Set<string>;
}
```

In the component body, replace:
```ts
const SQUAD_NAMES = new Set([...SQUAD.starters, ...SQUAD.bench].map((p) => p.name));
```
with: nothing — it becomes a prop.

And:
```ts
const fx = FIXTURES[p.club] ?? { opp: '—', h: true };
const owned = SQUAD_NAMES.has(p.name);
```
becomes:
```ts
const fx = fixtures[p.club] ?? { opp: '—' as unknown as ClubCode, h: true };
const owned = squadNames.has(p.name);
```

(Note: the fallback `'—'` is a sentinel that was always cast to `ClubCode` informally; preserve that behavior.)

- [ ] **Step 2: Edit `PicksCard.tsx` to forward the new props**

Open `src/components/picks/PicksCard.tsx`, find where it renders `<PickRow ... />`, and add `fixtures` and `squadNames` to the `PicksCardProps` interface and the render call.

Inside the rendered JSX, change:
```tsx
<PickRow p={p} zebra={...} last={...} tk={tk} dark={dark} />
```
to:
```tsx
<PickRow p={p} zebra={...} last={...} tk={tk} dark={dark} fixtures={fixtures} squadNames={squadNames} />
```

- [ ] **Step 3: Edit `top-picks.tsx` to use hooks**

Replace:
```ts
import { TOP_PICKS, TEAM_INFO, Position } from '@/constants/data';
```
with:
```ts
import type { Position } from '@/types/fpl';
import { useTopPicks } from '@/api/players';
import { useCurrentGameweek } from '@/api/fixtures';
import { useFixturesByGw } from '@/api/fixtures';
import { useSquad } from '@/api/squad';
import { Skeleton } from '@/components/ui/Skeleton';
```

Inside `TopPicksTab()`:

```ts
const { data: gw }       = useCurrentGameweek();
const { data: topPicks, isPending: picksPending } = useTopPicks();
const { data: fixtures } = useFixturesByGw(gw ?? 0);
const { data: squad }    = useSquad();

const squadNames = new Set<string>(
  squad ? [...squad.starters, ...squad.bench].map((p) => p.name) : [],
);
```

Pending guard right before the `return (...)`:

```tsx
if (picksPending || !topPicks) {
  return (
    <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
      <Skeleton height={48} />
      <View style={{ height: 12 }} />
      <Skeleton height={48} />
      <View style={{ height: 12 }} />
      <Skeleton height={48} />
    </View>
  );
}
```

Replace `GW{TEAM_INFO.gw} LIVE` with `GW{gw ?? '—'} LIVE`.

Replace the `<PicksCard pos={pos} rows={TOP_PICKS[pos]} tk={tk} dark={dark} />` line with:
```tsx
<PicksCard
  pos={pos}
  rows={topPicks[pos]}
  tk={tk}
  dark={dark}
  fixtures={fixtures ?? {}}
  squadNames={squadNames}
/>
```

- [ ] **Step 4: Run tests; expect snapshot drift on top-picks screen test if one exists**

Run: `npm test -- src/__tests__/components.test.tsx`
Expected: PASS or trivial snapshot drift you accept (`--updateSnapshot` only if drift is purely cosmetic; investigate any structural change).

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(home\)/\(tabs\)/top-picks.tsx src/components/picks/PickRow.tsx src/components/picks/PicksCard.tsx
git commit -m "feat(top-picks): wire to useTopPicks + lift fixtures/squad into screen (#21)"
```

---

### Task C3: `team.tsx` → `useApexTeam()` + empty-state CTA

`team.tsx` is the most complex screen. Handle four states: pending, no-team, error, data.

**Files:**
- Modify: `src/app/(home)/(tabs)/team.tsx`
- Create: `src/components/team/LinkTeamCta.tsx`
- Test: `src/__tests__/teamScreen.test.tsx` (may not exist yet — create if absent)

- [ ] **Step 1: Create the CTA component**

```tsx
// src/components/team/LinkTeamCta.tsx
//
// Empty state shown when a user has no fpl_team_id set. CTA is non-functional
// in #21; #22 will wire it to the squad-import flow.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

interface LinkTeamCtaProps {
  tk: ApexTokens;
  variant: 'team' | 'transfer';
}

export function LinkTeamCta({ tk, variant }: LinkTeamCtaProps) {
  const title = variant === 'team' ? 'Link your FPL team' : 'Link your FPL team to plan transfers';
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Text style={[styles.title, { color: tk.text }]}>{title}</Text>
      <Text style={[styles.body, { color: tk.faint }]}>
        Paste your FPL team ID and we'll pull in your squad. Available in the next update.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled
        style={[styles.btn, { backgroundColor: tk.cardBorder, opacity: 0.6 }]}
      >
        <Text style={styles.btnText}>Coming in #22</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 24,
    padding: 20, borderRadius: 20, borderWidth: 1,
    gap: 10,
  },
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 20 },
  body:  { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  btn:   { paddingVertical: 12, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  btnText: { fontFamily: 'Archivo_700Bold', fontSize: 14, color: '#fff' },
});
```

- [ ] **Step 2: Edit `team.tsx`**

Replace:
```ts
import { APEX_TEAM, PitchPlayer } from '@/constants/data';
```
with:
```ts
import type { PitchPlayer } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { LinkTeamCta } from '@/components/team/LinkTeamCta';
import { Skeleton } from '@/components/ui/Skeleton';
```

Replace the existing module-level `const LIVE_GW = APEX_TEAM.gw;` etc. block — move it inside the component:

```tsx
export default function TeamTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const { data: at, isPending, noTeam, isError } = useApexTeam();

  if (noTeam) {
    return <View style={{ flex: 1, backgroundColor: t.bg }}><LinkTeamCta tk={tk} variant="team" /></View>;
  }
  if (isPending || !at) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <Skeleton height={48} />
        <View style={{ height: 12 }} />
        <Skeleton height={180} radius={20} />
        <View style={{ height: 12 }} />
        <Skeleton height={260} radius={20} />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <Text style={{ color: tk.text, fontFamily: 'Archivo_700Bold' }}>
          Could not reach FPL. Pull to retry.
        </Text>
      </View>
    );
  }

  const LIVE_GW = at.gw;
  const MIN_GW = 1;
  const MAX_GW = LIVE_GW + 1;
  // … the rest of the existing function body, unchanged, continues here.
}
```

The existing `const at = APEX_TEAM;` line gets removed (`at` comes from the hook now). All later references to `at.…` continue to work unchanged.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests pass. (If a `teamScreen.test.tsx` exists, wrap renders in `renderWithProviders` and mock `useApexTeam`; follow the C1 pattern.)

- [ ] **Step 4: Commit**

```bash
git add src/app/\(home\)/\(tabs\)/team.tsx src/components/team/LinkTeamCta.tsx
git commit -m "feat(team): wire to useApexTeam + empty-state CTA (#21)"
```

---

### Task C4: `transfer.tsx` → `useApexTeam()` + empty-state CTA

Mirrors C3 but on the Transfer tab.

**Files:**
- Modify: `src/app/(home)/(tabs)/transfer.tsx`

- [ ] **Step 1: Edit `transfer.tsx`**

Replace:
```ts
import { APEX_TEAM, TransferPitchPlayer } from '@/constants/data';
```
with:
```ts
import type { TransferPitchPlayer } from '@/types/fpl';
import { useApexTeam } from '@/api/squad';
import { LinkTeamCta } from '@/components/team/LinkTeamCta';
import { Skeleton } from '@/components/ui/Skeleton';
```

In the function body, replace the `const tr = APEX_TEAM.transfer;` line with:

```tsx
const { data: at, isPending, noTeam, isError } = useApexTeam();

if (noTeam) {
  return <View style={{ flex: 1, backgroundColor: tk.bg }}><LinkTeamCta tk={tk} variant="transfer" /></View>;
}
if (isPending || !at) {
  return (
    <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
      <Skeleton height={72} radius={20} />
      <View style={{ height: 12 }} />
      <Skeleton height={260} radius={20} />
    </View>
  );
}
if (isError) {
  return (
    <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
      <Text style={{ color: tk.text }}>Could not reach FPL. Pull to retry.</Text>
    </View>
  );
}
const tr = at.transfer;
```

Replace `APEX_TEAM.teamName` in the `TransferInfoCard` props with `at.teamName`.

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(home\)/\(tabs\)/transfer.tsx
git commit -m "feat(transfer): wire to useApexTeam + empty-state CTA (#21)"
```

---

### Task C5: `player/[name].tsx` → `useSquad()` + `useClubs()`

**Files:**
- Modify: `src/app/(home)/player/[name].tsx`

- [ ] **Step 1: Edit the file**

Replace:
```ts
import { APEX_TEAM, CLUBS } from '@/constants/data';
```
with:
```ts
import { useSquad } from '@/api/squad';
import { useClubs } from '@/api/clubs';
import { Skeleton } from '@/components/ui/Skeleton';
```

Inside the component, replace:
```ts
const player = APEX_TEAM.transfer.pitch.flat().find((p) => p.name === name);
```
with:
```ts
const { data: squad, isPending: squadPending } = useSquad();
const { data: clubs } = useClubs();

if (squadPending || !squad) {
  return (
    <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
      <Skeleton height={120} radius={20} />
      <View style={{ height: 12 }} />
      <Skeleton height={180} radius={20} />
    </View>
  );
}

const player = [...squad.starters, ...squad.bench].find((p) => p.name === name);
```

Replace `CLUBS[player.club]` with `clubs?.[player.club]`. The existing "Player not found" branch already handles missing `player`; mirror it for missing `club`:

```tsx
const club = clubs?.[player.club];
if (!club) {
  return <View style={[styles.empty, { backgroundColor: tk.bg }]}>
    <Text style={[styles.notFound, { color: tk.text }]}>Club not loaded</Text>
  </View>;
}
```

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(home\)/player/\[name\].tsx
git commit -m "feat(player-detail): wire to useSquad + useClubs (#21)"
```

---

### Task C6: Type-only import path swaps (mechanical)

These 11 files only import **types** from `@/constants/data`. Switch them to `@/types/fpl`. No logic change.

**Files:**
- Modify: `src/components/pitch/ApexPitch.tsx`
- Modify: `src/components/pitch/Pitch.tsx`
- Modify: `src/components/ui/PlayerToken.tsx`
- Modify: `src/components/ui/Kit.tsx`
- Modify: `src/components/picks/PicksCard.tsx` (already touched in C2 — verify only types import remains)
- Modify: `src/components/transfer/TransferPitch.tsx`
- Modify: `src/components/transfer/TransferSuggestionsCard.tsx`
- Modify: `src/components/transfer/ChipsRow.tsx`
- Modify: `src/components/team/CaptainPickCard.tsx`
- Modify: `src/components/team/ApexDugout.tsx`
- Modify: `src/components/team/SuggestionsCard.tsx`
- Modify: `src/utils/xpts.ts`
- Modify: `src/__tests__/components.test.tsx`

- [ ] **Step 1: For each file above, change the import**

In each file, change `from '@/constants/data'` to `from '@/types/fpl'` on the imports that pull only types. If the same import line pulls in both a type and a value, split it; the type half goes to `@/types/fpl`, and any remaining value uses are already handled by C1–C5 in their owner files.

For example, in `src/components/ui/Kit.tsx`:

```ts
// Before:
import { CLUBS, ClubCode } from '@/constants/data';
// After:
import type { ClubCode } from '@/types/fpl';
import { CLUB_COLORS } from '@/constants/clubColors';
```

Then replace `CLUBS[code]` reads inside the file with `CLUB_COLORS[code]` plus the `name` from a hook — except `Kit.tsx` only needs colors (no `name`), so swap `CLUBS[club]` → `CLUB_COLORS[club]` and drop any `.name` reference if the component doesn't use it.

(Run the suite after each batch; do not batch beyond a couple of files between test runs.)

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Verify no `@/constants/data` value imports remain in the listed files**

Run: `grep -rn "from '@/constants/data'" src/ | grep -v 'data\.test'`
Expected: every remaining hit is a `data.test.ts` reference (which we'll handle in Phase D). No production source file imports `@/constants/data` anymore.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor: switch type-only imports from constants/data to types/fpl (#21)"
```

---

## Phase D — Cleanup and verification

### Task D1: Delete data constants, rename `data.ts`

After Phase C, no production file imports values from `@/constants/data`. Time to remove the mock constants.

**Files:**
- Delete: `src/constants/data.ts`

- [ ] **Step 1: Verify nothing imports from `@/constants/data` anymore**

Run: `grep -rn "from '@/constants/data'" src/`
Expected: zero hits (test files using it will be updated in D2 below — verify them first).

If any hits remain, fix them before continuing.

- [ ] **Step 2: Delete `src/constants/data.ts`**

```bash
rm src/constants/data.ts
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A src/constants/data.ts
git commit -m "chore: remove mock constants/data.ts (#21)"
```

---

### Task D2: Replace `data.test.ts`

The old `src/__tests__/data.test.ts` asserted shape correctness on the mock constants. Replace with assertions against the hook adapters (which already have tests) and the `CLUB_COLORS` table.

**Files:**
- Modify: `src/__tests__/data.test.ts` (rewrite as `clubColors.test.ts`)
- Create: `src/__tests__/clubColors.test.ts`
- Delete: `src/__tests__/data.test.ts`

- [ ] **Step 1: Create `clubColors.test.ts`**

```ts
// src/__tests__/clubColors.test.ts
import { CLUB_COLORS } from '@/constants/clubColors';
import type { ClubCode } from '@/types/fpl';

const ALL_CODES: ClubCode[] = [
  'ARS','LIV','MCI','CHE','MUN','NEW','TOT',
  'AVL','NFO','BHA','BOU','BRE','CRY','EVE',
  'WOL','FUL','WHU',
];

describe('CLUB_COLORS', () => {
  it('covers every ClubCode', () => {
    for (const code of ALL_CODES) {
      expect(CLUB_COLORS[code]).toBeDefined();
    }
  });

  it('every entry uses hex strings for kit/kit2/ink', () => {
    for (const code of ALL_CODES) {
      const c = CLUB_COLORS[code];
      expect(c.kit).toMatch(/^#/);
      expect(c.kit2).toMatch(/^#/);
      expect(c.ink).toMatch(/^#/);
    }
  });
});
```

- [ ] **Step 2: Delete the old test file**

```bash
rm src/__tests__/data.test.ts
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/clubColors.test.ts src/__tests__/data.test.ts
git commit -m "test: replace data.test.ts with clubColors.test.ts (#21)"
```

---

### Task D3: Update remaining screen tests to wrap with `renderWithProviders`

Many of the auth-flow screen tests render screens that don't pull from `/api/*`. They don't strictly need the provider, but a render that descends into a child that *does* use a hook will throw. Audit and wrap.

**Files:**
- Modify: every `src/__tests__/*Screen.test.tsx` file that renders a route component.

- [ ] **Step 1: For each screen test that doesn't already use `renderWithProviders`, swap the helper**

In each file, change:
```ts
import { render } from '@testing-library/react-native';
```
to:
```ts
import { renderWithProviders as render } from './utils/renderWithProviders';
```

(Keeping the local name `render` minimizes downstream churn.)

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/
git commit -m "test: wrap screen renders in QueryClientProvider helper (#21)"
```

---

### Task D4: Acceptance verification

Confirm every criterion in the issue holds.

- [ ] **Step 1: Confirm no production files import `@/constants/data`**

Run: `grep -rn "from '@/constants/data'" src/`
Expected: zero hits.

- [ ] **Step 2: Confirm every tab and the player detail route still type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass. The number should land around 115 (+12 new tests across `fpl-client`, `players`, `fixtures`, `clubs`, `manager`, `squad`, `profile`, `Skeleton`, `authErrorBoundary`).

- [ ] **Step 4: Smoke-test the app locally**

Run: `npm start`

In the dev menu, exercise:

1. **Cold launch as a signed-in user with `fpl_team_id = null`:**
   - Profile tab renders profile data from `supabase.profiles`.
   - Top Picks tab renders skeleton then ranked players.
   - Team tab shows "Link your FPL team" CTA.
   - Transfer tab shows "Link your FPL team to plan transfers" CTA.

2. **Manually set `fpl_team_id` in the DB to a known FPL team ID (e.g. a popular manager's):**
   - Restart the app.
   - Team tab renders the pitch with players from the live FPL picks endpoint.
   - Transfer tab renders the transfer pitch.

3. **Simulate offline:**
   - Toggle airplane mode.
   - Confirm screens show the FPL-error card on tabs that fetch from FPL, but Top Picks still renders (DB-backed) if it had loaded earlier.

- [ ] **Step 5: Push the branch and open a PR**

```bash
git push -u origin <branch-name>
gh pr create --title "Replace mock data with live API (#21)" --body "$(cat <<'EOF'
## Summary
- Replaces `src/constants/data.ts` mock with TanStack Query hooks against Supabase + public FPL endpoints
- Adds `src/api/` module: `fpl-client.ts`, `players.ts`, `fixtures.ts`, `clubs.ts`, `manager.ts`, `squad.ts`, `profile.ts`, `queryKeys.ts`
- Moves shape types to `src/types/fpl.ts`; kit colors to `src/constants/clubColors.ts`
- Empty-state CTA on Team/Transfer tabs when `fpl_team_id` is null (unblocks #22)
- Gaffer recommendation fields return empty arrays; UI shows honest empty states

## Test plan
- [ ] `npm test` — all tests pass (~115)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Cold launch as user without linked team → CTA renders on Team/Transfer
- [ ] Set `profiles.fpl_team_id` to a real FPL team ID → Team/Transfer render live data
- [ ] Airplane mode → FPL-dependent tabs show retry card; cached DB data still visible

Closes #21
Follow-up: #80 (pre-launch cadence tuning); a Gaffer recommendation engine ticket to be filed separately

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Final commit verifying acceptance criteria checkboxes are all checked**

The issue #21 acceptance checkboxes will be checked when the PR merges:
- [ ] All five tabs render without using `data.ts` constants — verified by D4 Step 1
- [ ] Loading states show skeleton / spinner instead of empty layouts — `Skeleton` primitive used in screens C1–C5
- [ ] Auth failures route back to /(onboarding) — `AuthErrorBoundary` in B7
- [ ] All 103 tests updated or replaced with mocked-API equivalents — verified by D4 Step 3

---

## Notes for the implementing engineer

- **Read `docs/superpowers/specs/2026-06-11-fpl-live-data-layer-design.md` first.** It contains the why for every architectural choice — caching policy, FPL access pattern, scope cuts — and refers to load-bearing constraints in `docs/schema.md` and `docs/fpl-api.md`.
- **The FPL field quirks are real.** `now_cost` is in tenths of millions, `form`/`selected_by_percent`/`ep_next` come back as strings. Use `parseFloat`, divide by 10, and cover the empty-string case in tests (we do — see B2).
- **Don't add mutations.** This PR is read-only. Any urge to add a `useMutation` is a signal you're sliding into #22's scope.
- **Don't add a `fpl-proxy` Edge Function.** Hybrid decision: direct calls now. A proxy is a clean future swap behind `fpl-client.ts`'s base URL.
- **Stale times for FPL hooks are deliberately 15 minutes.** Issue #80 will tighten them before the 2026/27 season opens.
