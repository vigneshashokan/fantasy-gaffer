"""The v2.1 contract: constants + column composition/order."""
from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import (
    FEATURE_COLUMNS_V21,
    MINUTES_CUTOFF,
    MINUTES_FEATURE_COLUMNS,
    MINUTES_L1_ALPHA,
    MINUTES_WINDOW_LONG,
    MINUTES_WINDOW_SHORT,
    MODEL_VERSION_V21,
)


def test_constants():
    assert MODEL_VERSION_V21 == "v2.1.0"
    assert MINUTES_CUTOFF == 60
    assert (MINUTES_WINDOW_LONG, MINUTES_WINDOW_SHORT) == (6, 3)
    assert MINUTES_L1_ALPHA == 0.1


def test_minutes_feature_columns_order_is_the_contract():
    assert MINUTES_FEATURE_COLUMNS == [
        "start_share_6", "start_share_3", "mins_share_6", "p60_share_6",
        "started_last", "mins_last", "zeros_last_3", "n_prior",
    ]


def test_v21_columns_replace_xmin_with_minutes_outputs():
    assert "xmin" not in FEATURE_COLUMNS_V21
    assert FEATURE_COLUMNS_V21[-2:] == ["p_play", "p60"]
    assert FEATURE_COLUMNS_V21[:-2] == [c for c in FEATURE_COLUMNS if c != "xmin"]
