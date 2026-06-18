import numpy as np
import pandas as pd
import pytest

from features import (
    decay_weights,
    exp_decay_mean,
    opponent_strengths,
    build_feature_row,
    build_samples,
)
from feature_spec import DECAY_ALPHA, FEATURE_COLUMNS

STRENGTHS = {
    5: {"strength_defence_home": 1200, "strength_defence_away": 1300,
        "strength_attack_home": 1100, "strength_attack_away": 1000},
    9: {"strength_defence_home": 1000, "strength_defence_away": 1050,
        "strength_attack_home": 1250, "strength_attack_away": 1150},
}


def _row(player_id, gw, fixture, was_home, opp, position, minutes, starts,
         total_points, xg=0.0, value=55):
    return {
        "player_id": player_id, "gw": gw, "fixture_id": fixture,
        "was_home": was_home, "opponent_team": opp, "position": position,
        "minutes": minutes, "starts": starts, "total_points": total_points,
        "expected_goals": xg, "expected_assists": 0.0,
        "expected_goal_involvements": xg, "threat": 0.0, "creativity": 0.0,
        "influence": 0.0, "bps": 0, "defensive_contribution": 0, "value": value,
    }


def test_decay_weights_normalized_and_decreasing():
    w = decay_weights(3, alpha=0.85)
    assert pytest.approx(w.sum()) == 1.0
    assert w[0] > w[1] > w[2]
    assert len(decay_weights(0)) == 0


def test_exp_decay_mean_weights_recent_more():
    # most-recent-first: [10, 0] with alpha 0.85 -> 10*1/(1.85)
    assert exp_decay_mean([10.0, 0.0], alpha=0.85) == pytest.approx(10 * 1 / 1.85)
    assert exp_decay_mean([]) == 0.0


def test_opponent_strengths_missing_key_returns_zeros():
    # Opponent id not in strengths map -> both scaled values are 0.0.
    d, a = opponent_strengths(True, 99, STRENGTHS)
    assert d == 0.0
    assert a == 0.0


def test_opponent_strengths_home_uses_opponent_away_strength_scaled():
    # player at home -> opponent is away -> use opponent's *away* strengths
    d, a = opponent_strengths(True, 5, STRENGTHS)
    assert d == pytest.approx(1300 / 1000.0)
    assert a == pytest.approx(1000 / 1000.0)
    d2, a2 = opponent_strengths(False, 5, STRENGTHS)  # player away -> opp home
    assert d2 == pytest.approx(1200 / 1000.0)
    assert a2 == pytest.approx(1100 / 1000.0)


def test_build_feature_row_uses_only_prior_rows_and_target_fixture_facts():
    prior = pd.DataFrame([
        _row(1, 1, 10, True, 9, "MID", 90, 1, 2, xg=0.1, value=55),
        _row(1, 2, 20, False, 9, "MID", 90, 1, 8, xg=0.5, value=56),
    ])
    target = pd.Series(_row(1, 3, 30, True, 5, "MID", 90, 1, 6, xg=0.2, value=57))
    feat = build_feature_row(prior, target, STRENGTHS)
    assert set(feat.keys()) == set(FEATURE_COLUMNS)
    # xmin = recent starts share over prior rows = 1.0
    assert feat["xmin"] == pytest.approx(1.0)
    # fixture facts come from the target row
    assert feat["was_home"] == 1.0
    assert feat["value_scaled"] == pytest.approx(57 / 10.0)
    assert feat["opp_strength_def"] == pytest.approx(1300 / 1000.0)
    # form_total_points = exp-decay over [8, 2] (most recent first, default DECAY_ALPHA)
    assert feat["form_total_points"] == pytest.approx((8 * 1 + 2 * DECAY_ALPHA) / (1 + DECAY_ALPHA))


def test_build_samples_skips_gw1_and_sets_target():
    history = pd.DataFrame([
        _row(1, 1, 10, True, 9, "MID", 90, 1, 2),
        _row(1, 2, 20, False, 9, "MID", 60, 1, 8),
        _row(2, 1, 11, True, 5, "DEF", 90, 1, 6),
    ])
    samples = build_samples(history, STRENGTHS)
    # only player 1's GW2 has a prior row; player 2 has only GW1 -> no sample
    assert len(samples) == 1
    s = samples.iloc[0]
    assert s["player_id"] == 1 and s["gw"] == 2
    assert s["target"] == 8 and s["position"] == "MID"
    assert set(FEATURE_COLUMNS).issubset(set(samples.columns))
