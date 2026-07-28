"""Single source of truth for the GW1 seeding contract (#212).

model/seed.py and supabase/functions/fpl-project/lib/seed.ts MUST agree on
these constants, guarded by the `seed` block of the parity fixture.
"""
from feature_spec import FORM_WINDOW

SEED_MODEL_VERSION = "v1.0.0-seed"

# Pseudo-rows exactly fill the exp-decay window, so the prior is 100% of the
# feature at GW1 and provably gone once six real gameweeks exist.
SEED_ROWS = FORM_WINDOW

# Season totals -> per-fixture rates. 38 matches v1's blank-inclusive semantics
# (player_gw_history carries a row per player per gameweek regardless of
# minutes). Known to under-rate mid-season arrivals; see spec §4.2.
SEED_DENOMINATOR = 38

# Most-recent-first. Truncated and renormalised when fewer seasons exist.
SEASON_WEIGHTS = (0.7, 0.3)
SEED_DEPTH = len(SEASON_WEIGHTS)

# Capped at 2 because defensive_contribution did not exist before 2024/25 and
# FPL returns it as a literal 0 for earlier seasons — a deeper blend would
# silently dilute that feature toward zero with no error anywhere.

NEWCOMER_K = 10
