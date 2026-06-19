// src/__tests__/api/squad.test.tsx
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { squadFromPicks, useSquad, transferChipsFromHistory, useApexTeam } from '@/api/squad';
import { makeTestQueryClient } from '../utils/renderWithProviders';
import type { Player } from '@/types/fpl';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
jest.mock('@/api/profile',    () => ({ useProfile: jest.fn() }));
jest.mock('@/api/fixtures',   () => ({ useCurrentGameweek: jest.fn(), useEventStats: jest.fn(), useEventLive: jest.fn(), useFixturesByGw: jest.fn() }));
jest.mock('@/api/players',    () => ({ usePlayers: jest.fn() }));
jest.mock('@/api/projections', () => ({ useProjections: jest.fn() }));
jest.mock('@/api/manager', () => ({
  ...jest.requireActual('@/api/manager'),
  useManager: jest.fn(),
  useManagerHistory: jest.fn(),
}));

import { fplGet } from '@/api/fpl-client';
import { useProfile } from '@/api/profile';
import { useCurrentGameweek, useEventStats, useEventLive, useFixturesByGw } from '@/api/fixtures';
import { usePlayers } from '@/api/players';
import { useProjections } from '@/api/projections';
import { useManager, useManagerHistory } from '@/api/manager';

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
  { id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1, status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640 },
  { id: '233', name: 'Saka',    pos: 'MID', club: 'ARS', p: 9.2,  f: 6.1, tp: 131, own: 38.6, gw: 7.2, status: 'a', news: '', chanceNext: null, ict: 288.1, bps: 510 },
  { id: '100', name: 'Sub',     pos: 'DEF', club: 'CHE', p: 4.0,  f: 4.0, tp: 30,  own: 1.0,  gw: 2.0, status: 'a', news: '', chanceNext: null, ict: 40.0,  bps: 90 },
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

describe('transferChipsFromHistory', () => {
  it('marks a played chip used and records the gameweek it was played', () => {
    const chips = transferChipsFromHistory({ chips: [{ name: 'bboost', event: 38 }] });
    const bb = chips.find((c) => c.name === 'Bench Boost');
    expect(bb?.state).toBe('used');
    expect(bb?.playedGw).toBe(38);
    // chips that weren't played stay idle with no gameweek
    const wc = chips.find((c) => c.name === 'Wildcard');
    expect(wc?.state).toBe('idle');
    expect(wc?.playedGw).toBeUndefined();
  });

  it('leaves every chip idle when none were played', () => {
    const chips = transferChipsFromHistory({ chips: [] });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.state === 'idle' && c.playedGw === undefined)).toBe(true);
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

// A full 15: 2 GKP, 5 DEF, 5 MID, 3 FWD. ids match PICKS below.
const ADVICE_PLAYERS: Player[] = [
  { id: '1', name: 'Keep', pos: 'GKP', club: 'ARS', p: 5, f: 4, tp: 30, own: 5, gw: 4, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100 },
  { id: '2', name: 'Res',  pos: 'GKP', club: 'CHE', p: 4, f: 3, tp: 20, own: 2, gw: 2, status: 'a', news: '', chanceNext: null, ict: 30, bps: 60 },
  { id: '3', name: 'D1', pos: 'DEF', club: 'LIV', p: 5, f: 4, tp: 40, own: 8, gw: 3, status: 'a', news: '', chanceNext: null, ict: 60, bps: 120 },
  { id: '4', name: 'D2', pos: 'DEF', club: 'MCI', p: 5, f: 4, tp: 38, own: 7, gw: 3, status: 'a', news: '', chanceNext: null, ict: 58, bps: 110 },
  { id: '5', name: 'D3', pos: 'DEF', club: 'NEW', p: 4, f: 3, tp: 30, own: 5, gw: 2.5, status: 'a', news: '', chanceNext: null, ict: 40, bps: 90 },
  { id: '6', name: 'D4', pos: 'DEF', club: 'TOT', p: 4, f: 3, tp: 28, own: 4, gw: 2, status: 'a', news: '', chanceNext: null, ict: 38, bps: 80 },
  { id: '7', name: 'D5', pos: 'DEF', club: 'AVL', p: 4, f: 2, tp: 20, own: 3, gw: 1.5, status: 'a', news: '', chanceNext: null, ict: 30, bps: 60 },
  { id: '8',  name: 'M1', pos: 'MID', club: 'ARS', p: 8, f: 6, tp: 90, own: 20, gw: 6, status: 'a', news: '', chanceNext: null, ict: 200, bps: 300 },
  { id: '9',  name: 'M2', pos: 'MID', club: 'LIV', p: 8, f: 6, tp: 88, own: 18, gw: 5.5, status: 'a', news: '', chanceNext: null, ict: 195, bps: 290 },
  { id: '10', name: 'M3', pos: 'MID', club: 'MCI', p: 7, f: 5, tp: 70, own: 12, gw: 5, status: 'a', news: '', chanceNext: null, ict: 170, bps: 250 },
  { id: '11', name: 'M4', pos: 'MID', club: 'CHE', p: 6, f: 4, tp: 55, own: 8, gw: 4, status: 'a', news: '', chanceNext: null, ict: 140, bps: 200 },
  { id: '12', name: 'M5', pos: 'MID', club: 'NEW', p: 5, f: 4, tp: 45, own: 6, gw: 3.5, status: 'a', news: '', chanceNext: null, ict: 120, bps: 170 },
  { id: '13', name: 'F1', pos: 'FWD', club: 'MCI', p: 12, f: 8, tp: 120, own: 40, gw: 7, status: 'a', news: '', chanceNext: null, ict: 280, bps: 380 },
  { id: '14', name: 'F2', pos: 'FWD', club: 'ARS', p: 9, f: 6, tp: 95, own: 25, gw: 6, status: 'a', news: '', chanceNext: null, ict: 230, bps: 320 },
  { id: '15', name: 'F3', pos: 'FWD', club: 'LIV', p: 8, f: 5, tp: 80, own: 18, gw: 5, status: 'a', news: '', chanceNext: null, ict: 200, bps: 280 },
];
// Realistic current XI: 3-5-2 (GK 1; DEF 3,4,5; MID 8-12; FWD 13,14).
// Bench: reserve GK 2, DEF 6, DEF 7, FWD 15. User wrongly captains DEF id 3.
const POS_BY_ID: Record<string, number> = {
  '1': 1, '3': 2, '4': 3, '5': 4, '8': 5, '9': 6, '10': 7, '11': 8, '12': 9, '13': 10, '14': 11,
  '2': 12, '6': 13, '7': 14, '15': 15,
};
const ADVICE_PICKS = {
  picks: ADVICE_PLAYERS.map((p) => ({
    element: Number(p.id),
    position: POS_BY_ID[p.id],
    is_captain: p.id === '3', // user wrongly captains a defender
    is_vice_captain: p.id === '4',
    multiplier: POS_BY_ID[p.id] <= 11 ? 1 : 0,
  })),
};

describe('useApexTeam advice wiring', () => {
  it('fills captainPicks and suggestions from the optimizer', async () => {
    (useProfile as jest.Mock).mockReturnValue({ data: { fplTeamId: 99 }, isPending: false, isError: false, error: null });
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false }, isPending: false, isError: false, error: null, isSuccess: true });
    (useEventStats as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 50, highestPoints: 99, finished: false, dataChecked: false } });
    (useEventLive as jest.Mock).mockReturnValue({ data: undefined });
    (useFixturesByGw as jest.Mock).mockReturnValue({ data: { MCI: { opp: 'LIV', h: true } } });
    (usePlayers as jest.Mock).mockReturnValue({ data: ADVICE_PLAYERS, isSuccess: true });
    (useManager as jest.Mock).mockReturnValue({ data: { name: 'Test FC', gw: 24, gwPoints: 50, totalPoints: 1200, rank: 1000 }, isPending: false, isError: false, error: null });
    (useManagerHistory as jest.Mock).mockReturnValue({ data: { current: [], chips: [] }, isPending: false, isError: false, error: null });
    (useProjections as jest.Mock).mockReturnValue({
      data: new Map([
        ['13', { p25: 4, p50: 7, p75: 11 }], // F1 — best, wide band
        ['8',  { p25: 4, p50: 6, p75: 8 }],  // M1
        ['14', { p25: 3, p50: 6, p75: 8 }],  // F2
      ]),
    });
    (fplGet as jest.Mock).mockResolvedValueOnce(ADVICE_PICKS);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useApexTeam(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());

    const team = result.current.data!;
    expect(team.captainPicks).toHaveLength(3);
    expect(team.captainPicks[0].name).toBe('F1'); // p50 7 × 2 = 14, beats the captained DEF
    expect(team.captainPicks[0].xp).toBe(14);
    // The user captained a defender (id 3); the optimizer recommends F1 instead.
    expect(team.captainApplied).toBe('D1');
    expect(Array.isArray(team.suggestions)).toBe(true);
  });
});

