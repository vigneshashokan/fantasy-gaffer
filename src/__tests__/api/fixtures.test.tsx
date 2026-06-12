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
