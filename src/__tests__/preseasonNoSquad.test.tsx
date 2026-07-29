// Reproduces the 2026/27 rollover failure.
//
// FPL serves a bootstrap with no is_current event during pre-season, so the app
// resolves the UPCOMING gameweek (GW1) and asks for picks that do not exist
// yet. A 404 there is not a failure — it means "this manager has no squad for
// this gameweek". Reporting it as an error gives the user a Retry button that
// cannot succeed until the deadline passes.
//
// Verified against the live API on 2026-07-26:
//   bootstrap-static/          -> is_current NONE, is_next GW1, 0 finished
//   /entry/1/                  -> 200 (entry ids survive rollover)
//   /entry/1/event/1/picks/    -> 404 {"detail":"Not found."}
//   /entry/1/history/          -> 200, current: []
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useApexTeam } from '@/api/squad';
import { makeTestQueryClient } from './utils/renderWithProviders';
import { FplFetchError } from '@/api/fpl-client';
import type { CurrentGameweek } from '@/api/fixtures';
import type { FplHistory } from '@/api/manager';
import type { TeamInfo } from '@/types/fpl';

jest.mock('@/api/fpl-client', () => ({
  ...jest.requireActual('@/api/fpl-client'),
  fplGet: jest.fn(),
}));
jest.mock('@/api/profile', () => ({ useProfile: jest.fn() }));
// No requireActual here: fixtures.ts imports @/lib/supabase, which pulls in
// AsyncStorage and fails to load under jest.
jest.mock('@/api/fixtures', () => ({
  useCurrentGameweek: jest.fn(),
  useEventStats: jest.fn(),
  useEventLive: jest.fn(),
  useFixturesByGw: jest.fn(),
  useAllFixtures: jest.fn(),
  useNextDeadline: jest.fn(),
  formatDeadline: (iso: string) => iso,
}));
jest.mock('@/api/players', () => ({ usePlayers: jest.fn() }));
jest.mock('@/api/projections', () => ({ useProjections: jest.fn() }));
jest.mock('@/api/manager', () => ({
  ...jest.requireActual('@/api/manager'),
  useManager: jest.fn(),
  useManagerHistory: jest.fn(),
}));

import { fplGet } from '@/api/fpl-client';
import { useProfile } from '@/api/profile';
import {
  useCurrentGameweek, useEventStats, useEventLive, useFixturesByGw, useAllFixtures,
  useNextDeadline,
} from '@/api/fixtures';
import { usePlayers } from '@/api/players';
import { useProjections } from '@/api/projections';
import { useManager, useManagerHistory } from '@/api/manager';

// GW1 is next; nothing is current or finished. Mirrors the live bootstrap.
const PRESEASON_GW: CurrentGameweek = {
  gw: 1, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false,
};
// useManager resolves to TeamInfo via managerFromEntry, not the raw FPL entry.
const MANAGER: TeamInfo = {
  name: 'Test FC', gw: 1, gwPoints: 0, totalPoints: 0, rank: 0, bank: 0,
};
// Mirrors the live /entry/{id}/history/ response pre-season: current is empty
// because no gameweek has been played. (`past` is not part of our shape.)
const HISTORY: FplHistory = { current: [], chips: [] };

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeTestQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useProfile as jest.Mock).mockReturnValue({
    data: { fplTeamId: 1234 }, isPending: false, isError: false, error: null,
  });
  (useCurrentGameweek as jest.Mock).mockReturnValue({
    data: PRESEASON_GW, isPending: false, isError: false, error: null,
  });
  (useEventStats as jest.Mock).mockReturnValue({ data: PRESEASON_GW });
  (useEventLive as jest.Mock).mockReturnValue({ data: undefined });
  (useFixturesByGw as jest.Mock).mockReturnValue({ data: undefined });
  (useAllFixtures as jest.Mock).mockReturnValue({ data: undefined });
  (useNextDeadline as jest.Mock).mockReturnValue({
    data: { gw: 1, iso: '2026-08-21T17:30:00Z' },
  });
  (usePlayers as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
  (useProjections as jest.Mock).mockReturnValue({ data: undefined });
  (useManager as jest.Mock).mockReturnValue({
    data: MANAGER, isPending: false, isError: false, error: null,
  });
  (useManagerHistory as jest.Mock).mockReturnValue({
    data: HISTORY, isPending: false, isError: false, error: null,
  });
});

// The is_next fallback that produces GW1 here is already covered by
// api/fixtures.test.tsx ("falls back to is_next when nothing is current").
describe('pre-season: a 404 on picks is a state, not an error', () => {
  it('reports noSquad instead of isError', async () => {
    (fplGet as jest.Mock).mockRejectedValue(new FplFetchError('FPL 404 for picks', 404));

    const { result } = renderHook(() => useApexTeam(), { wrapper });

    await waitFor(() => expect(result.current.noSquad).toBe(true));
    // Screens must not show "Could not reach FPL" with a Retry that cannot
    // succeed until the GW1 deadline.
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('still reports a genuine outage as an error', async () => {
    (fplGet as jest.Mock).mockRejectedValue(new FplFetchError('FPL 500', 500));

    const { result } = renderHook(() => useApexTeam(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // A real failure must not be disguised as an empty pre-season state.
    expect(result.current.noSquad).toBe(false);
  });

  it('does not claim noSquad when the squad loads normally', async () => {
    (fplGet as jest.Mock).mockResolvedValue({ picks: [] });

    const { result } = renderHook(() => useApexTeam(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.noSquad).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
