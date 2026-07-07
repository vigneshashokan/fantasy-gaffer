"""FPL points conversion (#129, spec §3e): a row path for recomputing
actual history rows (the snapshot regression test) and a vectorized path
for scoring simulated draws. Both read the same feature_spec_v3 constants,
so the table cannot drift between them."""
from __future__ import annotations

import numpy as np
import pandas as pd

from feature_spec_v3 import (APPEARANCE_POINT, ASSIST_POINTS, CS_POINTS,
                             DC_POINTS, DC_THRESHOLD, FULL_APPEARANCE_POINT,
                             GC_PER_2_POINTS, GOAL_POINTS, OWN_GOAL_POINTS,
                             PEN_MISS_POINTS, PEN_SAVE_POINTS, RED_POINTS,
                             SAVES_PER_3_POINTS, YELLOW_POINTS)


def recompute_total_points(df: pd.DataFrame) -> pd.Series:
    """total_points from a history row's component columns. Mirrors the
    PR #142 validation SQL (0 mismatches on all of 2025/26)."""
    pos = df["position"]
    played = df["minutes"] >= 1
    full = df["minutes"] >= 60
    pts = played.astype(int) * APPEARANCE_POINT + full.astype(int) * FULL_APPEARANCE_POINT
    pts = pts + df["goals_scored"] * pos.map(GOAL_POINTS)
    pts = pts + df["assists"] * ASSIST_POINTS
    pts = pts + np.where(full & (df["clean_sheets"] > 0), pos.map(CS_POINTS), 0)
    is_gkp_def = pos.isin(["GKP", "DEF"])
    pts = pts + np.where(is_gkp_def, (df["goals_conceded"] // 2) * GC_PER_2_POINTS, 0)
    pts = pts + (df["saves"] // 3) * SAVES_PER_3_POINTS
    pts = pts + df["penalties_saved"] * PEN_SAVE_POINTS
    pts = pts + df["penalties_missed"] * PEN_MISS_POINTS
    pts = pts + df["yellow_cards"] * YELLOW_POINTS + df["red_cards"] * RED_POINTS
    pts = pts + df["own_goals"] * OWN_GOAL_POINTS
    thresh = pos.map(DC_THRESHOLD)
    dc_hit = thresh.notna() & (df["defensive_contribution"] >= thresh.fillna(10 ** 9))
    pts = pts + dc_hit.astype(int) * DC_POINTS
    pts = pts + df["bonus"]
    return pts.astype(int)


def score_draws(position: str, ev: dict) -> np.ndarray:
    """Score simulated draws (equal-length arrays; see Task 1 interface).
    Absent draws score exactly 0: every event array is 0 there and the
    appearance terms are gated on played/full."""
    played = ev["played"].astype(np.int64)
    full = ev["full"].astype(np.int64)
    pts = played * APPEARANCE_POINT + full * FULL_APPEARANCE_POINT
    pts = pts + ev["goals"] * GOAL_POINTS[position]
    pts = pts + ev["assists"] * ASSIST_POINTS
    pts = pts + ev["cs"] * CS_POINTS[position]
    if position in ("GKP", "DEF"):
        pts = pts + (ev["gc_on"] // 2) * GC_PER_2_POINTS
    pts = pts + (ev["saves"] // 3) * SAVES_PER_3_POINTS
    pts = pts + ev["pen_saved"] * PEN_SAVE_POINTS + ev["pen_missed"] * PEN_MISS_POINTS
    pts = pts + ev["yellow"] * YELLOW_POINTS + ev["red"] * RED_POINTS
    pts = pts + ev["own_goals"] * OWN_GOAL_POINTS
    pts = pts + ev["dc_hit"] * DC_POINTS
    pts = pts + ev["bonus"]
    return pts.astype(np.int64)
