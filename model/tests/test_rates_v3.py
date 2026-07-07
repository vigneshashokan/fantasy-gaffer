"""rates_v3 tests: hand-computed decay math, both fallback paths, DC window
semantics, GKP DC ineligibility, and bonus smoothing."""
import numpy as np
import pandas as pd
import pytest

from feature_spec_v3 import RATE_ALPHA
from rates_v3 import build_player_rates, position_rate_priors


def hrow(gw, minutes, *, xg=0.0, saves=0, bonus=0, dc=0, pos="MID", pid=1):
    return {"player_id": pid, "gw": gw, "fixture_id": gw * 10, "position": pos,
            "minutes": minutes, "expected_goals": xg, "expected_assists": 0.0,
            "saves": saves, "yellow_cards": 0, "red_cards": 0, "own_goals": 0,
            "penalties_missed": 0, "penalties_saved": 0, "bonus": bonus,
            "defensive_contribution": dc}


def frame(rows):
    return pd.DataFrame(rows)


def test_xg90_hand_computed_two_rows():
    # Most recent (gw 2): 90', xG 0.9 (w=1); older (gw 1): 45', xG 0.2 (w=alpha).
    prior = frame([hrow(1, 45, xg=0.2), hrow(2, 90, xg=0.9)])
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "MID", priors)
    w = np.array([1.0, RATE_ALPHA])
    expected = 90.0 * (1.0 * 0.9 + RATE_ALPHA * 0.2) / (1.0 * 90 + RATE_ALPHA * 45)
    assert out["rates"]["xg90"] == pytest.approx(expected)


def test_played_rows_only_zero_minute_rows_excluded():
    prior = frame([hrow(1, 90, xg=0.9), hrow(2, 0, xg=0.0)])
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "MID", priors)
    # The 0-minute row must not consume a window slot or affect the rate.
    assert out["rates"]["xg90"] == pytest.approx(90.0 * 0.9 / 90.0)


def test_low_minutes_falls_back_to_position_prior():
    # One 20' cameo (< MIN_DECAYED_MINUTES) -> position prior, not 0.45*90/20.
    pool = frame([hrow(g, 90, xg=0.30, pid=9) for g in range(1, 6)])
    prior = frame([hrow(1, 20, xg=0.45)])
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "MID", priors)
    assert out["rates"]["xg90"] == pytest.approx(priors["MID"]["rates"]["xg90"])
    assert out["rates"]["xg90"] < 1.0  # sanity: prior is pooled, not the cameo rate


def test_unknown_position_prior_gives_zero_rates():
    prior = frame([hrow(1, 20, xg=0.45)])
    out = build_player_rates(prior, "FWD", position_rate_priors(prior.iloc[0:0]))
    assert out["rates"]["xg90"] == 0.0
    assert out["p_dc"] == 0.0
    assert out["bonus"][0] == pytest.approx(1.0)


def test_p_dc_window_is_over_qualifying_rows_and_gkp_zero():
    # 60+' rows: gws 1..8 for a DEF, threshold hits on all -> p_dc ~ 1.
    rows = [hrow(g, 90, dc=12, pos="DEF") for g in range(1, 9)]
    prior = frame(rows)
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "DEF", priors)
    assert out["p_dc"] == pytest.approx(1.0)
    gk = build_player_rates(frame([hrow(g, 90, dc=99, pos="GKP") for g in range(1, 7)]),
                            "GKP", priors)
    assert gk["p_dc"] == 0.0


def test_p_dc_no_qualifying_rows_uses_position_prior():
    pool = frame([hrow(g, 90, dc=12, pos="DEF", pid=9) for g in range(1, 6)])
    prior = frame([hrow(1, 30, dc=0, pos="DEF")])  # played but never 60+
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "DEF", priors)
    assert out["p_dc"] == pytest.approx(priors["DEF"]["p_dc"])


def test_bonus_distribution_smoothed_and_normalized():
    # Position pool must be MIXED (bonus 0s from another player) or the
    # smoothing prior is itself degenerate and bonus[0] stays 0.
    pool = frame([hrow(g, 90, bonus=0, pid=9) for g in range(1, 7)])
    prior = frame([hrow(g, 90, bonus=3) for g in range(1, 7)])
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "MID", priors)
    assert out["bonus"].sum() == pytest.approx(1.0)
    assert out["bonus"][3] > 0.5          # dominated by the observed 3s
    assert out["bonus"][0] > 0.0          # but smoothed, never degenerate


def test_position_rate_priors_pooled_math():
    past = frame([hrow(1, 90, xg=0.5, pid=1), hrow(1, 45, xg=0.25, pid=2)])
    priors = position_rate_priors(past)
    assert priors["MID"]["rates"]["xg90"] == pytest.approx(90.0 * 0.75 / 135.0)
