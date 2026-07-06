"""Single source of truth for the xPts v2.1 (minutes lever, #127) contract.

v1's feature_spec.py is FROZEN and v2.0's feature_spec_v2.py records the
failed match-engine candidate; v2.1 declares its own constants. The minutes
model replaces the xmin heuristic with hurdle-logit outputs (p_play, p60).
"""

from feature_spec import FEATURE_COLUMNS

MODEL_VERSION_V21 = "v2.1.0"

# Hurdle-model class structure: 0 mins / 1-59 / 60+ (the FPL payoff cliff:
# second appearance point + clean-sheet eligibility at 60).
MINUTES_CUTOFF = 60

# Plain (undecayed) share windows over prior GW rows, most-recent-first —
# consistent with the xmin heuristic these features replace.
MINUTES_WINDOW_LONG = 6
MINUTES_WINDOW_SHORT = 3

# L1 penalty for the minutes logits — a stability device for near-perfect
# separation (GKP starters play 90 or nothing), NOT a tuned hyperparameter
# (#125 lesson: no grids).
MINUTES_L1_ALPHA = 0.1

# Order = serving contract once frozen (a future Deno port must match).
MINUTES_FEATURE_COLUMNS = [
    "start_share_6",
    "start_share_3",
    "mins_share_6",
    "p60_share_6",
    "started_last",
    "mins_last",
    "zeros_last_3",
    "n_prior",
]

# v1's columns with the xmin heuristic REPLACED by the two minutes-model
# outputs. Everything else (form incl. xGI, static strengths, was_home,
# value) stays — a one-lever diff against the champion for clean attribution.
FEATURE_COLUMNS_V21 = [c for c in FEATURE_COLUMNS if c != "xmin"] + ["p_play", "p60"]
