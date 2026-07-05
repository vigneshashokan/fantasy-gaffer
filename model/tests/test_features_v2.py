import pandas as pd
import pytest

from feature_spec_v2 import FEATURE_COLUMNS_V2
from features_v2 import build_feature_row_v2, build_samples_v2
from match_engine import MatchEngine, build_team_fixtures


def _hrow(player_id, gw, fixture, team, opp, home, position="MID", minutes=90,
          starts=1, points=5, xg=0.4, value=75):
    return {
        "player_id": player_id, "gw": gw, "fixture_id": fixture,
        "team_id": team, "opponent_team": opp, "was_home": home,
        "position": position, "minutes": minutes, "starts": starts,
        "total_points": points, "expected_goals": xg, "expected_assists": 0.1,
        "expected_goal_involvements": xg + 0.1, "expected_goals_conceded": 1.0,
        "threat": 20.0, "creativity": 10.0, "influence": 15.0, "bps": 20,
        "defensive_contribution": 2, "goals_scored": 0, "value": value,
    }


# GW1+2 history for player 101 (team 1); GW3 is the prediction target.
HISTORY = pd.DataFrame([
    _hrow(101, 1, 10, 1, 2, True, points=8, xg=0.6),
    _hrow(201, 1, 10, 2, 1, False, xg=0.2),
    _hrow(101, 2, 20, 1, 3, False, points=2, xg=0.1),
    _hrow(301, 2, 20, 3, 1, True, xg=0.9),
    _hrow(101, 3, 30, 1, 4, True, points=6, xg=0.5),
    _hrow(401, 3, 30, 4, 1, False, xg=0.3),
])
ENGINE = MatchEngine(build_team_fixtures(HISTORY))


def test_row_has_exactly_the_v2_columns():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    assert set(feat.keys()) == set(FEATURE_COLUMNS_V2)


def test_match_features_come_from_engine_at_target_gw():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    lam_for, lam_against = ENGINE.lambdas(1, 4, was_home=True, before_gw=3)
    assert feat["team_lambda_for"] == pytest.approx(lam_for)
    assert feat["team_lambda_against"] == pytest.approx(lam_against)
    assert feat["p_clean_sheet"] == pytest.approx(MatchEngine.p_clean_sheet(lam_against))


def test_no_xgi_and_no_static_strength_keys():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    assert "form_expected_goal_involvements" not in feat
    assert "opp_strength_def" not in feat


def test_form_and_scalar_features_match_v1_semantics():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    # recent-first points [2 (GW2), 8 (GW1)], alpha .85 -> (2 + .85*8)/1.85
    assert feat["form_total_points"] == pytest.approx((2 + 0.85 * 8) / 1.85)
    assert feat["xmin"] == 1.0
    assert feat["was_home"] == 1.0
    assert feat["value_scaled"] == pytest.approx(7.5)


def test_build_samples_v2_skips_first_appearance_and_labels_target():
    samples = build_samples_v2(HISTORY, ENGINE)
    p101 = samples[samples.player_id == 101]
    assert list(p101.gw) == [2, 3]  # GW1 skipped (no prior rows)
    assert float(p101[p101.gw == 3].target.iloc[0]) == 6.0
    assert set(FEATURE_COLUMNS_V2).issubset(samples.columns)
