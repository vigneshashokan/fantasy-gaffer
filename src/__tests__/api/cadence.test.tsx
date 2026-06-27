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
jest.mock('@/api/profile', () => ({ useProfile: () => ({ data: { fplTeamId: 123 } }) }));
jest.mock('@/api/fixtures', () => ({
  useCurrentGameweek: () => ({ data: { gw: 5 } }),
  useEventStats: jest.fn(),
  useEventLive: jest.fn(),
  useFixturesByGw: jest.fn(),
  useAllFixtures: jest.fn(() => ({ data: undefined })),
}));
jest.mock('@/api/players', () => ({ usePlayers: () => ({ data: [] }) }));
jest.mock('@/api/projections', () => ({ useProjections: () => ({ data: undefined }) }));

import { renderHook } from '@testing-library/react-native';
import { useManager } from '@/api/manager';
import { useSquad } from '@/api/squad';

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
});
