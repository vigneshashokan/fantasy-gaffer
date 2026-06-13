// src/__tests__/api/manager.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  managerFromEntry,
  chipsFromHistory,
  gwPointsFromHistory,
  useManager,
  useManagerHistory,
  useChips,
} from '@/api/manager';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
jest.mock('@/api/profile', () => ({
  useProfile: jest.fn(),
}));

import { fplGet } from '@/api/fpl-client';
import { useProfile } from '@/api/profile';

beforeEach(() => {
  jest.clearAllMocks();
});

const ENTRY_FIXTURE = {
  id: 12345,
  name: 'Apex Pitch FC',
  current_event: 24,
  summary_event_points: 64,
  summary_overall_points: 1452,
  summary_overall_rank: 142_831,
};

const HISTORY_FIXTURE = {
  current: [
    { event: 22, points: 51, total_points: 1340, rank: 200_000 },
    { event: 23, points: 78, total_points: 1418, rank: 150_000 },
    { event: 24, points: 64, total_points: 1482, rank: 142_831 },
  ],
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

describe('gwPointsFromHistory', () => {
  it('returns the points for the requested gw', () => {
    expect(gwPointsFromHistory(HISTORY_FIXTURE, 23)).toBe(78);
    expect(gwPointsFromHistory(HISTORY_FIXTURE, 22)).toBe(51);
  });

  it('returns 0 when gw is not in history', () => {
    expect(gwPointsFromHistory(HISTORY_FIXTURE, 99)).toBe(0);
    expect(gwPointsFromHistory({ chips: [] }, 23)).toBe(0);
  });
});

describe('useManagerHistory', () => {
  it('fetches /entry/{id}/history/ and returns the raw payload', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      data: { fplTeamId: 12345 }, isSuccess: true,
    });
    (fplGet as jest.Mock).mockResolvedValueOnce(HISTORY_FIXTURE);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useManagerHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/history/');
    expect(result.current.data?.current?.[1]?.points).toBe(78);
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
