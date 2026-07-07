"""Pure serving pipeline for the v3.1 candidate (#128, spec §2–§3). No I/O —
serve_v3.py owns the DB; everything here is pandas-in/pandas-out so the unit
suite and the §5 parity guard drive it directly. Composes the frozen model
modules (rates_v3 / simulate_v3 / minutes_model / match_engine / assist_scale);
never reimplements them."""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from assist_scale import compute_assist_scale
from feature_spec_v3 import N_SIMS, V3_SEED_BASE
from match_engine import MatchEngine, build_team_fixtures
from minutes_model import (_fallback_rates, _rate_models,
                           build_minutes_feature_row, build_minutes_samples,
                           fit_minutes_models, predict_minutes)
from rates_v3 import build_player_rates, position_rate_priors
from simulate_v3 import simulate_player_fixture, summarize_draws

SERVE_GW_WINDOW = 3
_SIM_KEYS = ("total", "goals", "assists", "cs")


def season_label_for(kickoff: datetime) -> str:
    """Python port of the Deno currentSeasonLabel (calendar.ts): before August
    the season started the prior calendar year. E.g. 2026-09 -> '2026/27'."""
    start = kickoff.year if kickoff.month >= 8 else kickoff.year - 1
    return f"{start}/{(start + 1) % 100:02d}"


def select_target_gws(fixtures: pd.DataFrame, as_of_gw: int | None = None,
                      n: int = SERVE_GW_WINDOW) -> list[int]:
    """Next n distinct GWs. Production (as_of_gw None): events with >= 1
    unfinished fixture. --as-of-gw t: events >= t regardless of `finished`
    (historical DBs have everything finished)."""
    f = fixtures[fixtures["event"].notna()]
    if as_of_gw is None:
        f = f[~f["finished"].astype(bool)]
    else:
        f = f[f["event"] >= as_of_gw]
    gws = sorted(int(e) for e in f["event"].unique())
    return gws[:n]


def latest_player_state(history: pd.DataFrame) -> pd.DataFrame:
    """One row per player: team_id + position from his most recent history row
    (mid-season transfers ~ last-played-for club — spec §3 approximation)."""
    latest = (history.sort_values(["gw", "fixture_id"])
              .groupby("player_id", as_index=False).last())
    return latest[["player_id", "team_id", "position"]]


def build_targets(fixtures: pd.DataFrame, latest: pd.DataFrame,
                  target_gws: list[int]) -> pd.DataFrame:
    """(player, fixture) targets: every known player whose team plays in a
    target GW. DGW -> multiple rows per (player, gw); blank -> none."""
    cols = ["player_id", "gw", "fixture_id", "position", "team_id",
            "opponent_team", "was_home"]
    rows: list[dict] = []
    fx = fixtures[fixtures["event"].isin(target_gws)]
    for _, f in fx.iterrows():
        for team, opp, home in ((int(f["team_h"]), int(f["team_a"]), True),
                                (int(f["team_a"]), int(f["team_h"]), False)):
            for _, p in latest[latest["team_id"] == team].iterrows():
                rows.append({"player_id": int(p["player_id"]),
                             "gw": int(f["event"]), "fixture_id": int(f["id"]),
                             "position": p["position"], "team_id": team,
                             "opponent_team": opp, "was_home": home})
    if not rows:
        return pd.DataFrame(columns=cols)
    return (pd.DataFrame(rows, columns=cols)
            .sort_values(["gw", "player_id", "fixture_id"])
            .reset_index(drop=True))


def fit_serve_minutes(history: pd.DataFrame) -> dict:
    """Serve-mode minutes fit: one hurdle fit on ALL (strictly prior) history —
    exactly precompute_minutes_predictions' step-t branch when history is
    pre-filtered to gw < t (a sample's features are built from gw < its target,
    so the two formulations see identical data)."""
    samples = build_minutes_samples(history)
    if len(samples):
        return fit_minutes_models(samples)
    return _rate_models(*_fallback_rates(history))


def serve_minutes_predictions(history: pd.DataFrame,
                              models: dict) -> dict[int, tuple[float, float]]:
    """(p_play, p60) once per player with >= 1 history row; reused for every
    target GW (the features cannot change before new data arrives)."""
    out: dict[int, tuple[float, float]] = {}
    for pid, rows in history.groupby("player_id"):
        feat = build_minutes_feature_row(rows)
        pos = rows.sort_values(["gw", "fixture_id"]).iloc[-1]["position"]
        out[int(pid)] = predict_minutes(models, feat, pos)
    return out