describe('useApexTeam transfer wiring', () => {
  it('fills transferSuggestions from the engine and threads bank', async () => {
    const candidate: Player = { id: '99', name: 'Upgrade', pos: 'DEF', club: 'BHA', p: 4.5, f: 5, tp: 50, own: 10, gw: 2, status: 'a', news: '', chanceNext: null, ict: 80, bps: 130 };
    (useProfile as jest.Mock).mockReturnValue({ data: { fplTeamId: 99 }, isPending: false, isError: false, error: null });
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false }, isPending: false, isError: false, error: null, isSuccess: true });
    (useEventStats as jest.Mock).mockReturnValue({ data: { gw: 24, avgPoints: 50, highestPoints: 99, finished: false, dataChecked: false } });
    (useEventLive as jest.Mock).mockReturnValue({ data: undefined });
    (useFixturesByGw as jest.Mock).mockReturnValue({ data: { BHA: { opp: 'LIV', h: true } } });
    (usePlayers as jest.Mock).mockReturnValue({ data: [...ADVICE_PLAYERS, candidate], isSuccess: true });
    (useManager as jest.Mock).mockReturnValue({ data: { name: 'Test FC', gw: 24, gwPoints: 50, totalPoints: 1200, rank: 1000, bank: 2.0 }, isPending: false, isError: false, error: null });
    (useManagerHistory as jest.Mock).mockReturnValue({ data: { current: [], chips: [] }, isPending: false, isError: false, error: null });
    (useProjections as jest.Mock).mockReturnValue({ data: new Map([['99', { p25: 4, p50: 5, p75: 6 }]]) });
    (fplGet as jest.Mock).mockResolvedValueOnce(ADVICE_PICKS);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useApexTeam(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());

    const tr = result.current.data!.transfer;
    expect(tr.inBank).toBe(2.0);
    expect(tr.transferSuggestions.length).toBe(1); // only one non-owned candidate (a DEF)
    expect(tr.transferSuggestions[0].in).toBe('Upgrade');
    expect(tr.transferSuggestions[0].out).toBe('D5'); // weakest owned DEF (id 7, ep_next 1.5)
  });
});
