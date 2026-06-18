import numpy as np
import pandas as pd
import statsmodels.api as sm

from feature_spec import FEATURE_COLUMNS, MODEL_VERSION, POSITIONS
from train import fit_models, predict


def _samples(n=400, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        feat = {c: float(rng.normal()) for c in FEATURE_COLUMNS}
        # target is a known linear combo of two features + noise
        target = 2.0 * feat["form_total_points"] + 1.5 * feat["xmin"] + rng.normal(scale=0.1)
        feat.update({"position": "MID", "target": target, "gw": (i % 30) + 2,
                     "player_id": i, "actual_minutes": 90})
        rows.append(feat)
    return pd.DataFrame(rows)


def test_fit_models_artifact_shape():
    art = fit_models(_samples())
    assert art["model_version"] == MODEL_VERSION
    assert art["feature_columns"] == FEATURE_COLUMNS
    # MID present with all three quantiles; each has const + every feature.
    mid = art["coefficients"]["MID"]
    assert set(mid.keys()) == {"0.25", "0.5", "0.75"}
    for q in mid.values():
        assert "const" in q
        for c in FEATURE_COLUMNS:
            assert c in q


def test_predict_matches_statsmodels_dot_product():
    samples = _samples()
    art = fit_models(samples)
    # Refit q=0.5 directly and compare predictions on a fresh row.
    X = sm.add_constant(samples[FEATURE_COLUMNS])
    res = sm.QuantReg(samples["target"], X).fit(q=0.5)
    row = {c: 0.3 for c in FEATURE_COLUMNS}
    x = sm.add_constant(pd.DataFrame([row])[FEATURE_COLUMNS], has_constant="add")
    expected = float(res.predict(x).iloc[0])
    got = predict(art, row, "MID", 0.5)
    assert abs(got - expected) < 1e-6


def test_fit_models_recovers_known_signal():
    art = fit_models(_samples())
    mid50 = art["coefficients"]["MID"]["0.5"]
    assert mid50["form_total_points"] > 1.5  # true coef 2.0
    assert mid50["xmin"] > 1.0               # true coef 1.5
