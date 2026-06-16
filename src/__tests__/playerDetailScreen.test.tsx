import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './utils/renderWithProviders';

const mockBack = jest.fn();
let mockParams: { id?: string; gw?: string } = { id: '401' };

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('@/components/ui/Kit', () => ({ __esModule: true, Kit: () => null }));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));

const PLAYER = {
  id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI',
  p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
  status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640,
};
let mockPlayers: { data: unknown; isPending: boolean } = { data: [PLAYER], isPending: false };
jest.mock('@/api/players', () => ({ __esModule: true, usePlayers: () => mockPlayers }));
jest.mock('@/api/clubs', () => ({
  __esModule: true,
  useClubs: () => ({ data: { MCI: { name: 'Man City', kit: '#fff', kit2: '#fff', ink: '#000' } } }),
  useClubCodeByTeamId: () => ({ data: { 1: 'ARS', 13: 'MCI' } }),
}));

let mockSummary: {
  isPending: boolean; isError: boolean; refetch: jest.Mock; data: unknown;
};
jest.mock('@/api/playerSummary', () => {
  const actual = jest.requireActual('@/api/playerSummary');
  return { __esModule: true, ...actual, useElementSummary: () => mockSummary };
});

import PlayerDetail from '@/app/(home)/player/[id]';

const freshSummary = () => ({
  isPending: false,
  isError: false,
  refetch: jest.fn(),
  data: {
    history: [
      { round: 4, total_points: 8 },
      { round: 5, total_points: 12 },
    ],
    fixtures: [{ event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 }],
  },
});

describe('Player detail screen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockParams = { id: '401' };
    mockPlayers = { data: [PLAYER], isPending: false };
    mockSummary = freshSummary();
  });

  it('renders hero, key stats, form sparkline and the resolved next fixture', () => {
    const { getByText, queryByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('Haaland')).toBeTruthy();
    expect(getByText('Man City · FWD')).toBeTruthy();
    expect(getByText('ICT')).toBeTruthy();
    expect(getByText('ARS')).toBeTruthy();
    expect(queryByText('Unavailable')).toBeNull();
    expect(queryByText('Doubtful')).toBeNull();
  });

  it('shows the availability banner for a flagged player', () => {
    mockPlayers = {
      data: [{ ...PLAYER, status: 'i', news: 'Hamstring injury', chanceNext: 25 }],
      isPending: false,
    };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('25% to play')).toBeTruthy();
    expect(getByText('Hamstring injury')).toBeTruthy();
  });

  it('shows not-found when the id is not in the pool', () => {
    mockParams = { id: '999' };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('Player not found')).toBeTruthy();
  });

  it('shows an inline retry and no orphan section headings when the summary fails', () => {
    const refetch = jest.fn();
    mockSummary = { isPending: false, isError: true, refetch, data: undefined };
    const { getByText, queryByText } = renderWithProviders(<PlayerDetail />);
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
    expect(queryByText('Last 5 gameweeks')).toBeNull();
    expect(queryByText('Next 5 fixtures')).toBeNull();
  });

  it('shows section headings and skeletons (no content, no retry) while the summary loads', () => {
    mockSummary = { isPending: true, isError: false, refetch: jest.fn(), data: undefined };
    const { getByText, queryByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('Last 5 gameweeks')).toBeTruthy();
    expect(getByText('Next 5 fixtures')).toBeTruthy();
    expect(queryByText('Retry')).toBeNull();
    expect(queryByText('ARS')).toBeNull();
  });

  it('replaces season tiles with the gameweek breakdown when a gw param is present', () => {
    mockParams = { id: '401', gw: '5' };
    mockSummary = {
      isPending: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        history: [{
          round: 5, total_points: 9, minutes: 90, goals_scored: 1, assists: 0,
          clean_sheets: 0, goals_conceded: 1, own_goals: 0, penalties_saved: 0,
          penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 3,
          was_home: true, opponent_team: 1, team_h_score: 2, team_a_score: 1,
        }],
        fixtures: [{ event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 }],
      },
    };
    const { getByText, queryByText } = renderWithProviders(<PlayerDetail />);
    // FWD: Played 90' +2, Goal +4, Bonus +3 → 9, no Other line.
    expect(getByText('Goal')).toBeTruthy();
    expect(getByText('+4')).toBeTruthy();
    expect(getByText('Bonus')).toBeTruthy();
    expect(getByText('9 pts')).toBeTruthy();
    // Season tile row is gone.
    expect(queryByText('ICT')).toBeNull();
  });

  it('keeps season tiles when there is no gw param', () => {
    // default mockParams = { id: '401' }
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText('ICT')).toBeTruthy();
  });

  it("shows 'Hasn't played yet' for an upcoming gameweek with no history row", () => {
    mockParams = { id: '401', gw: '8' }; // freshSummary history only has rounds 4 & 5
    const { getByText } = renderWithProviders(<PlayerDetail />);
    expect(getByText("Hasn't played yet")).toBeTruthy();
  });

  it('renders the scoreline player-team-first for an away gameweek', () => {
    mockParams = { id: '401', gw: '5' };
    mockSummary = {
      isPending: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        history: [{
          round: 5, total_points: 2, minutes: 90, goals_scored: 0, assists: 0,
          clean_sheets: 0, goals_conceded: 2, own_goals: 0, penalties_saved: 0,
          penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0,
          was_home: false, opponent_team: 1, team_h_score: 2, team_a_score: 1,
        }],
        fixtures: [{ event: 7, is_home: false, team_h: 1, team_a: 13, difficulty: 3 }],
      },
    };
    const { getByText } = renderWithProviders(<PlayerDetail />);
    // Player's team is away (1–2 from their perspective), opponent ARS at home.
    expect(getByText(/ARS \(A\) 1–2/)).toBeTruthy();
  });

  it('shows a single error banner (no duplicate) in gw mode when the summary fails', () => {
    mockParams = { id: '401', gw: '5' };
    mockSummary = { isPending: false, isError: true, refetch: jest.fn(), data: undefined };
    const { getAllByText, queryByText } = renderWithProviders(<PlayerDetail />);
    expect(getAllByText('Retry')).toHaveLength(1);
    expect(queryByText('9 pts')).toBeNull();
  });
});
