import numpy as np
import pandas as pd
import pytest

from feature_spec_v2 import (
    FEATURE_COLUMNS_V2,
    LEAGUE_XG_PRIOR,
    MODEL_VERSION_V2,
    PRIOR_WEIGHT,
    RATING_ALPHA,
    RATING_WINDOW,
)
from train import fit_models, predict, train_v2


def _synthetic_samples(n=400, seed=7):
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(rng.uniform(0, 1, size=(n, len(FEATURE_COLUMNS_V2))),
                      columns=FEATURE_COLUMNS_V2)
    df["position"] = ["MID", "FWD"] * (n // 2)
    df["target"] = 2.0 + 3.0 * df["team_lambda_for"] + rng.normal(0, 0.1, n)
    return df


def test_fit_models_v2_artifact_shape_and_metadata():
    art = fit_models(
        _synthetic_samples(),
        feature_columns=FEATURE_COLUMNS_V2,
        model_version=MODEL_VERSION_V2,
        decay_alpha=0.85, form_window=6,
        scaling={"value_scale": 10.0, "strength_scale": None},
        extra={"rating": {"window": RATING_WINDOW, "alpha": RATING_ALPHA,
                          "prior_weight": PRIOR_WEIGHT,
                          "league_xg_prior": LEAGUE_XG_PRIOR}},
    )
    assert art["model_version"] == "v2.0.0"
    assert art["feature_columns"] == FEATURE_COLUMNS_V2
    assert art["rating"]["window"] == RATING_WINDOW
    assert set(art["coefficients"].keys()) == {"MID", "FWD"}
    assert set(art["coefficients"]["MID"].keys()) == {"0.25", "0.5", "0.75"}
    # every column has a coefficient entry
    assert set(art["coefficients"]["MID"]["0.5"].keys()) == {"const", *FEATURE_COLUMNS_V2}


def test_fit_models_default_call_is_still_v1():
    # v1 regression guard: no kwargs -> v1 metadata exactly as before.
    from feature_spec import FEATURE_COLUMNS, MODEL_VERSION
    df = _synthetic_samples()
    fill_rng = np.random.default_rng(11)  # noise, not constants: constant
    for c in FEATURE_COLUMNS:             # columns make QuantReg singular
        if c not in df.columns:
            df[c] = fill_rng.uniform(0, 1, len(df))
    art = fit_models(df)
    assert art["model_version"] == MODEL_VERSION
    assert art["feature_columns"] == FEATURE_COLUMNS
    assert "rating" not in art


def test_predict_recovers_planted_signal():
    art = fit_models(_synthetic_samples(), feature_columns=FEATURE_COLUMNS_V2,
                     model_version=MODEL_VERSION_V2, decay_alpha=0.85,
                     form_window=6, scaling={}, extra=None)
    row = {c: 0.5 for c in FEATURE_COLUMNS_V2}
    lo = predict(art, {**row, "team_lambda_for": 0.1}, "MID", 0.5)
    hi = predict(art, {**row, "team_lambda_for": 0.9}, "MID", 0.5)
    assert hi - lo == pytest.approx(3.0 * 0.8, abs=0.3)  # planted slope ≈ 3


def test_fit_models_rejects_extra_clobbering_reserved_keys():
    with pytest.raises(ValueError, match="clobber"):
        fit_models(_synthetic_samples(), feature_columns=FEATURE_COLUMNS_V2,
                   model_version=MODEL_VERSION_V2, decay_alpha=0.85,
                   form_window=6, scaling={}, extra={"coefficients": {}})
