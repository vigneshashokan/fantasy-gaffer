"""Accuracy + decision metrics for the backtest."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import spearmanr


def mae(pred: pd.Series, actual: pd.Series) -> float:
    return float(np.mean(np.abs(np.asarray(pred, float) - np.asarray(actual, float))))


def within_position_spearman(df: pd.DataFrame, pred_col: str, actual_col: str = "actual") -> float:
    corrs = []
    for _, g in df.groupby("position"):
        if len(g) < 3:
            continue
        if g[pred_col].nunique() < 2 or g[actual_col].nunique() < 2:
            continue
        rho, _ = spearmanr(g[pred_col], g[actual_col])
        if not np.isnan(rho):
            corrs.append(rho)
    return float(np.mean(corrs)) if corrs else 0.0


def captaincy_points(df: pd.DataFrame, pred_col: str, actual_col: str = "actual") -> float:
    total = 0.0
    for _, g in df.groupby("gw"):
        pick = g.loc[g[pred_col].idxmax()]
        total += float(pick[actual_col])
    return total


def interval_coverage(df: pd.DataFrame, lo_col: str, hi_col: str, actual_col: str = "actual") -> float:
    if len(df) == 0:
        return 0.0
    inside = (df[actual_col] >= df[lo_col]) & (df[actual_col] <= df[hi_col])
    return float(inside.mean())
