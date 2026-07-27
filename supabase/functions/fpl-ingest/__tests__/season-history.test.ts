import { assertEquals } from 'jsr:@std/assert';
import { normalizeSeasonHistory } from '../sources/season-history.ts';

const HAALAND_2025_26 = {
  season_name: '2025/26',
  element_code: 223094,
  start_cost: 140,
  end_cost: 147,
  total_points: 239,
  minutes: 2953,
  starts: 34,
  bps: 952,
  defensive_contribution: 104,
  influence: '1180.4',
  creativity: '320.1',
  threat: '1520.0',
  expected_goals: '25.50',
  expected_assists: '2.67',
  expected_goal_involvements: '28.17',
};

Deno.test('normalizeSeasonHistory coerces string stats to numbers', () => {
  const [row] = normalizeSeasonHistory([HAALAND_2025_26]);
  assertEquals(row.season, '2025/26');
  assertEquals(row.element_code, 223094);
  assertEquals(row.expected_goals, 25.5);
  assertEquals(row.threat, 1520.0);
  assertEquals(row.total_points, 239);
  assertEquals(row.starts, 34);
});

Deno.test('normalizeSeasonHistory keeps every season returned, not just two', () => {
  const rows = normalizeSeasonHistory([
    { ...HAALAND_2025_26, season_name: '2022/23' },
    { ...HAALAND_2025_26, season_name: '2023/24' },
    { ...HAALAND_2025_26, season_name: '2024/25' },
    { ...HAALAND_2025_26, season_name: '2025/26' },
  ]);
  assertEquals(rows.length, 4);
  assertEquals(rows.map((r) => r.season), ['2022/23', '2023/24', '2024/25', '2025/26']);
});

Deno.test('normalizeSeasonHistory defaults a missing stat to 0, not NaN', () => {
  const partial = { ...HAALAND_2025_26 } as Record<string, unknown>;
  delete partial.defensive_contribution;
  const [row] = normalizeSeasonHistory([partial as never]);
  assertEquals(row.defensive_contribution, 0);
});
