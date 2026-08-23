import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, pitchStyle: 'realistic' }),
}));
const mockApexArg = jest.fn();
jest.mock('@/api/squad', () => ({
  __esModule: true,
  useApexTeam: (gw?: number) => {
    mockApexArg(gw);
    return ({
    data: {
      transfer: {
        nextGw: 24, deadline: '', squadValue: 100, freeTransfers: 1, inBank: 0,
        transferSuggestions: [], pitch: [[]],
      } satisfies Partial<ApexTeamData['transfer']>,
    },
    isPending: false, isError: false, noTeam: false,
  });
  },
}));
jest.mock('@/api/fixtures', () => ({
  __esModule: true,
  useSeasonState: () => ({ data: { kind: 'live', gw: 23 } }),
  useNextDeadline: () => ({ data: { gw: 24, iso: '2026-08-28T17:30:00Z' } }),
  currentSeasonLabel: () => '2025/26',
}));

// Stub presentational children so only navigation wiring is under test.
jest.mock('@/components/ui/TabHeader', () => ({ __esModule: true, TabHeader: () => null }));
jest.mock('@/components/transfer/DeadlineBanner', () => ({ __esModule: true, DeadlineBanner: () => null }));
jest.mock('@/components/ui/SeasonCompleteBanner', () => ({ __esModule: true, SeasonCompleteBanner: () => null }));
jest.mock('@/components/transfer/TransferInfoCard', () => ({ __esModule: true, TransferInfoCard: () => null }));
jest.mock('@/components/transfer/TransferSuggestionsCard', () => ({ __esModule: true, TransferSuggestionsCard: () => null }));
jest.mock('@/components/team/ApplyAllCard', () => ({ __esModule: true, ApplyAllCard: () => null }));
jest.mock('@/components/team/LinkTeamCta', () => ({ __esModule: true, LinkTeamCta: () => null }));
jest.mock('@/components/transfer/TransferPitch', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    TransferPitch: ({ onPlayerPress }: { onPlayerPress: (p: { id: string }) => void }) =>
      React.createElement(Pressable, { testID: 'pitch-press', onPress: () => onPlayerPress({ id: '401' }) }),
  };
});

import TransferTab from '@/app/(home)/(tabs)/transfer';
import type { ApexTeamData } from '@/api/squad';

describe('Transfer tab navigation', () => {
  beforeEach(() => { mockPush.mockReset(); mockApexArg.mockReset(); });

  // The tab has no carousel, so it cannot anchor on "the page being viewed" the
  // way GameweekScreen does (#168). Left on the default it anchored on the LIVE
  // gameweek — already in progress and unactionable — scoring its 3-gameweek
  // window over [live, live+1, live+2] and captioning it with the next
  // deadline. Anchor on the gameweek transfers are actually for.
  it('anchors on the next deadline, not the live gameweek', () => {
    render(<TransferTab />);
    expect(mockApexArg).toHaveBeenCalledWith(24);
  });
  it('pushes the transfer-targets route when a pitch player is pressed', () => {
    const { getByTestId } = render(<TransferTab />);
    fireEvent.press(getByTestId('pitch-press'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(home)/transfer-targets/[id]',
      params: { id: '401' },
    });
  });
});
