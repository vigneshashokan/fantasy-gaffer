import pandas as pd
import pytest

from baselines import baseline_last_gw, baseline_ppg, baseline_form
from feature_spec import DECAY_ALPHA


def _prior(points_by_gw):
    return pd.DataFrame([
        {"gw": gw, "fixture_id": gw * 10, "total_points": p}
        for gw, p in points_by_gw
    ])


def test_baselines_empty_are_zero():
    empty = pd.DataFrame(columns=["gw", "fixture_id", "total_points"])
    assert baseline_last_gw(empty) == 0.0
    assert baseline_ppg(empty) == 0.0
    assert baseline_form(empty) == 0.0


def test_last_gw_and_ppg():
    prior = _prior([(1, 2), (2, 8), (3, 5)])
    assert baseline_last_gw(prior) == 5.0          # most recent gw
    assert baseline_ppg(prior) == pytest.approx(5.0)  # mean of 2,8,5


def test_form_weights_recent_more():
    prior = _prior([(1, 0), (2, 10)])  # recent gw2=10
    assert baseline_form(prior) == pytest.approx((10 * 1 + 0 * DECAY_ALPHA) / (1 + DECAY_ALPHA))
