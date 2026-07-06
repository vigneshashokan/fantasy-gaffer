"""v2.1 feature rows: v1's machinery with xmin replaced by the minutes-model
outputs. The heuristic xmin is still computed and carried on every row — it
is the eval-population filter and a diagnostic, NOT a model feature."""
from __future__ import annotations

import pandas as pd

from feature_spec_v21 import FEATURE_COLUMNS_V21
from features import build_feature_row


def build_feature_row_v21(prior_rows: pd.DataFrame, target_row: pd.Series,
                          team_strengths: dict[int, dict],
                          minutes_pred: dict) -> dict:
    """minutes_pred: {'p_play': float, 'p60': float} from the precompute.
    The dict keeps v1's xmin key (diagnostic) alongside the v21 columns."""
    feat = build_feature_row(prior_rows, target_row, team_strengths)
    feat["p_play"] = float(minutes_pred["p_play"])
    feat["p60"] = float(minutes_pred["p60"])
    return feat


def build_samples_v21(history: pd.DataFrame, team_strengths: dict[int, dict],
                      minutes_preds: pd.DataFrame) -> pd.DataFrame:
    """Mirrors features.build_samples; joins the leakage-safe minutes
    predictions on (player_id, gw). A missing prediction for an eligible row
    is a precompute/join bug -> raise, never impute (spec §8)."""
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in minutes_preds.iterrows()}
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue
            key = (int(player_id), int(target["gw"]))
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            feat = build_feature_row_v21(prior, target, team_strengths,
                                         {"p_play": p_play, "p60": p60})
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "target": float(target["total_points"]),
            })
            rows.append(feat)
    cols = FEATURE_COLUMNS_V21 + ["xmin", "player_id", "gw", "position", "target"]
    return pd.DataFrame(rows, columns=cols)
