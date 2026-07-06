"""v2.1 feature rows: v1 machinery + minutes outputs; xmin kept as diagnostic."""
import pandas as pd
import pytest

from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import FEATURE_COLUMNS_V21
from features import build_feature_row
from features_v21 import build_feature_row_v21, build_samples_v21
from minutes_model import precompute_minutes_predictions

STRENGTHS = {5: {"strength_defence_home": 1200, "strength_defence_away": 1300,
                 "strength_attack_home": 1100, "strength_attack_away": 1000}}


def _prior_stats_rows():
    return pd.DataFrame([
        {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 5,
         "expected_goals": 0.2, "expected_assists": 0.1,
         "expected_goal_involvements": 0.3, "threat": 30.0, "creativity": 20.0,
         "influence": 25.0, "bps": 20, "defensive_contribution": 2, "value": 60},
        {"gw": 2, "fixture_id": 20, "starts": 0, "minutes": 20, "total_points": 1,
         "expected_goals": 0.05, "expected_assists": 0.02,
         "expected_goal_involvements": 0.07, "threat": 8.0, "creativity": 5.0,
         "influence": 6.0, "bps": 5, "defensive_contribution": 1, "value": 60},
    ])


def test_row_matches_v1_on_shared_columns_and_adds_minutes_outputs():
    prior = _prior_stats_rows()
    target = pd.Series({"was_home": True, "opponent_team": 5, "value": 60})
    v1 = build_feature_row(prior, target, STRENGTHS)
    v21 = build_feature_row_v21(prior, target, STRENGTHS,
                                {"p_play": 0.8, "p60": 0.6})
    for c in FEATURE_COLUMNS:          # includes xmin — kept as diagnostic
        assert v21[c] == v1[c]
    assert v21["p_play"] == 0.8 and v21["p60"] == 0.6


def test_build_samples_v21_joins_and_raises_on_missing(synthetic_history,
                                                       synthetic_strengths):
    small = synthetic_history[synthetic_history["gw"] <= 5]
    preds = precompute_minutes_predictions(small)
    s = build_samples_v21(small, synthetic_strengths, preds)
    assert "xmin" in s.columns and "xmin" not in FEATURE_COLUMNS_V21
    assert {"p_play", "p60"} <= set(s.columns)
    assert len(s) == 8 * 4             # 8 players x gws 2..5
    with pytest.raises(KeyError):
        build_samples_v21(small, synthetic_strengths, preds[preds["gw"] != 3])


def test_dgw_rows_join_the_single_shared_prediction(synthetic_history,
                                                    synthetic_strengths):
    small = synthetic_history[synthetic_history["gw"] <= 5].copy()
    extra = small[(small["player_id"] == 1) & (small["gw"] == 5)].copy()
    extra["fixture_id"] = 9999          # second fixture, same GW (DGW)
    dgw_history = pd.concat([small, extra], ignore_index=True)
    preds = precompute_minutes_predictions(dgw_history)
    s = build_samples_v21(dgw_history, synthetic_strengths, preds)
    dgw = s[(s["player_id"] == 1) & (s["gw"] == 5)]
    assert len(dgw) == 2                          # one sample per fixture
    assert dgw["p_play"].nunique() == 1           # both join the one prediction
    assert dgw["p60"].nunique() == 1
