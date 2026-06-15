// src/api/playerSummary.ts
//
// Lazy per-player history + upcoming fixtures from the public FPL
// /element-summary/{id}/ endpoint. history[] drives the form sparkline;
// fixtures[] drives the next-5 FDR strip.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import type { Position } from '@/types/fpl';

export interface SummaryHistoryRow {
  round: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  was_home: boolean;
  opponent_team: number;
  team_h_score: number | null;
  team_a_score: number | null;
}
export interface SummaryFixtureRow {
  event: number | null;
  is_home: boolean;
  team_h: number;
  team_a: number;
  difficulty: number;
}
export interface ElementSummary {
  history: SummaryHistoryRow[];
  fixtures: SummaryFixtureRow[];
}

export interface FormGameweek {
  round: number;
  // Points for each fixture in this gameweek — usually one entry, two for a
  // double gameweek. Kept separate (not summed) to mirror the FPL app.
  fixtures: number[];
}
export interface NextFixture {
  event: number | null;
  isHome: boolean;
  opponentTeamId: number;
  difficulty: number;
}

// FPL history has one row per FIXTURE, so a double gameweek yields two rows
// with the same `round`. Group fixtures by round — keeping each fixture's
// points separate, like the FPL app, rather than summing — and return the
// last 5 DISTINCT rounds (so `round` is a unique key per sparkline column).
export function last5FromHistory(
  history: Pick<SummaryHistoryRow, 'round' | 'total_points'>[],
): FormGameweek[] {
  const byRound = new Map<number, number[]>();
  for (const h of history) {
    const fixtures = byRound.get(h.round) ?? [];
    fixtures.push(h.total_points);
    byRound.set(h.round, fixtures);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-5)
    .map(([round, fixtures]) => ({ round, fixtures }));
}

export function next5Fixtures(fixtures: SummaryFixtureRow[]): NextFixture[] {
  return fixtures.slice(0, 5).map((f) => ({
    event: f.event,
    isHome: f.is_home,
    opponentTeamId: f.is_home ? f.team_a : f.team_h,
    difficulty: f.difficulty,
  }));
}

export function fetchPlayerSummary(id: string): Promise<ElementSummary> {
  return fplGet<ElementSummary>(`/element-summary/${id}/`);
}

export function useElementSummary(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.elementSummary(id ?? ''),
    queryFn: () => fetchPlayerSummary(id as string),
    enabled: !!id,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// --- Gameweek points breakdown (My Team player detail) -----------------------
// FPL's element-summary history gives raw stat counts plus an authoritative
// total_points, but no per-line point attribution. We attribute the stable,
// well-known scoring rules and fold any remainder (e.g. the 2025/26 defensive-
// contribution points we don't model) into a single "Other" line, so the column
// always reconciles to the real total.

const GOAL_PTS: Record<Position, number> = { GKP: 6, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET_PTS: Record<Position, number> = { GKP: 4, DEF: 4, MID: 1, FWD: 0 };

export interface GwStatLine {
  label: string;
  points: number;
}
export interface GwFixtureBreakdown {
  opponentTeamId: number;
  isHome: boolean;
  teamHScore: number | null;
  teamAScore: number | null;
  points: number;
  played: boolean;
  lines: GwStatLine[];
}
export type GwBreakdown =
  | { state: 'upcoming'; round: number }
  | { state: 'result'; round: number; fixtures: GwFixtureBreakdown[] };

function minutesPoints(mins: number): number {
  if (mins <= 0) return 0;
  return mins >= 60 ? 2 : 1;
}

function times(n: number): string {
  return n > 1 ? ` ×${n}` : '';
}

export function gwFixtureLines(row: SummaryHistoryRow, pos: Position): GwStatLine[] {
  const lines: GwStatLine[] = [];
  if (row.minutes > 0) {
    lines.push({ label: `Played ${row.minutes}'`, points: minutesPoints(row.minutes) });
  }
  if (row.goals_scored > 0)
    lines.push({ label: `Goal${times(row.goals_scored)}`, points: GOAL_PTS[pos] * row.goals_scored });
  if (row.assists > 0)
    lines.push({ label: `Assist${times(row.assists)}`, points: 3 * row.assists });
  if (row.clean_sheets > 0 && CLEAN_SHEET_PTS[pos] > 0)
    lines.push({ label: 'Clean sheet', points: CLEAN_SHEET_PTS[pos] });
  if (pos === 'GKP' && row.saves >= 3)
    lines.push({ label: `Saves${times(row.saves)}`, points: Math.floor(row.saves / 3) });
  if (row.penalties_saved > 0)
    lines.push({ label: `Penalty save${times(row.penalties_saved)}`, points: 5 * row.penalties_saved });
  if ((pos === 'GKP' || pos === 'DEF') && row.goals_conceded >= 2)
    lines.push({ label: `Goals conceded${times(row.goals_conceded)}`, points: -Math.floor(row.goals_conceded / 2) });
  if (row.penalties_missed > 0)
    lines.push({ label: `Penalty miss${times(row.penalties_missed)}`, points: -2 * row.penalties_missed });
  if (row.yellow_cards > 0)
    lines.push({ label: 'Yellow card', points: -1 * row.yellow_cards });
  if (row.red_cards > 0)
    lines.push({ label: 'Red card', points: -3 * row.red_cards });
  if (row.own_goals > 0)
    lines.push({ label: `Own goal${times(row.own_goals)}`, points: -2 * row.own_goals });
  if (row.bonus > 0)
    lines.push({ label: 'Bonus', points: row.bonus });

  const attributed = lines.reduce((sum, l) => sum + l.points, 0);
  const other = row.total_points - attributed;
  if (other !== 0) lines.push({ label: 'Other', points: other });
  return lines;
}

// One history row per fixture; a double gameweek yields two rows for the round.
// No row for the round → 'upcoming' (the liveGW+1 page, or a round before a
// mid-season transfer in).
export function gwBreakdown(history: SummaryHistoryRow[], round: number, pos: Position): GwBreakdown {
  const rows = history.filter((h) => h.round === round);
  if (rows.length === 0) return { state: 'upcoming', round };
  const fixtures: GwFixtureBreakdown[] = rows.map((row) => ({
    opponentTeamId: row.opponent_team,
    isHome: row.was_home,
    teamHScore: row.team_h_score,
    teamAScore: row.team_a_score,
    points: row.total_points,
    played: row.minutes > 0,
    lines: gwFixtureLines(row, pos),
  }));
  return { state: 'result', round, fixtures };
}
