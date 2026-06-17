// TS mirror of model/feature_spec.py — the train/serve feature contract.
// Keep IN SYNC with the Python file; the golden-fixture parity test guards it.
export const MODEL_VERSION = 'v1.0.0';
export const FORM_WINDOW = 6;
export const DECAY_ALPHA = 0.85;
export const POSITIONS = ['GKP', 'DEF', 'MID', 'FWD'] as const;
export const QUANTILES = [0.25, 0.5, 0.75] as const;
export const VALUE_SCALE = 10;
export const STRENGTH_SCALE = 1000;

export const FORM_STATS = [
  'expected_goals',
  'expected_assists',
  'expected_goal_involvements',
  'threat',
  'creativity',
  'influence',
  'bps',
  'defensive_contribution',
  'total_points',
] as const;

export const FEATURE_COLUMNS: string[] = [
  ...FORM_STATS.map((s) => `form_${s}`),
  'xmin',
  'opp_strength_def',
  'opp_strength_att',
  'was_home',
  'value_scaled',
];
