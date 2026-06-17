import { assertEquals } from '@std/assert';
import {
  FEATURE_COLUMNS, FORM_STATS, POSITIONS, QUANTILES, MODEL_VERSION,
  FORM_WINDOW, DECAY_ALPHA, VALUE_SCALE, STRENGTH_SCALE,
} from '../feature-spec.ts';

Deno.test('feature-spec mirrors the Python contract', () => {
  assertEquals(MODEL_VERSION, 'v1.0.0');
  assertEquals(FORM_WINDOW, 6);
  assertEquals(DECAY_ALPHA, 0.85);
  assertEquals(VALUE_SCALE, 10);
  assertEquals(STRENGTH_SCALE, 1000);
  assertEquals(POSITIONS, ['GKP', 'DEF', 'MID', 'FWD']);
  assertEquals(QUANTILES, [0.25, 0.5, 0.75]);
  assertEquals(FORM_STATS, [
    'expected_goals', 'expected_assists', 'expected_goal_involvements',
    'threat', 'creativity', 'influence', 'bps', 'defensive_contribution',
    'total_points',
  ]);
  assertEquals(FEATURE_COLUMNS, [
    ...FORM_STATS.map((s) => `form_${s}`),
    'xmin', 'opp_strength_def', 'opp_strength_att', 'was_home', 'value_scaled',
  ]);
});
