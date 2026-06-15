import React from 'react';
import { renderWithProviders } from './utils/renderWithProviders';

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, pitchStyle: 'classic' }),
}));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));
// Heavy children rendered as null so the test only exercises GameweekScreen's own logic.
jest.mock('@/components/pitch/ApexPitch', () => ({ __esModule: true, ApexPitch: () => null }));
jest.mock('@/components/team/HeroCard', () => ({ __esModule: true, HeroCard: () => null }));
jest.mock('@/components/team/ApexDugout', () => ({ __esModule: true, ApexDugout: () => null }));
jest.mock('@/components/team/CaptainPickCard', () => ({ __esModule: true, CaptainPickCard: () => null }));
jest.mock('@/components/team/SuggestionsCard', () => ({ __esModule: true, SuggestionsCard: () => null }));
jest.mock('@/components/transfer/DeadlineBanner', () => ({ __esModule: true, DeadlineBanner: () => null }));
jest.mock('@/components/transfer/ChipsRow', () => ({ __esModule: true, ChipsRow: () => null }));
jest.mock('@/components/team/ApplyAllCard', () => ({ __esModule: true, ApplyAllCard: () => null }));

let mockLiveGw = 30;
let mockLiveFinished = false;
const makeTeam = (gw: number) => ({
  teamName: 'Test FC', gw, liveGw: mockLiveGw, liveGwFinished: mockLiveFinished,
  liveGwDataChecked: true, gwPts: 50, totalPoints: 1200, gwFinished: false,
  gwDataChecked: false, avgPoints: 45, highestPoints: 90,
  pitch: [], bench: [], captainPicks: [], captainApplied: '', suggestions: [],
  transfer: {
    freeTransfers: 1, squadValue: 100, inBank: 0, nextGw: gw + 1, deadline: '',
    captain: { first: '', last: '', num: 0 }, transferSuggestions: [], chips: [], pitch: [],
  },
});
jest.mock('@/api/squad', () => ({
  __esModule: true,
  useApexTeam: (gw?: number) => ({
    data: makeTeam(gw ?? mockLiveGw), isPending: false, isError: false, error: null, noTeam: false,
  }),
}));

import { GameweekScreen } from '@/components/team/GameweekScreen';

const baseProps = {
  width: 320, height: 640,
  savedCaptain: '', pendingCaptain: '', pendingSuggestions: {},
  onPickCaptain: jest.fn(), onToggleSuggestion: jest.fn(), onToggleAllSuggestions: jest.fn(),
  onUndo: jest.fn(), onConfirm: jest.fn(), onOpenPlayer: jest.fn(),
};

describe('GameweekScreen', () => {
  beforeEach(() => { mockLiveGw = 30; mockLiveFinished = false; });

  it('shows the gameweek label (pill) for the given gw', () => {
    const { getByText } = renderWithProviders(<GameweekScreen {...baseProps} gw={30} />);
    expect(getByText('Gameweek 30')).toBeTruthy();
  });

  it('does not render the paging arrows — those are fixed overlays in the shell', () => {
    const { queryByTestId } = renderWithProviders(<GameweekScreen {...baseProps} gw={30} />);
    expect(queryByTestId('gw-prev')).toBeNull();
    expect(queryByTestId('gw-next')).toBeNull();
  });
});
