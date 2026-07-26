// src/__tests__/api/teamPreview.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  composePreview,
  useTeamPreview,
  type Preview,
} from '@/api/teamPreview';
import { makeTestQueryClient } from '../utils/renderWithProviders';
import type { Player } from '@/types/fpl';
import type { CurrentGameweek } from '@/api/fixtures';
import { FplFetchError } from '@/api/fpl-client';

jest.mock('@/api/fpl-client', () => ({
  fplGet: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FplFetchError: class FplFetchError extends Error {
    status: number | null;
    constructor(message: string, status: number | null) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock('@/api/players',   () => ({ usePlayers: jest.fn() }));
jest.mock('@/api/fixtures',  () => ({ useCurrentGameweek: jest.fn() }));

import { fplGet } from '@/api/fpl-client';
import { usePlayers } from '@/api/players';
import { useCurrentGameweek } from '@/api/fixtures';

beforeEach(() => {
  jest.clearAllMocks();
});

const ENTRY_FIXTURE = {
  id: 12345,
  name: 'Apex Pitch FC',
  player_first_name: 'Vignesh',
  player_last_name: 'A.',
  summary_overall_rank: 142831,
  summary_overall_points: 1452,
};

const PICKS_FIXTURE = {
  picks: [
    { element: 1,  position: 1,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 2,  position: 2,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 3,  position: 3,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 4,  position: 4,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 5,  position: 5,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 6,  position: 6,  is_captain: false, is_vice_captain: true,  multiplier: 1 },
    { element: 7,  position: 7,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 8,  position: 8,  is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 9,  position: 9,  is_captain: true,  is_vice_captain: false, multiplier: 2 },
    { element: 10, position: 10, is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 11, position: 11, is_captain: false, is_vice_captain: false, multiplier: 1 },
    { element: 12, position: 12, is_captain: false, is_vice_captain: false, multiplier: 0 },
    { element: 13, position: 13, is_captain: false, is_vice_captain: false, multiplier: 0 },
    { element: 14, position: 14, is_captain: false, is_vice_captain: false, multiplier: 0 },
    { element: 15, position: 15, is_captain: false, is_vice_captain: false, multiplier: 0 },
  ],
};

// The REAL useCurrentGameweek().data shape (CurrentGameweek object, not a bare
// gw number) — mocking `{ data: 24 }` here is what let the [object Object]
// picks-URL regression ship (PR #84 changed the hook's shape; the old mock
// kept this suite green). The type annotation makes tsc break on the next
// shape drift — jest.mock erases types, so the literal alone wouldn't.
const GW_FIXTURE: CurrentGameweek = { gw: 24, avgPoints: 52, highestPoints: 118, finished: false, dataChecked: false };

const PLAYERS_FIXTURE: Player[] = Array.from({ length: 15 }, (_, i) => ({
  id: String(i + 1),
  name: `P${i + 1}`,
  pos: i === 0 || i === 11 ? 'GKP' : i < 4 ? 'DEF' : i < 8 ? 'MID' : 'FWD',
  club: 'ARS',
  p: 5.0, f: 5.0, tp: 50, own: 5.0, gw: 5.0,
  status: 'a', news: '', chanceNext: null, ict: 100.0, bps: 100,
}));

describe('composePreview', () => {
  it('maps entry + picks + players into Preview with 11 starters / 4 bench', () => {
    const result = composePreview(ENTRY_FIXTURE, PICKS_FIXTURE, PLAYERS_FIXTURE);
    expect(result.teamName).toBe('Apex Pitch FC');
    expect(result.managerName).toBe('Vignesh A.');
    expect(result.rank).toBe(142831);
    expect(result.totalPoints).toBe(1452);
    expect(result.starters).toHaveLength(11);
    expect(result.bench).toHaveLength(4);
  });

  it('marks captain and vice on the matching starters and surfaces captain name', () => {
    const result = composePreview(ENTRY_FIXTURE, PICKS_FIXTURE, PLAYERS_FIXTURE);
    const capt = result.starters.find((p) => p.capt);
    const vice = result.starters.find((p) => p.vice);
    expect(capt?.name).toBe('P9');
    expect(vice?.name).toBe('P6');
    expect(result.captainName).toBe('P9');
  });

  it('drops picks whose element id is missing from the players lookup', () => {
    const result = composePreview(ENTRY_FIXTURE, PICKS_FIXTURE, PLAYERS_FIXTURE.slice(0, 5));
    expect(result.starters).toHaveLength(5);
    expect(result.bench).toHaveLength(0);
  });

  it('falls back to empty captain name when no captain pick resolves', () => {
    const picksNoCapt = { picks: PICKS_FIXTURE.picks.map((p) => ({ ...p, is_captain: false })) };
    const result = composePreview(ENTRY_FIXTURE, picksNoCapt, PLAYERS_FIXTURE);
    expect(result.captainName).toBe('');
  });
});

describe('useTeamPreview', () => {
  it('stays idle while currentGw or players is missing', () => {
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: undefined });
    (usePlayers as jest.Mock).mockReturnValue({ data: undefined });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTeamPreview(12345), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });

  // Pre-season (and any gameweek before this manager joined) FPL has no picks
  // and 404s. Failing the whole preview told users with a VALID id that their
  // team could not be found — connect-team maps a 404 to exactly that copy —
  // which blocked linking entirely between seasons.
  it('links successfully when the squad does not exist yet (picks 404)', async () => {
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: GW_FIXTURE });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE });
    (fplGet as jest.Mock)
      .mockResolvedValueOnce(ENTRY_FIXTURE)
      .mockRejectedValueOnce(new FplFetchError('FPL 404 for picks', 404));

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTeamPreview(12345), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    // Manager identity still comes through, so the user can confirm the link.
    expect(result.current.data?.teamName).toBe(ENTRY_FIXTURE.name);
    expect(result.current.data?.starters).toEqual([]);
    expect(result.current.data?.bench).toEqual([]);
  });

  // A genuinely wrong id must still fail, or the 404 copy becomes a lie in the
  // other direction.
  it('still errors when the entry itself is missing', async () => {
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: GW_FIXTURE });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE });
    (fplGet as jest.Mock)
      .mockRejectedValueOnce(new FplFetchError('FPL 404 for entry', 404))
      .mockRejectedValueOnce(new FplFetchError('FPL 404 for picks', 404));

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTeamPreview(999999999), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(404);
  });

  it('fetches both endpoints when ready and returns the composed preview', async () => {
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: GW_FIXTURE });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE });
    (fplGet as jest.Mock)
      .mockResolvedValueOnce(ENTRY_FIXTURE)
      .mockResolvedValueOnce(PICKS_FIXTURE);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTeamPreview(12345), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/');
    expect(fplGet).toHaveBeenCalledWith('/entry/12345/event/24/picks/');
    const data = result.current.data as Preview;
    expect(data.teamName).toBe('Apex Pitch FC');
    expect(data.starters).toHaveLength(11);
  });

  it('does not retry on failure (retry: false)', async () => {
    (useCurrentGameweek as jest.Mock).mockReturnValue({ data: GW_FIXTURE });
    (usePlayers as jest.Mock).mockReturnValue({ data: PLAYERS_FIXTURE });
    const err = new FplFetchError('boom', 404);
    (fplGet as jest.Mock).mockRejectedValue(err);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTeamPreview(12345), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as FplFetchError).status).toBe(404);
    expect(fplGet).toHaveBeenCalledTimes(2);
  });
});
