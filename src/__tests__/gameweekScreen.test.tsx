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
let mockCarriedOverFrom: number | null = null;
const makeTeam = (gw: number): ApexTeamData => ({
  teamName: 'Test FC', gw, carriedOverFrom: mockCarriedOverFrom,
  liveGw: mockLiveGw, liveGwFinished: mockLiveFinished,
  liveGwDataChecked: true, gwPts: 50, totalPoints: 1200, gwFinished: false,
  gwDataChecked: false, avgPoints: 45, highestPoints: 90,
  recentPoints: [58, 71, 49, 82, 64],
  projectionsReady: true,
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
import { apexTokens } from '@/constants/apexTokens';

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

  // The whole gameweek control — label and both chevrons — belongs to the
  // shell, so it stays put while these pages swipe beneath it. A page drawing
  // its own would give you two of them, scrolling out of step.
  it('renders no gameweek control of its own', () => {
    const { queryByText, queryByTestId } = renderWithProviders(
      <GameweekScreen {...baseProps} gw={30} />,
    );
    expect(queryByText('Gameweek 30')).toBeNull();
    expect(queryByTestId('gw-prev')).toBeNull();
    expect(queryByTestId('gw-next')).toBeNull();
  });

  // This fills the carousel, so it IS the My Team page background. It used to
  // paint the legacy theme bg while Top Picks and Transfer painted the apex
  // one, which made the three tabs visibly different colours.
  it('paints the same page background as the other tabs', () => {
    const { getByTestId } = renderWithProviders(<GameweekScreen {...baseProps} gw={30} />);
    const style = Object.assign({}, ...[getByTestId('gw-page').props.style].flat(4));
    expect(style.backgroundColor).toBe(apexTokens(true, 'classic').bg);
  });
});
