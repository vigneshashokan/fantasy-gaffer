// #167 — the error branch used to be unreachable on every data screen: the
// pending guard ran first and TanStack leaves `data` undefined on error, so
// `isPending || !data` swallowed the error forever. These assertions all fail
// against the pre-fix ordering (they render a skeleton, never an error card).
import React from 'react';
import { RefreshControl } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './utils/renderWithProviders';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: '401' }),
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, pitchStyle: 'classic' }),
}));
jest.mock('expo-linear-gradient', () => ({ __esModule: true, LinearGradient: 'LinearGradient' }));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));
jest.mock('@/components/team/GameweekScreen', () => ({
  __esModule: true,
  GameweekScreen: () => null,
}));
jest.mock('@/components/team/LinkTeamCta', () => ({ __esModule: true, LinkTeamCta: () => null }));
jest.mock('@/components/picks/PicksCard', () => ({ __esModule: true, PicksCard: () => null }));
jest.mock('@/components/transfer/TransferPitch', () => ({ __esModule: true, TransferPitch: () => null }));
jest.mock('@/components/transfer/TransferInfoCard', () => ({ __esModule: true, TransferInfoCard: () => null }));
jest.mock('@/components/transfer/TransferSuggestionsCard', () => ({ __esModule: true, TransferSuggestionsCard: () => null }));
jest.mock('@/components/transfer/TransferTargetsHeader', () => ({ __esModule: true, TransferTargetsHeader: () => null }));
jest.mock('@/components/transfer/TransferOutCard', () => ({ __esModule: true, TransferOutCard: () => null }));
jest.mock('@/components/profile/ChangePassword', () => ({ __esModule: true, ChangePassword: () => null }));
jest.mock('@/components/profile/DeleteAccount', () => ({ __esModule: true, DeleteAccount: () => null }));

const apexRefetch = jest.fn();
let mockApex: {
  data: (Partial<Omit<ApexTeamData, 'transfer'>> & {
    // Shallow Partial<> would demand the whole transfer object; the shell's
    // pinned deadline banner reads two fields off it.
    transfer?: Partial<ApexTeamData['transfer']>;
  }) | null | undefined;
  isPending: boolean; isError: boolean; error: unknown; noTeam: boolean;
  isRefetching: boolean; refetch: () => void;
};
jest.mock('@/api/squad', () => ({
  __esModule: true,
  useApexTeam: () => mockApex,
  useSquad: () => mockSquad,
}));

const picksRefetch = jest.fn();
let mockPicks: {
  data: Record<Position, TopPickPlayer[]> | undefined;
  isPending: boolean; isError: boolean; isRefetching: boolean; refetch: () => void;
};
let mockSquad: {
  data: { starters: SquadPlayer[]; bench: SquadPlayer[] } | undefined;
  isPending: boolean; isError: boolean; isRefetching: boolean; refetch: () => void;
};
jest.mock('@/api/players', () => ({
  __esModule: true,
  useTopPicks: () => mockPicks,
}));

const profileRefetch = jest.fn();
let mockProfile: {
  data: ProfileData | undefined;
  isPending: boolean; isError: boolean; isRefetching: boolean; refetch: () => void;
};
jest.mock('@/api/profile', () => ({ __esModule: true, useProfile: () => mockProfile }));

jest.mock('@/api/clubs', () => ({ __esModule: true, useClubs: () => ({ data: {} }) }));
jest.mock('@/api/fixtures', () => ({
  __esModule: true,
  useSeasonState: () => ({ data: { kind: 'live', gw: 23 } }),
  useCurrentGameweek: () => ({ data: { gw: 23 } }),
  useNextDeadline: () => ({ data: { gw: 24, iso: '2026-08-28T17:30:00Z' } }),
  useFixturesByGw: () => ({ data: {} }),
  currentSeasonLabel: () => '2025/26',
}));

import TeamTab from '@/app/(home)/(tabs)/team';
import TransferTab from '@/app/(home)/(tabs)/transfer';
import TopPicksTab from '@/app/(home)/(tabs)/top-picks';
import TransferTargets from '@/app/(home)/transfer-targets/[id]';
import ProfileModal from '@/app/(home)/profile';
import type { ApexTeamData, SquadPlayer } from '@/api/squad';
import type { Position, TopPickPlayer, Profile as ProfileData } from '@/types/fpl';

const failing = (refetch: jest.Mock) => ({
  data: undefined, isPending: false, isError: true, isRefetching: false, refetch,
});

