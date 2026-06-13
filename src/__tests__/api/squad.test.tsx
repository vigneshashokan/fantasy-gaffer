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

beforeEach(() => {
  jest.clearAllMocks();
});

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

  it('carries the pick multiplier onto each enriched player', () => {
    const result = squadFromPicks(PICKS_FIXTURE, PLAYERS_FIXTURE);
    const haaland = result.starters.find((p) => p.name === 'Haaland');
    const saka    = result.starters.find((p) => p.name === 'Saka');
    const sub     = result.bench.find((p) => p.name === 'Sub');
    expect(haaland?.multiplier).toBe(2);
    expect(saka?.multiplier).toBe(1);
    expect(sub?.multiplier).toBe(0);
  });
});

describe('useSquad', () => {
  it('fetches when fpl_team_id and currentGw are both set', async () => {
    (useProfile as jest.Mock).mockReturnValue({ data: { fplTeamId: 12345 }, isSuccess: true });
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false }, isSuccess: true });
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
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false }, isSuccess: true });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE, isSuccess: true });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSquad(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });
});
