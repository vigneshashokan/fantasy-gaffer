"""Minutes feature construction + sample building."""
import pandas as pd
import pytest

from minutes_model import build_minutes_feature_row, build_minutes_samples


def _prior(specs):
    # specs: list of (gw, fixture_id, starts, minutes)
    return pd.DataFrame([{"gw": g, "fixture_id": f, "starts": s, "minutes": m}
                         for g, f, s, m in specs])


def test_windows_and_shares():
    prior = _prior([(1, 10, 1, 90), (2, 20, 1, 90), (3, 30, 0, 20), (4, 40, 1, 90),
                    (5, 50, 0, 0), (6, 60, 1, 65), (7, 70, 0, 10)])
    feat = build_minutes_feature_row(prior)
    # long window = the 6 most recent rows (gws 2..7); short = gws 5..7
    assert feat["start_share_6"] == pytest.approx(3 / 6)
    assert feat["start_share_3"] == pytest.approx(1 / 3)
    assert feat["mins_share_6"] == pytest.approx((10 + 65 + 0 + 90 + 20 + 90) / 6 / 90)
    assert feat["p60_share_6"] == pytest.approx(3 / 6)
    assert feat["started_last"] == 0.0
    assert feat["mins_last"] == pytest.approx(10 / 90)
    assert feat["zeros_last_3"] == 1.0
    assert feat["n_prior"] == 1.0


def test_n_prior_clamp_short_history():
    feat = build_minutes_feature_row(_prior([(1, 10, 1, 90), (2, 20, 0, 0)]))
    assert feat["n_prior"] == pytest.approx(2 / 6)
    assert feat["zeros_last_3"] == 1.0
    assert feat["start_share_3"] == pytest.approx(1 / 2)


def _history():
    rows = []
    for pid, specs in {
        1: [(1, 10, 1, 90), (2, 20, 1, 90), (3, 30, 0, 0)],
        2: [(2, 21, 1, 62), (3, 31, 1, 90), (3, 32, 0, 20)],  # DGW at gw 3
    }.items():
        for g, f, s, m in specs:
            rows.append({"player_id": pid, "gw": g, "fixture_id": f, "starts": s,
                         "minutes": m, "position": "MID"})
    return pd.DataFrame(rows)


def test_samples_skip_first_appearance_and_label():
    s = build_minutes_samples(_history())
    # player 1: gws 2,3 eligible; player 2: both gw-3 rows (gw 2 is his first)
    assert len(s) == 4
    p1_gw3 = s[(s["player_id"] == 1) & (s["gw"] == 3)].iloc[0]
    assert p1_gw3["played"] == 0.0 and p1_gw3["sixty"] == 0.0
    p1_gw2 = s[(s["player_id"] == 1) & (s["gw"] == 2)].iloc[0]
    assert p1_gw2["played"] == 1.0 and p1_gw2["sixty"] == 1.0


def test_dgw_rows_share_features_but_carry_own_labels():
    s = build_minutes_samples(_history())
    dgw = s[(s["player_id"] == 2) & (s["gw"] == 3)]
    assert len(dgw) == 2
    for c in ["start_share_6", "mins_share_6", "n_prior"]:
        assert dgw[c].nunique() == 1          # same prior rows -> same features
    assert sorted(dgw["sixty"]) == [0.0, 1.0]  # per-fixture labels differ


import math

from feature_spec_v21 import MINUTES_FEATURE_COLUMNS
from minutes_model import fit_minutes_models, predict_minutes


def test_intercept_only_fallback_single_class():
    rows = []
    for i in range(30):
        feat = {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}
        feat.update({"player_id": i, "gw": 2, "position": "GKP",
                     "played": 1.0, "sixty": 1.0})
        rows.append(feat)
    models = fit_minutes_models(pd.DataFrame(rows))
    play = models["GKP"]["play"]
    assert all(play[c] == 0.0 for c in MINUTES_FEATURE_COLUMNS)
    p_play, p60 = predict_minutes(models, {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}, "GKP")
    assert p_play > 0.999 and p60 > 0.999


def test_empty_position_gets_default_fallback():
    # No DEF rows at all -> intercept-only at rate 0.5, never a crash.
    rows = [{**{c: 0.5 for c in MINUTES_FEATURE_COLUMNS},
             "player_id": 1, "gw": 2, "position": "MID", "played": 1.0, "sixty": 0.0}]
    models = fit_minutes_models(pd.DataFrame(rows))
    p_play, _ = predict_minutes(models, {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}, "DEF")
    assert p_play == pytest.approx(0.5, abs=1e-3)


def test_hurdle_math_and_bounds():
    entry = {"const": 0.0}
    entry.update({c: 0.0 for c in MINUTES_FEATURE_COLUMNS})
    models = {"MID": {"play": {**entry, "const": 1.0},
                      "p60_given_play": {**entry, "const": -1.0}}}
    row = {c: 0.0 for c in MINUTES_FEATURE_COLUMNS}
    p_play, p60 = predict_minutes(models, row, "MID")
    assert p_play == pytest.approx(1 / (1 + math.exp(-1.0)))
    assert p60 == pytest.approx(p_play * (1 / (1 + math.exp(1.0))))
    assert 0.0 < p60 < p_play < 1.0


def test_learned_signal_orders_probabilities():
    rows = []
    for i in range(60):
        starter = i % 2 == 0
        base = 0.9 if starter else 0.1
        feat = {"start_share_6": base, "start_share_3": base, "mins_share_6": base,
                "p60_share_6": base, "started_last": 1.0 if starter else 0.0,
                "mins_last": base, "zeros_last_3": 0.0 if starter else 2.0,
                "n_prior": 1.0}
        played = 1.0 if (starter or i % 8 == 1) else 0.0
        sixty = 1.0 if (starter and i % 10 != 2) else 0.0
        feat.update({"player_id": i, "gw": 5, "position": "MID",
                     "played": played, "sixty": sixty})
        rows.append(feat)
    models = fit_minutes_models(pd.DataFrame(rows))
    hi = {"start_share_6": 0.9, "start_share_3": 0.9, "mins_share_6": 0.9,
          "p60_share_6": 0.9, "started_last": 1.0, "mins_last": 0.9,
          "zeros_last_3": 0.0, "n_prior": 1.0}
    lo = {**hi, "start_share_6": 0.1, "start_share_3": 0.1, "mins_share_6": 0.1,
          "p60_share_6": 0.1, "started_last": 0.0, "mins_last": 0.1, "zeros_last_3": 2.0}
    assert predict_minutes(models, hi, "MID")[1] > predict_minutes(models, lo, "MID")[1]
