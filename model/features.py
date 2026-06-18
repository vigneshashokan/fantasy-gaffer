"""Pure feature engineering for xPts v1. No I/O; operates on DataFrames."""
from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd

from feature_spec import (
    DECAY_ALPHA,
    FORM_STATS,
    FORM_WINDOW,
    STRENGTH_SCALE,
    VALUE_SCALE,
    FEATURE_COLUMNS,
)


def decay_weights(n: int, alpha: float = DECAY_ALPHA) -> np.ndarray:
    if n <= 0:
        return np.array([])
    w = alpha ** np.arange(n)
    return w / w.sum()


def exp_decay_mean(values_recent_first: Sequence[float], alpha: float = DECAY_ALPHA) -> float:
    vals = list(values_recent_first)
    if not vals:
        return 0.0
    w = decay_weights(len(vals), alpha)
    return float(np.dot(w, np.asarray(vals, dtype=float)))


def opponent_strengths(was_home: bool, opponent_team: int,
                       team_strengths: dict[int, dict]) -> tuple[float, float]:
    t = team_strengths.get(int(opponent_team))
    if t is None:
        return (0.0, 0.0)
    # If the player is home, the opponent plays away (use opponent's away strengths).
    if was_home:
        d, a = t["strength_defence_away"], t["strength_attack_away"]
    else:
        d, a = t["strength_defence_home"], t["strength_attack_home"]
    return (float(d) / STRENGTH_SCALE, float(a) / STRENGTH_SCALE)


def build_feature_row(prior_rows: pd.DataFrame, target_row: pd.Series,
                      team_strengths: dict[int, dict]) -> dict:
    # Most-recent-first, capped at the form window.
    prior = prior_rows.sort_values(["gw", "fixture_id"], ascending=False).head(FORM_WINDOW)

    feat: dict[str, float] = {}
    for stat in FORM_STATS:
        feat[f"form_{stat}"] = exp_decay_mean(prior[stat].tolist())

    # xMinutes proxy: recent starts share (0..1). 0 if no prior rows.
    feat["xmin"] = float(prior["starts"].mean()) if len(prior) else 0.0

    opp_def, opp_att = opponent_strengths(
        bool(target_row["was_home"]), int(target_row["opponent_team"]), team_strengths
    )
    feat["opp_strength_def"] = opp_def
    feat["opp_strength_att"] = opp_att
    feat["was_home"] = 1.0 if bool(target_row["was_home"]) else 0.0
    feat["value_scaled"] = float(target_row["value"]) / VALUE_SCALE
    return feat


def build_samples(history: pd.DataFrame, team_strengths: dict[int, dict]) -> pd.DataFrame:
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue  # need at least one prior gameweek for features
            feat = build_feature_row(prior, target, team_strengths)
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "target": float(target["total_points"]),
                "actual_minutes": int(target["minutes"]),
            })
            rows.append(feat)
    cols = FEATURE_COLUMNS + ["player_id", "gw", "position", "target", "actual_minutes"]
    return pd.DataFrame(rows, columns=cols)
