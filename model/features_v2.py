"""v2.0 feature engineering: v1's player-form machinery (minus xGI) plus the
match-engine features. Pure; no I/O. Mirrored by #128's features-v2.ts."""
from __future__ import annotations

import pandas as pd

from feature_spec_v2 import (
    DECAY_ALPHA_V2,
    FEATURE_COLUMNS_V2,
    FORM_STATS_V2,
    FORM_WINDOW_V2,
    VALUE_SCALE_V2,
)
from features import exp_decay_mean
from match_engine import MatchEngine


def build_feature_row_v2(prior_rows: pd.DataFrame, target_row: pd.Series,
                         engine: MatchEngine) -> dict:
    prior = prior_rows.sort_values(["gw", "fixture_id"], ascending=False).head(FORM_WINDOW_V2)

    feat: dict[str, float] = {}
    for stat in FORM_STATS_V2:
        feat[f"form_{stat}"] = exp_decay_mean(prior[stat].tolist(), alpha=DECAY_ALPHA_V2)

    feat["xmin"] = float(prior["starts"].mean()) if len(prior) else 0.0
    feat["was_home"] = 1.0 if bool(target_row["was_home"]) else 0.0
    feat["value_scaled"] = float(target_row["value"]) / VALUE_SCALE_V2

    lam_for, lam_against = engine.lambdas(
        int(target_row["team_id"]), int(target_row["opponent_team"]),
        bool(target_row["was_home"]), before_gw=int(target_row["gw"]),
    )
    feat["team_lambda_for"] = lam_for
    feat["team_lambda_against"] = lam_against
    feat["p_clean_sheet"] = MatchEngine.p_clean_sheet(lam_against)
    return feat


def build_samples_v2(history: pd.DataFrame, engine: MatchEngine) -> pd.DataFrame:
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue  # need at least one prior gameweek for form features
            feat = build_feature_row_v2(prior, target, engine)
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "target": float(target["total_points"]),
                "actual_minutes": int(target["minutes"]),
            })
            rows.append(feat)
    cols = FEATURE_COLUMNS_V2 + ["player_id", "gw", "position", "target", "actual_minutes"]
    return pd.DataFrame(rows, columns=cols)
