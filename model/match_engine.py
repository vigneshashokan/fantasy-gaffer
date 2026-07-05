"""xPts v2.0 match engine: team-fixture aggregation, venue-split exp-decay
ratings with shrinkage, and the independent-Poisson fixture model.

Pure computation on DataFrames — no I/O. Spec:
docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md §2.
The Deno mirror (#128, lib/features-v2.ts) must reproduce this to 1e-6.
"""
from __future__ import annotations

import math

import pandas as pd

from feature_spec_v2 import LEAGUE_XG_PRIOR, PRIOR_WEIGHT, RATING_ALPHA, RATING_WINDOW
from features import exp_decay_mean


def build_team_fixtures(history: pd.DataFrame) -> pd.DataFrame:
    """One row per (fixture_id, team_id): the team's match-level attack and
    defence samples. xg_for = Σ own players' expected_goals; xg_against = the
    opponent's xg_for. goals_* are player-goal sums (≈ team goals, excl. own
    goals — fine for the CS diagnostic)."""
    side = (
        history.groupby(["fixture_id", "team_id"], as_index=False)
        .agg(
            opponent_team=("opponent_team", "first"),
            gw=("gw", "first"),
            was_home=("was_home", "first"),
            xg_for=("expected_goals", "sum"),
            goals_for=("goals_scored", "sum"),
        )
    )
    opp = side[["fixture_id", "team_id", "xg_for", "goals_for"]].rename(
        columns={"team_id": "opponent_team", "xg_for": "xg_against", "goals_for": "goals_against"},
    )
    return side.merge(opp, on=["fixture_id", "opponent_team"], how="left").fillna(
        {"xg_against": 0.0, "goals_against": 0}
    )
