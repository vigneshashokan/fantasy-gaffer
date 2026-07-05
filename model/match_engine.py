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


class MatchEngine:
    """Venue-split exp-decay team ratings with sample-size shrinkage, and the
    independent-Poisson fixture model on top. All queries take `before_gw` and
    only see matches with gw < before_gw (walk-forward safe by construction)."""

    def __init__(self, team_fixtures: pd.DataFrame, *,
                 window: int = RATING_WINDOW, alpha: float = RATING_ALPHA,
                 prior_weight: float = PRIOR_WEIGHT,
                 league_prior: float = LEAGUE_XG_PRIOR) -> None:
        self.tf = team_fixtures.sort_values(["gw", "fixture_id"])
        self.window = window
        self.alpha = alpha
        self.prior_weight = prior_weight
        self.league_prior = league_prior

    def _venue_rows(self, venue: str, before_gw: int) -> pd.DataFrame:
        is_home = venue == "home"
        return self.tf[(self.tf.was_home == is_home) & (self.tf.gw < before_gw)]

    def league_baseline(self, venue: str, before_gw: int) -> float:
        rows = self._venue_rows(venue, before_gw)
        n = len(rows)
        if n == 0:
            return float(self.league_prior)
        raw = float(rows["xg_for"].mean())
        m = self.prior_weight
        return (n * raw + m * self.league_prior) / (n + m)

    def rating(self, team_id: int, venue: str, kind: str, before_gw: int) -> float:
        rows = self._venue_rows(venue, before_gw)
        rows = rows[rows.team_id == team_id].sort_values(
            ["gw", "fixture_id"], ascending=False
        ).head(self.window)
        col = "xg_for" if kind == "att" else "xg_against"
        # def_home / att_away both live in "away-goals" units and vice versa:
        # a team's home defence concedes what opponents score away. The league
        # baseline for a stream is the mean of the goals-units it's measured in.
        baseline_venue = venue if kind == "att" else ("away" if venue == "home" else "home")
        L = self.league_baseline(baseline_venue, before_gw)
        k = len(rows)
        if k == 0:
            return L
        raw = exp_decay_mean(rows[col].tolist(), alpha=self.alpha)
        m = self.prior_weight
        return (k * raw + m * L) / (k + m)