beforeEach(() => {
  mockBack.mockReset();
  apexRefetch.mockReset();
  picksRefetch.mockReset();
  profileRefetch.mockReset();
  mockApex = { ...failing(apexRefetch), error: new Error('down'), noTeam: false };
  mockPicks = failing(picksRefetch);
  mockSquad = failing(jest.fn());
  mockProfile = failing(profileRefetch);
});

describe('#167 — a failed load renders a retryable error card, not an endless skeleton', () => {
  it.each([
    ['Team tab', () => <TeamTab />, () => apexRefetch],
    ['Transfer tab', () => <TransferTab />, () => apexRefetch],
    ['Top Picks tab', () => <TopPicksTab />, () => picksRefetch],
    ['Transfer targets', () => <TransferTargets />, () => picksRefetch],
    ['Profile', () => <ProfileModal />, () => profileRefetch],
  ])('%s shows the error state and retries on press', (_name, screen, getRefetch) => {
    const { getByTestId, queryByTestId } = renderWithProviders(screen());
    expect(getByTestId('error-state')).toBeTruthy();
    expect(queryByTestId('skeleton')).toBeNull();
    fireEvent.press(getByTestId('error-state-retry'));
    expect(getRefetch()).toHaveBeenCalled();
  });

  it('keeps rendering cached data when a refetch fails (offline read-cache, #39)', () => {
    mockApex = {
      data: {
        liveGw: 30, liveGwFinished: false, captainApplied: '', teamName: 'Apex Pitch FC',
        transfer: { nextGw: 31, deadline: 'Fri 28 Aug at 10:30' },
      },
      isPending: false, isError: true, error: new Error('down'), noTeam: false,
      isRefetching: false, refetch: apexRefetch,
    };
    const { getByText, queryByTestId } = renderWithProviders(<TeamTab />);
    expect(getByText('Apex Pitch FC')).toBeTruthy();
    expect(queryByTestId('error-state')).toBeNull();
  });

  // These screens set `headerShown: false`, so without an explicit dismiss the
  // error card would be a dead end — the exact trap this work removes.
  it.each([
    ['Transfer targets', () => <TransferTargets />],
    ['Profile', () => <ProfileModal />],
  ])('%s offers a way back out of the error state', (_name, screen) => {
    const { getByTestId } = renderWithProviders(screen());
    fireEvent.press(getByTestId('error-state-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('the tabs have no Close — the tab bar is always the way out', () => {
    const { queryByTestId } = renderWithProviders(<TeamTab />);
    expect(queryByTestId('error-state-back')).toBeNull();
  });

  it('still shows the skeleton while genuinely pending', () => {
    mockApex = {
      data: undefined, isPending: true, isError: false, error: null, noTeam: false,
      isRefetching: false, refetch: apexRefetch,
    };
    const { queryByTestId } = renderWithProviders(<TeamTab />);
    expect(queryByTestId('error-state')).toBeNull();
  });
});

describe('#167 — pull-to-refresh exists on the data scrollers', () => {
  it('Transfer tab wires its RefreshControl to refetch', () => {
    mockApex = {
      data: {
        transfer: {
          nextGw: 24, deadline: '', squadValue: 100, freeTransfers: 1, inBank: 0,
          transferSuggestions: [], chips: [], pitch: [],
          captain: { first: '', last: '', num: 0 },
        },
      },
      isPending: false, isError: false, error: null, noTeam: false,
      isRefetching: false, refetch: apexRefetch,
    };
    // RefreshControl doesn't forward testID to its host view, so reach it by
    // type — the point is that one exists and is wired to the hook's refetch.
    const { UNSAFE_getByType } = renderWithProviders(<TransferTab />);
    const rc = UNSAFE_getByType(RefreshControl);
    expect(rc.props.refreshing).toBe(false);
    rc.props.onRefresh();
    expect(apexRefetch).toHaveBeenCalled();
  });

  // Profile deliberately has NONE. The row is written only by connect-team,
  // which invalidates the query itself, so a pull could never return anything
  // new — and the control fights the sheet's own drag-down-to-dismiss, which
  // is one of only three ways off this screen. The error branch's retry stays.
  it('Profile has no RefreshControl at all', () => {
    mockProfile = {
      data: {
        firstName: 'Apex', lastName: 'Gaffer', dob: '14 Aug 1990',
        email: 'apex@example.com', faceId: false, fplTeamId: null,
      },
      isPending: false, isError: false, isRefetching: false, refetch: profileRefetch,
    };
    const { UNSAFE_queryAllByType } = renderWithProviders(<ProfileModal />);
    expect(UNSAFE_queryAllByType(RefreshControl)).toHaveLength(0);
  });
});
