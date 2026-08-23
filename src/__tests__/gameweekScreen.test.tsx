import React from 'react';
import { fireEvent } from '@testing-library/react-native';
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
let mockCarriedOverFrom: number | null = null;
const makeTeam = (gw: number): ApexTeamData => ({
  teamName: 'Test FC', gw, carriedOverFrom: mockCarriedOverFrom,
  liveGw: mockLiveGw, liveGwFinished: mockLiveFinished,
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
import type { ApexTeamData } from '@/api/squad';

const baseProps = {
  width: 320, height: 640,
  savedCaptain: '', pendingCaptain: '', pendingSuggestions: {},
  onPickCaptain: jest.fn(), onToggleSuggestion: jest.fn(), onToggleAllSuggestions: jest.fn(),
  onUndo: jest.fn(), onConfirm: jest.fn(), onOpenPlayer: jest.fn(),
};

describe('GameweekScreen', () => {
  beforeEach(() => { mockLiveGw = 30; mockLiveFinished = false; mockCarriedOverFrom = null; });

  // FPL never publishes the upcoming gameweek's picks, so useSquad borrows the
  // live squad to keep the advice reachable. The screen must SAY so: transfers
  // the user has already made are private until the deadline and will not
  // appear, and presenting a borrowed squad as current is the false-claim bug
  // #214 was filed for.
  it('discloses a carried-over squad on the upcoming gameweek', () => {
    mockCarriedOverFrom = 30;
    const { getByTestId } = renderWithProviders(<GameweekScreen {...baseProps} gw={31} />);
    expect(getByTestId('carried-over-note')).toBeTruthy();
    expect(getByTestId('carried-over-note').props.children).toContain('30');
  });

  it('shows no carry-over note when the gameweek has its own squad', () => {
    const { queryByTestId } = renderWithProviders(<GameweekScreen {...baseProps} gw={31} />);
    expect(queryByTestId('carried-over-note')).toBeNull();
  });

  it('shows the gameweek label (pill) for the given gw', () => {
    const { getByText } = renderWithProviders(<GameweekScreen {...baseProps} gw={30} />);
    expect(getByText('Gameweek 30')).toBeTruthy();
  });

  it('does not render the paging arrows — those are fixed overlays in the shell', () => {
    const { queryByTestId } = renderWithProviders(<GameweekScreen {...baseProps} gw={30} />);
    expect(queryByTestId('gw-prev')).toBeNull();
    expect(queryByTestId('gw-next')).toBeNull();
  });

  it('reports its vertical scroll offset (0 on mount, then live offsets)', () => {
    const onVerticalScroll = jest.fn();
    const { getByTestId } = renderWithProviders(
      <GameweekScreen {...baseProps} gw={30} onVerticalScroll={onVerticalScroll} />,
    );
    // Mount reports the top so the shell's per-gameweek record stays fresh.
    expect(onVerticalScroll).toHaveBeenCalledWith(0);

    fireEvent.scroll(getByTestId('gw-scroll'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 140 },
        contentSize: { width: 320, height: 1200 },
        layoutMeasurement: { width: 320, height: 640 },
      },
    });
    expect(onVerticalScroll).toHaveBeenLastCalledWith(140);
  });
});
