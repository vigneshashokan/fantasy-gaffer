"""Baselines the v1 model must beat. (c) is the meaningful bar."""
from __future__ import annotations

import pandas as pd

from feature_spec import FORM_WINDOW
from features import exp_decay_mean


def baseline_last_gw(prior_rows: pd.DataFrame) -> float:
    if len(prior_rows) == 0:
        return 0.0
    last = prior_rows.sort_values(["gw", "fixture_id"]).iloc[-1]
    return float(last["total_points"])


def baseline_ppg(prior_rows: pd.DataFrame) -> float:
    if len(prior_rows) == 0:
        return 0.0
    return float(prior_rows["total_points"].mean())


def baseline_form(prior_rows: pd.DataFrame) -> float:
    if len(prior_rows) == 0:
        return 0.0
    recent = prior_rows.sort_values(["gw", "fixture_id"], ascending=False).head(FORM_WINDOW)
    return exp_decay_mean(recent["total_points"].tolist())
