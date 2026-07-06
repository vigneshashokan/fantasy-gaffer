import pandas as pd
import pytest

from backtest_v2 import evaluate_v2, hot3_points, engine_metrics
from match_engine import MatchEngine


def test_hot3_points_sums_last_three_prior_gws_only():
    h = pd.DataFrame([
        {"player_id": 1, "gw": g, "fixture_id": g, "total_points": p}
        for g, p in [(1, 10), (2, 2), (3, 3), (4, 4), (5, 5)]
    ])
    assert hot3_points(h, player_id=1, gw=5) == 2 + 3 + 4   # gws 2..4
    assert hot3_points(h, player_id=1, gw=2) == 10          # only gw1 exists
    assert hot3_points(h, player_id=9, gw=5) == 0           # unknown player


def _results():
    rows = []
    for i in range(40):
        actual = float(i % 10)
        rows.append({
            "player_id": i, "gw": 8 + (i % 4), "position": "MID",
            "actual": actual,
            "p50_v1": actual + 1.0,          # v1 off by 1
            "p50_v1m": actual + 0.7,
            "p50": actual + 0.5,             # v2 off by 0.5 -> beats v1
            "p25": actual - 1.0, "p75": actual + 1.0,
            "base_form": actual + 2.0,
            "xmin": 1.0,
            "hot3": 30.0 if i < 4 else 5.0,  # 4 hot players (top decile)
        })
    return pd.DataFrame(rows)


def test_evaluate_v2_gate_and_ablation():
    m = evaluate_v2(_results())
    assert m["v2_mae"] == pytest.approx(0.5)
    assert m["v1_mae"] == pytest.approx(1.0)
    assert m["v1m_mae"] == pytest.approx(0.7)
    assert m["beats_v1_mae"] is True
    assert m["coverage"] == pytest.approx(1.0)  # ±1 interval always contains
    assert m["coverage_ok"] is False            # 1.0 is NOT within 0.5±0.1
    assert m["passes_gate"] is False            # coverage fails -> gate fails


def test_evaluate_v2_hot_streak_signed_error():
    m = evaluate_v2(_results())
    # hot slice = the 4 rows with hot3=30; v2 signed error = +0.5 on each
    assert m["hot_streak"]["n"] == 4
    assert m["hot_streak"]["v2_signed_error"] == pytest.approx(0.5)
    assert m["hot_streak"]["base_form_signed_error"] == pytest.approx(2.0)


def _tf_row(team, opp, gw, fixture, home, xg_for, xg_against, gf, ga):
    return {"fixture_id": fixture, "team_id": team, "opponent_team": opp,
            "gw": gw, "was_home": home, "xg_for": xg_for, "xg_against": xg_against,
            "goals_for": gf, "goals_against": ga}


def test_engine_metrics_scores_prediction_vs_actuals():
    # 8 prior GWs of identical matches, then GW9 to score.
    rows = []
    for gw in range(1, 9):
        rows.append(_tf_row(1, 2, gw, gw * 10, True, 1.4, 1.4, 1, 1))
        rows.append(_tf_row(2, 1, gw, gw * 10, False, 1.4, 1.4, 1, 1))
    rows.append(_tf_row(1, 2, 9, 90, True, 2.0, 0.0, 2, 0))   # team 1 CS
    rows.append(_tf_row(2, 1, 9, 90, False, 0.0, 2.0, 0, 2))
    tf = pd.DataFrame(rows)
    static = {1: {"strength_attack_home": 1200, "strength_attack_away": 1100,
                  "strength_defence_home": 1200, "strength_defence_away": 1100},
              2: {"strength_attack_home": 1000, "strength_attack_away": 1000,
                  "strength_defence_home": 1000, "strength_defence_away": 1000}}
    m = engine_metrics(tf, static, start_gw=9)
    assert m["n_team_fixtures"] == 2
    assert 0.0 <= m["cs_brier"] <= 1.0
    assert m["xg_mae"] >= 0.0
    assert "cs_brier_static" in m and "xg_mae_static" in m
