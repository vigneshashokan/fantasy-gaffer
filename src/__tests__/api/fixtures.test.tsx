// src/__tests__/api/fixtures.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fixturesFromRows,
  currentGwFromEvents,
  eventStatsFromEvents,
  useCurrentGameweek,
  useEventLive,
  useEventStats,
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
      { event: 24, team_h: 1, team_a: 11 },
      { event: 24, team_h: 13, team_a: 6 },
    ];
    const result = fixturesFromRows(rows, clubByTeamId);
    expect(result.ARS).toEqual({ opp: 'LIV', h: true });
    expect(result.LIV).toEqual({ opp: 'ARS', h: false });
    expect(result.MCI).toEqual({ opp: 'CHE', h: true });
    expect(result.CHE).toEqual({ opp: 'MCI', h: false });
  });
});

describe('useCurrentGameweek', () => {
  it('returns current gw + stats + finished/dataChecked from bootstrap-static', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({
      events: [{
        id: 24, is_current: true, is_next: false, finished: true,
        data_checked: true, average_entry_score: 52, highest_score: 128,
      }],
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCurrentGameweek(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      gw: 24, avgPoints: 52, highestPoints: 128, finished: true, dataChecked: true,
    });
    expect(fplGet).toHaveBeenCalledWith('/bootstrap-static/');
  });

  it('defaults stats/flags to 0/false when bootstrap omits them', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({
      events: [{ id: 24, is_current: true, is_next: false, finished: false }],
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCurrentGameweek(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      gw: 24, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false,
    });
  });
});

describe('eventStatsFromEvents', () => {
  it('returns the requested event\'s stats', () => {
    const events = [
      { id: 23, is_current: false, is_next: false, finished: true,  data_checked: true,  average_entry_score: 48, highest_score: 124 },
      { id: 24, is_current: true,  is_next: false, finished: false, data_checked: false, average_entry_score: 52, highest_score: 88  },
    ];
    expect(eventStatsFromEvents(events, 23)).toEqual({
      gw: 23, avgPoints: 48, highestPoints: 124, finished: true, dataChecked: true,
    });
    expect(eventStatsFromEvents(events, 24)).toEqual({
      gw: 24, avgPoints: 52, highestPoints: 88, finished: false, dataChecked: false,
    });
  });

  it('defaults to 0/false for unknown gw', () => {
    expect(eventStatsFromEvents([], 5)).toEqual({
      gw: 5, avgPoints: 0, highestPoints: 0, finished: false, dataChecked: false,
    });
  });
});

describe('useEventStats', () => {
  it('derives per-gw stats from a single bootstrap fetch', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({
      events: [
        { id: 23, is_current: false, is_next: false, finished: true,  data_checked: true,  average_entry_score: 48, highest_score: 124 },
        { id: 24, is_current: true,  is_next: false, finished: false, data_checked: false, average_entry_score: 52, highest_score: 88  },
      ],
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEventStats(23), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      gw: 23, avgPoints: 48, highestPoints: 124, finished: true, dataChecked: true,
    });
  });

  it('stays idle when gw is 0', () => {
    (fplGet as jest.Mock).mockClear();
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEventStats(0), { wrapper });
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useEventLive', () => {
  it('fetches /event/{gw}/live/ and returns a Map of LivePlayerStat', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({
      elements: [
        { id: 401, stats: { total_points: 14, minutes: 90, starts: 1, goals_scored: 1, assists: 0, yellow_cards: 0, red_cards: 0, bonus: 3 } },
        { id: 233, stats: { total_points: 9, minutes: 72, starts: 1, goals_scored: 0, assists: 1, yellow_cards: 1, red_cards: 0, bonus: 0 } },
      ],
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEventLive(38), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/event/38/live/');
    expect(result.current.data?.get(401)?.points).toBe(14);
    expect(result.current.data?.get(233)?.assists).toBe(1);
  });

  it('stays idle when gw is 0', () => {
    (fplGet as jest.Mock).mockClear();
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEventLive(0), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
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
