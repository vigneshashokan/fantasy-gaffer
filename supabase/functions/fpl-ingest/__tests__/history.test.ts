import { assertEquals } from '@std/assert';
import {
  normalizeHistory,
  type ElementSummaryHistoryRow,
} from '../sources/history.ts';

const ROWS: ElementSummaryHistoryRow[] = [
  {
    element: 328,
    fixture: 3,
    opponent_team: 6,
    was_home: false,
    round: 1,
    minutes: 0,
    starts: 0,
    goals_scored: 0,
    assists: 0,
    clean_sheets: 0,
    goals_conceded: 0,
    bonus: 0,
    bps: 0,
    total_points: 0,
    expected_goals: '0.00',
    expected_assists: '0.00',
    expected_goal_involvements: '0.00',
    expected_goals_conceded: '0.00',
    ict_index: '0.0',
    influence: '0.0',
    creativity: '0.0',
    threat: '0.0',
    defensive_contribution: 0,
    value: 55,
  },
  {
    element: 328,
    fixture: 14,
    opponent_team: 9,
    was_home: true,
    round: 2,
    minutes: 90,
    starts: 1,
    goals_scored: 1,
    assists: 1,
    clean_sheets: 1,
    goals_conceded: 0,
    bonus: 3,
    bps: 42,
    total_points: 13,
    expected_goals: '0.74',
    expected_assists: '0.31',
    expected_goal_involvements: '1.05',
    expected_goals_conceded: '0.62',
    ict_index: '12.4',
    influence: '55.2',
    creativity: '28.1',
    threat: '41.0',
    defensive_contribution: 2,
    value: 56,
  },
];

Deno.test('normalizeHistory injects season/position/team and keeps player_id from the row', () => {
  const out = normalizeHistory('2025/26', { position: 'MID', teamId: 12 }, ROWS);
  assertEquals(out.length, 2);
  assertEquals(out[0].season, '2025/26');
  assertEquals(out[0].player_id, 328);
  assertEquals(out[0].position, 'MID');
  assertEquals(out[0].team_id, 12);
  assertEquals(out[0].gw, 1);
  assertEquals(out[0].fixture_id, 3);
  assertEquals(out[0].was_home, false);
});

Deno.test('normalizeHistory parses string-typed xG / ICT fields to numbers', () => {
  const out = normalizeHistory('2025/26', { position: 'MID', teamId: 12 }, ROWS);
  const gw2 = out[1];
  assertEquals(typeof gw2.expected_goals, 'number');
  assertEquals(gw2.expected_goals, 0.74);
  assertEquals(gw2.expected_assists, 0.31);
  assertEquals(gw2.expected_goal_involvements, 1.05);
  assertEquals(gw2.expected_goals_conceded, 0.62);
  assertEquals(gw2.ict_index, 12.4);
  assertEquals(gw2.threat, 41.0);
});

Deno.test('normalizeHistory passes through integer stat fields', () => {
  const out = normalizeHistory('2025/26', { position: 'MID', teamId: 12 }, ROWS);
  const gw2 = out[1];
  assertEquals(gw2.minutes, 90);
  assertEquals(gw2.starts, 1);
  assertEquals(gw2.total_points, 13);
  assertEquals(gw2.bonus, 3);
  assertEquals(gw2.bps, 42);
  assertEquals(gw2.defensive_contribution, 2);
  assertEquals(gw2.value, 56);
});
