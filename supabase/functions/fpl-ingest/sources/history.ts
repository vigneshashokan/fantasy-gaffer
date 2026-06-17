import type { Position } from './bootstrap.ts';

export interface ElementSummaryHistoryRow {
  element: number;
  fixture: number;
  opponent_team: number;
  was_home: boolean;
  round: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  ict_index: string;
  influence: string;
  creativity: string;
  threat: string;
  defensive_contribution: number;
  value: number;
}

export interface ElementSummaryResponse {
  history: ElementSummaryHistoryRow[];
}

export interface PlayerGwHistoryRow {
  season: string;
  player_id: number;
  fixture_id: number;
  gw: number;
  position: Position;
  team_id: number;
  opponent_team: number;
  was_home: boolean;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  expected_goals_conceded: number;
  ict_index: number;
  influence: number;
  creativity: number;
  threat: number;
  defensive_contribution: number;
  value: number;
}

function num(s: string | number | null | undefined): number {
  const n = typeof s === 'number' ? s : parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function normalizeHistory(
  season: string,
  meta: { position: Position; teamId: number },
  rows: ElementSummaryHistoryRow[],
): PlayerGwHistoryRow[] {
  return rows.map((r) => ({
    season,
    player_id: r.element,
    fixture_id: r.fixture,
    gw: r.round,
    position: meta.position,
    team_id: meta.teamId,
    opponent_team: r.opponent_team,
    was_home: r.was_home,
    minutes: r.minutes,
    starts: r.starts,
    goals_scored: r.goals_scored,
    assists: r.assists,
    clean_sheets: r.clean_sheets,
    goals_conceded: r.goals_conceded,
    bonus: r.bonus,
    bps: r.bps,
    total_points: r.total_points,
    expected_goals: num(r.expected_goals),
    expected_assists: num(r.expected_assists),
    expected_goal_involvements: num(r.expected_goal_involvements),
    expected_goals_conceded: num(r.expected_goals_conceded),
    ict_index: num(r.ict_index),
    influence: num(r.influence),
    creativity: num(r.creativity),
    threat: num(r.threat),
    defensive_contribution: r.defensive_contribution,
    value: r.value,
  }));
}
