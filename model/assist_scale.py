"""Strictly-prior global assist-rate multiplier for v3.1 (#144, spec §3).

FPL's assist definition is broader than xA (#129 diagnostics: p_assist under
by ~26%); k rescales the xA-derived assist rate to the observed aggregate.
Pure; no I/O. Callers are responsible for passing a pre-filtered gw<t frame
(same contract as rates_v3). On a #128 revival, serving computes k from the
full current-season history at serve time — strictly prior by construction."""
from __future__ import annotations

import pandas as pd

ASSIST_SCALE_FALLBACK = 1.0


def compute_assist_scale(past: pd.DataFrame) -> float:
    if len(past) == 0:
        return ASSIST_SCALE_FALLBACK
    denom = float(past["expected_assists"].sum())
    if denom <= 0.0:
        return ASSIST_SCALE_FALLBACK
    return float(past["assists"].sum()) / denom
