import { assertAlmostEquals, assertEquals } from '@std/assert';
import { blendRates, newcomerRates, pseudoRows } from '../lib/seed.ts';
import { SEED_ROWS } from '../feature-spec.ts';
import fixture from '../artifacts/parity-fixture.json' with { type: 'json' };

Deno.test('seed synthesis matches the Python implementation to 1e-6', () => {
  for (const c of fixture.seed.blend) {
    const got = blendRates(c.input);
    for (const [k, want] of Object.entries(c.expected as Record<string, number>)) {
      assertAlmostEquals(got![k], want, 1e-6, `blend mismatch on ${k}`);
    }
  }
});

Deno.test('newcomer k-NN matches Python, including the exact-tie case', () => {
  for (const c of fixture.seed.newcomer) {
    const got = newcomerRates(c.position, c.now_cost, c.pool);
    for (const [k, want] of Object.entries(c.expected as Record<string, number>)) {
      assertAlmostEquals(got![k], want, 1e-6, `newcomer mismatch on ${k}`);
    }
  }
});

Deno.test('pseudo rows sort below every real gameweek', () => {
  const rows = pseudoRows(blendRates(fixture.seed.blend[0].input));
  assertEquals(rows.length, SEED_ROWS);
  assertEquals(rows.every((r) => r.gw === 0), true);
  assertEquals(new Set(rows.map((r) => r.fixture_id)).size, SEED_ROWS);
});

Deno.test('pseudo rows carry fractional starts', () => {
  const rows = pseudoRows(blendRates([{
    starts: 19, end_cost: 100, element_code: 1,
    expected_goals: 0, expected_assists: 0, expected_goal_involvements: 0,
    threat: 0, creativity: 0, influence: 0, bps: 0,
    defensive_contribution: 0, total_points: 0,
  }]));
  assertAlmostEquals(rows[0].starts, 0.5, 1e-6);
});
