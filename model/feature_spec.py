"""Single source of truth for the xPts v1 feature contract.

Training (model/) and serving (Plan 3, Deno) MUST build features from these
exact constants so the committed coefficient artifact scores identically in
both places.
"""

MODEL_VERSION = "v1.0.0"

# Exp-decay form window (most-recent prior gameweeks) and decay base.
FORM_WINDOW = 6
DECAY_ALPHA = 0.85

POSITIONS = ["GKP", "DEF", "MID", "FWD"]
QUANTILES = [0.25, 0.50, 0.75]

# Per-GW stats we take an exp-decay form average of. Each yields a
# `form_<stat>` feature. `total_points` last so its form == baseline (c).
FORM_STATS = [
    "expected_goals",
    "expected_assists",
    "expected_goal_involvements",
    "threat",
    "creativity",
    "influence",
    "bps",
    "defensive_contribution",
    "total_points",
]

# Fixed scaling so raw features land in a well-conditioned range for the
# linear model and the dot-product scorer stays trivial to reproduce.
VALUE_SCALE = 10.0      # FPL price is in tenths of a million (e.g. 55 -> 5.5)
STRENGTH_SCALE = 1000.0  # bootstrap team strengths are ~1000-1400

FEATURE_COLUMNS = (
    [f"form_{s}" for s in FORM_STATS]
    + ["xmin", "opp_strength_def", "opp_strength_att", "was_home", "value_scaled"]
)
