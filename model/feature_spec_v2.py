"""Single source of truth for the xPts v2.0 feature contract.

Training (model/) and serving (#128, Deno feature-spec-v2.ts) MUST build
features from these exact constants. v1's feature_spec.py is FROZEN — v2
declares its own constants (same values where unchanged) so this file alone
defines the v2 contract.
"""

MODEL_VERSION_V2 = "v2.0.0"

# Player-form machinery — unchanged from v1.
FORM_WINDOW_V2 = 6
DECAY_ALPHA_V2 = 0.85
QUANTILES_V2 = [0.25, 0.50, 0.75]
POSITIONS_V2 = ["GKP", "DEF", "MID", "FWD"]
VALUE_SCALE_V2 = 10.0

# v1 FORM_STATS minus expected_goal_involvements (xGI ≈ xG + xA collinearity
# fix — spec §1 decisions log).
FORM_STATS_V2 = [
    "expected_goals",
    "expected_assists",
    "threat",
    "creativity",
    "influence",
    "bps",
    "defensive_contribution",
    "total_points",
]

# Match-engine rating hyperparams. Initial values; Task 9's grid selection
# freezes the final ones (walk-forward MAE) and re-records them here.
RATING_WINDOW = 10   # venue-specific matches per rating stream
RATING_ALPHA = 0.9   # exp-decay base across those matches (most-recent-first)
PRIOR_WEIGHT = 4     # shrinkage: rating = (k*raw + m*L) / (k + m), m = this

# League-average team-xG per team-fixture, frozen from the 2025/26 mean in
# Task 8 (the zero-data fallback for league baselines at season start).
LEAGUE_XG_PRIOR = 1.35

FEATURE_COLUMNS_V2 = (
    [f"form_{s}" for s in FORM_STATS_V2]
    + ["xmin", "was_home", "value_scaled"]
    + ["team_lambda_for", "team_lambda_against", "p_clean_sheet"]
)
