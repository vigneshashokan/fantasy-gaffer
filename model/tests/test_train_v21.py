"""train_v21 artifact shape: self-describing minutes block + v21 columns."""
from feature_spec_v21 import (FEATURE_COLUMNS_V21, MINUTES_FEATURE_COLUMNS,
                              MODEL_VERSION_V21)
from train import train_v21


def test_train_v21_artifact_shape(synthetic_history, synthetic_strengths):
    artifact = train_v21(synthetic_history, synthetic_strengths)
    assert artifact["model_version"] == MODEL_VERSION_V21
    assert artifact["feature_columns"] == FEATURE_COLUMNS_V21
    minutes = artifact["minutes"]
    assert minutes["cutoff"] == 60
    assert minutes["l1_alpha"] == 0.1
    assert minutes["feature_columns"] == MINUTES_FEATURE_COLUMNS
    for pos in ("GKP", "DEF", "MID", "FWD"):
        assert pos in artifact["coefficients"]
        for head in ("play", "p60_given_play"):
            entry = minutes["models"][pos][head]
            assert set(entry) == {"const", *MINUTES_FEATURE_COLUMNS}
    for pos_coefs in artifact["coefficients"].values():
        for entry in pos_coefs.values():
            assert set(entry) == {"const", *FEATURE_COLUMNS_V21}
