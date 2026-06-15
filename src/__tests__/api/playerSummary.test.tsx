// src/__tests__/api/playerSummary.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  last5FromHistory,
  next5Fixtures,
  useElementSummary,
  gwFixtureLines,
  gwBreakdown,
} from '@/api/playerSummary';
import type { SummaryHistoryRow } from '@/api/playerSummary';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
import { fplGet } from '@/api/fpl-client';

beforeEach(() => jest.clearAllMocks());

describe('last5FromHistory', () => {
  it('returns the last 5 rounds ascending, one fixture each', () => {
    const history = [
      { round: 1, total_points: 2 },
      { round: 2, total_points: 7 },
      { round: 3, total_points: 0 },
      { round: 4, total_points: 12 },
      { round: 5, total_points: 5 },
      { round: 6, total_points: 9 },
    ];
    expect(last5FromHistory(history)).toEqual([
      { round: 2, fixtures: [7] },
      { round: 3, fixtures: [0] },
      { round: 4, fixtures: [12] },
      { round: 5, fixtures: [5] },
      { round: 6, fixtures: [9] },
    ]);
  });
  it('handles fewer than 5 rounds', () => {
    expect(last5FromHistory([{ round: 1, total_points: 3 }])).toEqual([
      { round: 1, fixtures: [3] },
    ]);
  });
  it('keeps both fixtures separately for a double gameweek (not summed)', () => {
    const history = [
      { round: 34, total_points: 5 },
      { round: 35, total_points: 7 },
      { round: 36, total_points: 6 }, // DGW match 1
      { round: 36, total_points: 9 }, // DGW match 2
      { round: 37, total_points: 2 },
    ];
    const result = last5FromHistory(history);
    expect(result).toEqual([
      { round: 34, fixtures: [5] },
      { round: 35, fixtures: [7] },
      { round: 36, fixtures: [6, 9] },
      { round: 37, fixtures: [2] },
    ]);
    // distinct rounds → one unique key per sparkline column
    expect(new Set(result.map((g) => g.round)).size).toBe(result.length);
  });
  it('keeps the last 5 DISTINCT rounds when there are more', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      round: i + 1,
      total_points: i,
    }));
    expect(last5FromHistory(history).map((g) => g.round)).toEqual([4, 5, 6, 7, 8]);
  });
});

describe('next5Fixtures', () => {
  it('maps up to 5 fixtures, resolving opponent by home/away', () => {
    const fixtures = [
      { event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 },
      { event: 8, is_home: false, team_h: 4, team_a: 13, difficulty: 4 },
    ];
    expect(next5Fixtures(fixtures)).toEqual([
      { event: 7, isHome: true, opponentTeamId: 1, difficulty: 2 },
      { event: 8, isHome: false, opponentTeamId: 4, difficulty: 4 },
    ]);
  });
});

describe('useElementSummary', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={makeTestQueryClient()}>{children}</QueryClientProvider>
  );
  it('fetches element-summary for the id', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({ history: [], fixtures: [] });
    const { result } = renderHook(() => useElementSummary('401'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/element-summary/401/');
  });
  it('stays idle when id is undefined', () => {
    const { result } = renderHook(() => useElementSummary(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });
});

const baseRow = (over: Partial<SummaryHistoryRow>): SummaryHistoryRow => ({
  round: 5, total_points: 0, minutes: 0, goals_scored: 0, assists: 0,
  clean_sheets: 0, goals_conceded: 0, own_goals: 0, penalties_saved: 0,
  penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0,
  was_home: true, opponent_team: 1, team_h_score: null, team_a_score: null,
  ...over,
});

describe('gwFixtureLines', () => {
  it('attributes a forward goal at 4 and reconciles exactly (no Other line)', () => {
    const row = baseRow({ minutes: 90, goals_scored: 1, bonus: 3, total_points: 9 });
    expect(gwFixtureLines(row, 'FWD')).toEqual([
      { label: "Played 90'", points: 2 },
      { label: 'Goal', points: 4 },
      { label: 'Bonus', points: 3 },
    ]);
  });

  it('gives a defender a clean sheet at 4', () => {
    const row = baseRow({ minutes: 90, clean_sheets: 1, total_points: 6 });
    expect(gwFixtureLines(row, 'DEF')).toEqual([
      { label: "Played 90'", points: 2 },
      { label: 'Clean sheet', points: 4 },
    ]);
  });

  it('omits a clean-sheet line for a forward (0 pts) but reconciles via Other', () => {
    const row = baseRow({ minutes: 90, clean_sheets: 1, total_points: 2 });
    expect(gwFixtureLines(row, 'FWD')).toEqual([{ label: "Played 90'", points: 2 }]);
  });

  it('folds unmodelled points (e.g. defensive contribution) into a single Other line', () => {
    const row = baseRow({ minutes: 90, total_points: 4 });
    expect(gwFixtureLines(row, 'DEF')).toEqual([
      { label: "Played 90'", points: 2 },
      { label: 'Other', points: 2 },
    ]);
  });

  it('handles negatives and sub appearances without an Other line when it balances', () => {
    const row = baseRow({ minutes: 30, yellow_cards: 1, total_points: 0 });
    expect(gwFixtureLines(row, 'MID')).toEqual([
      { label: "Played 30'", points: 1 },
      { label: 'Yellow card', points: -1 },
    ]);
  });
});

describe('gwBreakdown', () => {
  const history: SummaryHistoryRow[] = [
    baseRow({ round: 4, minutes: 90, goals_scored: 1, total_points: 6 }),
    baseRow({ round: 5, minutes: 0, total_points: 0 }),
  ];

  it('returns upcoming when the round has no history row', () => {
    expect(gwBreakdown(history, 8, 'MID')).toEqual({ state: 'upcoming', round: 8 });
  });

  it('marks a 0-minute round as a result with a not-played fixture', () => {
    const result = gwBreakdown(history, 5, 'MID');
    expect(result.state).toBe('result');
    if (result.state === 'result') {
      expect(result.fixtures).toHaveLength(1);
      expect(result.fixtures[0].played).toBe(false);
      expect(result.fixtures[0].lines).toEqual([]);
    }
  });

  it('returns one fixture per row for a double gameweek', () => {
    const dgw = [
      baseRow({ round: 6, minutes: 90, total_points: 2 }),
      baseRow({ round: 6, minutes: 75, goals_scored: 1, total_points: 6 }),
    ];
    const result = gwBreakdown(dgw, 6, 'MID');
    if (result.state === 'result') expect(result.fixtures).toHaveLength(2);
    else throw new Error('expected result state');
  });
});
