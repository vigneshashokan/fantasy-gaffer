"""Points-table tests: hand-built rows per component branch, score_draws on
tiny arrays, and the full-snapshot regression (the committed 2025/26 CSV —
the table can never silently rot)."""
import os

import numpy as np
import pandas as pd
import pytest

from points_rules import recompute_total_points, score_draws

SNAPSHOT = os.path.join(os.path.dirname(__file__), "..", "data",
                        "player_gw_history_2025-26.csv.gz")


def row(**over) -> dict:
    base = {
        "position": "MID", "minutes": 90, "goals_scored": 0, "assists": 0,
        "clean_sheets": 0, "goals_conceded": 0, "bonus": 0, "saves": 0,
        "penalties_saved": 0, "penalties_missed": 0, "yellow_cards": 0,
        "red_cards": 0, "own_goals": 0, "defensive_contribution": 0,
    }
    base.update(over)
    return base


def recompute_one(**over) -> int:
    return int(recompute_total_points(pd.DataFrame([row(**over)])).iloc[0])


def test_appearance_only():
    assert recompute_one(minutes=90) == 2
    assert recompute_one(minutes=45) == 1
    assert recompute_one(minutes=0) == 0


def test_goal_values_by_position():
    assert recompute_one(position="FWD", goals_scored=2) == 2 + 8
    assert recompute_one(position="MID", goals_scored=1) == 2 + 5
    assert recompute_one(position="DEF", goals_scored=1) == 2 + 6
    assert recompute_one(position="GKP", goals_scored=1) == 2 + 10


def test_clean_sheet_needs_60_and_position_value():
    assert recompute_one(position="DEF", clean_sheets=1) == 2 + 4
    assert recompute_one(position="MID", clean_sheets=1) == 2 + 1
    assert recompute_one(position="FWD", clean_sheets=1) == 2 + 0
    assert recompute_one(position="DEF", clean_sheets=1, minutes=59) == 1  # no CS < 60'


def test_gc_saves_pens_cards_og():
    assert recompute_one(position="GKP", goals_conceded=3) == 2 - 1
    assert recompute_one(position="MID", goals_conceded=3) == 2  # MID: no GC penalty
    assert recompute_one(position="GKP", saves=7) == 2 + 2
    assert recompute_one(position="GKP", penalties_saved=1) == 2 + 5
    assert recompute_one(position="FWD", penalties_missed=1) == 2 - 2
    assert recompute_one(yellow_cards=1, red_cards=1) == 2 - 4
    assert recompute_one(own_goals=1) == 2 - 2


def test_dc_thresholds():
    assert recompute_one(position="DEF", defensive_contribution=10) == 2 + 2
    assert recompute_one(position="DEF", defensive_contribution=9) == 2
    assert recompute_one(position="MID", defensive_contribution=12) == 2 + 2
    assert recompute_one(position="MID", defensive_contribution=11) == 2
    assert recompute_one(position="GKP", defensive_contribution=99) == 2  # not eligible


def test_score_draws_hand_case():
    ev = {
        "played": np.array([True, True, False]),
        "full": np.array([True, False, False]),
        "goals": np.array([1, 0, 0]),
        "assists": np.array([0, 1, 0]),
        "gc_on": np.array([0, 2, 0]),
        "cs": np.array([1, 0, 0]),
        "saves": np.array([0, 0, 0]),
        "pen_saved": np.array([0, 0, 0]),
        "pen_missed": np.array([0, 0, 0]),
        "yellow": np.array([0, 1, 0]),
        "red": np.array([0, 0, 0]),
        "own_goals": np.array([0, 0, 0]),
        "dc_hit": np.array([1, 0, 0]),
        "bonus": np.array([3, 0, 0]),
    }
    out = score_draws("MID", ev)
    # draw0: 2 app + 5 goal + 1 cs + 2 dc + 3 bonus = 13
    # draw1: 1 app + 3 assist - 1 yellow = 3 (MID: no GC penalty)
    # draw2: absent = 0
    assert out.tolist() == [13, 3, 0]


def test_score_draws_gkp_def_gc_penalty():
    ev = {k: np.zeros(1, dtype=int) for k in
          ("goals", "assists", "cs", "saves", "pen_saved", "pen_missed",
           "yellow", "red", "own_goals", "dc_hit", "bonus")}
    ev["played"] = np.array([True])
    ev["full"] = np.array([True])
    ev["gc_on"] = np.array([4])
    assert score_draws("DEF", ev).tolist() == [0]   # 2 app - 2 gc
    assert score_draws("FWD", ev).tolist() == [2]   # no GC penalty


def test_full_snapshot_zero_mismatches():
    df = pd.read_csv(SNAPSHOT)
    recomputed = recompute_total_points(df)
    mismatches = int((recomputed != df["total_points"]).sum())
    assert mismatches == 0, f"{mismatches} rows disagree with the points table"
