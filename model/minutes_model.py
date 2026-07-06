"""Minutes/rotation hurdle model for xPts v2.1 (#127). Pure; no I/O.

Two binary logits per position — play = P(minutes >= 1), p60_given_play =
P(minutes >= 60 | played) — on 8 minutes/starts-derived features. Downstream
features: p_play and p60 = p_play * p60_given_play. Fitting/prediction and
the leakage-safe per-GW precompute complete the module in later tasks.
"""
from __future__ import annotations

import pandas as pd

from feature_spec_v21 import (
    MINUTES_CUTOFF,
    MINUTES_FEATURE_COLUMNS,
    MINUTES_WINDOW_LONG,
    MINUTES_WINDOW_SHORT,
)


def build_minutes_feature_row(prior_rows: pd.DataFrame) -> dict:
    """The 8 minutes features from a player's prior GW rows (any order).
    prior_rows must be non-empty — first appearances are skipped upstream."""
    prior = prior_rows.sort_values(["gw", "fixture_id"], ascending=False)
    long = prior.head(MINUTES_WINDOW_LONG)
    short = prior.head(MINUTES_WINDOW_SHORT)
    last = prior.iloc[0]
    return {
        "start_share_6": float(long["starts"].mean()),
        "start_share_3": float(short["starts"].mean()),
        "mins_share_6": float((long["minutes"] / 90.0).mean()),
        "p60_share_6": float((long["minutes"] >= MINUTES_CUTOFF).mean()),
        "started_last": float(last["starts"]),
        "mins_last": float(last["minutes"]) / 90.0,
        "zeros_last_3": float((short["minutes"] == 0).sum()),
        "n_prior": min(len(prior), MINUTES_WINDOW_LONG) / MINUTES_WINDOW_LONG,
    }


def build_minutes_samples(history: pd.DataFrame) -> pd.DataFrame:
    """One sample per player-fixture row with >= 1 prior GW row. Labels:
    played (minutes >= 1) and sixty (minutes >= MINUTES_CUTOFF)."""
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue
            feat = build_minutes_feature_row(prior)
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "played": 1.0 if target["minutes"] >= 1 else 0.0,
                "sixty": 1.0 if target["minutes"] >= MINUTES_CUTOFF else 0.0,
            })
            rows.append(feat)
    cols = MINUTES_FEATURE_COLUMNS + ["player_id", "gw", "position", "played", "sixty"]
    return pd.DataFrame(rows, columns=cols)
