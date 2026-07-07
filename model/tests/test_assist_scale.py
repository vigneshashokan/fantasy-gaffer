"""assist_scale tests: exact ratio, both fallback paths, the caller's
strictly-prior contract, and the spec §3 non-mutating application pattern."""
import numpy as np
import pandas as pd
import pytest

from assist_scale import ASSIST_SCALE_FALLBACK, compute_assist_scale


def test_exact_ratio():
    past = pd.DataFrame({"assists": [1, 0, 2], "expected_assists": [0.5, 0.5, 1.0]})
    assert compute_assist_scale(past) == pytest.approx(3.0 / 2.0)


def test_empty_frame_falls_back():
    past = pd.DataFrame({"assists": [], "expected_assists": []})
    assert compute_assist_scale(past) == ASSIST_SCALE_FALLBACK


def test_zero_denominator_falls_back():
    past = pd.DataFrame({"assists": [2], "expected_assists": [0.0]})
    assert compute_assist_scale(past) == ASSIST_SCALE_FALLBACK


def test_caller_prior_filter_matters():
    # k is sensitive to which rows the caller includes — proving the
    # strictly-prior contract (pass history[gw < t], never the full frame).
    hist = pd.DataFrame({"gw": [1, 1, 2],
                         "assists": [1, 1, 10],
                         "expected_assists": [1.0, 1.0, 1.0]})
    k_past = compute_assist_scale(hist[hist["gw"] < 2])
    k_full = compute_assist_scale(hist)
    assert k_past == pytest.approx(1.0)
    assert k_full == pytest.approx(4.0)


def test_scaled_application_is_non_mutating_and_non_compounding():
    # The spec §3 mandated application pattern must leave the
    # build_player_rates output — and anything it may share, e.g.
    # rates_v3._EMPTY_PRIOR — untouched, and must not compound on re-application.
    from rates_v3 import _EMPTY_PRIOR, build_player_rates
    prior = pd.DataFrame([{
        "player_id": 1, "gw": 1, "fixture_id": 10, "position": "MID",
        "minutes": 90, "expected_goals": 0.3, "expected_assists": 0.4,
        "saves": 0, "yellow_cards": 0, "red_cards": 0, "own_goals": 0,
        "penalties_missed": 0, "penalties_saved": 0, "bonus": 0,
        "defensive_contribution": 0,
    }])
    k = 1.3
    player = build_player_rates(prior, "MID", {})
    base_xa = player["rates"]["xa90"]
    scaled = {**player, "rates": {**player["rates"],
                                  "xa90": player["rates"]["xa90"] * k}}
    assert scaled["rates"]["xa90"] == pytest.approx(base_xa * k)
    assert player["rates"]["xa90"] == pytest.approx(base_xa)  # source untouched
    scaled2 = {**player, "rates": {**player["rates"],
                                   "xa90": player["rates"]["xa90"] * k}}
    assert scaled2["rates"]["xa90"] == pytest.approx(base_xa * k)  # no compounding
    assert _EMPTY_PRIOR["rates"]["xa90"] == 0.0  # module state pristine
