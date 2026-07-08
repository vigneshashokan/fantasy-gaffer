// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseQuery = jest.fn((_opts: any) => ({ data: undefined, isPending: false, isError: false }));
// Spread requireActual so focusManager / useQueryClient / etc. stay real — only
// useQuery is stubbed to capture the options the hooks pass it.
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useQuery: (opts: any) => mockUseQuery(opts),
}));
jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
// Each mock below is intentionally a partial stand-in — useManager/useSquad
// (the hooks actually under test here) only read the one field shown; see #155.
jest.mock('@/api/profile', () => ({ useProfile: () => ({ data: { fplTeamId: 123 } satisfies Partial<Profile> }) }));
jest.mock('@/api/fixtures', () => ({
  useCurrentGameweek: () => ({ data: { gw: 5 } satisfies Partial<CurrentGameweek> }),
  useEventStats: jest.fn(),
  useEventLive: jest.fn(),
  useFixturesByGw: jest.fn(),
  useAllFixtures: jest.fn(() => ({ data: undefined })),
}));
jest.mock('@/api/players', () => ({ usePlayers: () => ({ data: [] as Player[] }) }));
jest.mock('@/api/projections', () => ({ useProjections: () => ({ data: undefined }) }));

import { renderHook } from '@testing-library/react-native';
import { useManager } from '@/api/manager';
import { useSquad } from '@/api/squad';
import type { Profile, Player } from '@/types/fpl';
import type { CurrentGameweek } from '@/api/fixtures';

describe('FPL hook cadence (#80)', () => {
  beforeEach(() => mockUseQuery.mockClear());

  it('useManager passes a 5-minute staleTime', () => {
    renderHook(() => useManager());
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 5 * 60 * 1000 }),
    );
  });

  it('useSquad passes a 60-second staleTime', () => {
    renderHook(() => useSquad());
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 60 * 1000 }),
    );
  });

  it('useManager no longer overrides gcTime (inherits the 24h default)', () => {
    renderHook(() => useManager());
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.gcTime).toBeUndefined();
  });

  it('useSquad no longer overrides gcTime (inherits the 24h default)', () => {
    renderHook(() => useSquad());
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.gcTime).toBeUndefined();
  });
});
