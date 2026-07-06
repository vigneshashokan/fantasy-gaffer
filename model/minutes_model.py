"""Minutes/rotation hurdle model for xPts v2.1 (#127). Pure; no I/O.

Two binary logits per position — play = P(minutes >= 1), p60_given_play =
P(minutes >= 60 | played) — on 8 minutes/starts-derived features. Downstream
features: p_play and p60 = p_play * p60_given_play. Fitting/prediction and
the leakage-safe per-GW precompute complete the module in later tasks.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import statsmodels.api as sm

from feature_spec import POSITIONS
from feature_spec_v21 import (
    MINUTES_CUTOFF,
    MINUTES_FEATURE_COLUMNS,
    MINUTES_L1_ALPHA,
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


_P_MIN, _P_MAX = 1e-6, 1.0 - 1e-6


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def _clip(p: float) -> float:
    return min(max(p, _P_MIN), _P_MAX)


def _intercept_only(rate: float) -> dict:
    """Uniform artifact shape: const = logit(clipped rate), all coefs 0."""
    r = _clip(rate)
    entry = {"const": math.log(r / (1.0 - r))}
    entry.update({c: 0.0 for c in MINUTES_FEATURE_COLUMNS})
    return entry


def _fit_logit(df: pd.DataFrame, label: str) -> dict:
    """One L1-regularized logit -> {const, <feature>: coef}. Falls back to
    intercept-only when the subset is too small or single-class (never
    crashes the walk-forward — spec §2)."""
    y = df[label]
    if len(df) <= len(MINUTES_FEATURE_COLUMNS) + 1 or y.nunique() < 2:
        return _intercept_only(float(y.mean()) if len(df) else 0.5)
    X = sm.add_constant(df[MINUTES_FEATURE_COLUMNS], has_constant="add")
    alpha = np.full(X.shape[1], MINUTES_L1_ALPHA)
    alpha[list(X.columns).index("const")] = 0.0  # never penalize the intercept
    res = sm.Logit(y, X).fit_regularized(method="l1", alpha=alpha, disp=0,
                                         maxiter=1000)
    params = res.params
    entry = {"const": float(params.get("const", 0.0))}
    for c in MINUTES_FEATURE_COLUMNS:
        entry[c] = float(params.get(c, 0.0))
    return entry


def fit_minutes_models(samples: pd.DataFrame) -> dict:
    """Per-position hurdle pair: play on all rows, p60_given_play on the
    played subset."""
    models: dict[str, dict] = {}
    for pos in POSITIONS:
        pos_df = samples[samples["position"] == pos]
        played_df = pos_df[pos_df["played"] == 1.0]
        models[pos] = {
            "play": _fit_logit(pos_df, "played"),
            "p60_given_play": _fit_logit(played_df, "sixty"),
        }
    return models


def predict_minutes(minutes_models: dict, feature_row: dict,
                    position: str) -> tuple[float, float]:
    """(p_play, p60) via the hurdle: p60 = p_play * P(60+ | played)."""
    m = minutes_models.get(position)
    if m is None:
        return (0.5, 0.25)

    def _p(entry: dict) -> float:
        z = entry["const"]
        for c in MINUTES_FEATURE_COLUMNS:
            z += entry[c] * float(feature_row[c])
        return _clip(_sigmoid(z))

    p_play = _p(m["play"])
    p60 = _clip(p_play * _p(m["p60_given_play"]))
    return (p_play, p60)
