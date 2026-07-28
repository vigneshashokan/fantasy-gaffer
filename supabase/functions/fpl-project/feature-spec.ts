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

// #212 seeding contract. MUST stay byte-identical in meaning to
// model/seed_spec.py — the `seed` block of the parity fixture is the guard.
export const SEED_ROWS = FORM_WINDOW;
export const SEED_DENOMINATOR = 38;
export const SEASON_WEIGHTS = [0.7, 0.3] as const;
export const SEED_DEPTH = SEASON_WEIGHTS.length;
export const NEWCOMER_K = 10;
export const SEED_MODEL_VERSION = 'v1.0.0-seed';
