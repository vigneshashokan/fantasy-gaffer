"""Single source of truth for the xPts v3 simulator contract (#129).

Per-player rate constants, simulator constants, and FPL's points table.
The points values are empirically verified against the full 2025/26 season
(0 mismatches on 29,747 rows — PR #142); the GKP goal value is the one
unexercised cell (no GKP scored in 2025/26; 10 is the rule-book value).
Spec: docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md.
"""

MODEL_VERSION_V3 = "v3"
MODEL_VERSION_V3_ENS = "v3-ens"

# Per-player exp-decay rates (spec §3b): last RATE_WINDOW *played* prior rows.
RATE_WINDOW = 6
RATE_ALPHA = 0.85
MIN_DECAYED_MINUTES = 60.0  # below this, fall back to the position prior
BONUS_PSEUDO = 2.0          # pseudo-observations of the position bonus dist

# Simulator (spec §3d).
N_SIMS = 8000
V3_SEED_BASE = 20260706
M_PART = 30.0               # representative minutes, 1-59' bucket
M_FULL = 85.0               # representative minutes, 60+' bucket
LAMBDA_CAP = 3.0            # cap on final goal-scale component lambdas
SAVES_LAMBDA_CAP = 8.0      # keepers average ~3 saves/match; 3.0 would bind

# Points table (spec §3e) — verified against 2025/26.
GOAL_POINTS = {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4}
CS_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
ASSIST_POINTS = 3
APPEARANCE_POINT = 1        # any minutes
FULL_APPEARANCE_POINT = 1   # additional at 60+
GC_PER_2_POINTS = -1        # GKP/DEF only
SAVES_PER_3_POINTS = 1
PEN_SAVE_POINTS = 5
PEN_MISS_POINTS = -2
YELLOW_POINTS = -1
RED_POINTS = -3
OWN_GOAL_POINTS = -2
DC_POINTS = 2
DC_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12}  # GKP not DC-eligible
