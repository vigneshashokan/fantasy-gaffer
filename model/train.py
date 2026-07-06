"""Fit per-position quantile-regression models and emit the coefficient artifact."""
from __future__ import annotations

import json
import os

import pandas as pd
import statsmodels.api as sm

from feature_spec import (
    DECAY_ALPHA,
    FEATURE_COLUMNS,
    FORM_WINDOW,
    MODEL_VERSION,
    POSITIONS,
    QUANTILES,
    STRENGTH_SCALE,
    VALUE_SCALE,
)


def _qkey(q: float) -> str:
    return str(q).rstrip("0").rstrip(".") if "." in str(q) else str(q)


def fit_models(samples: pd.DataFrame, *, feature_columns: list | None = None,
               model_version: str | None = None, decay_alpha: float | None = None,
               form_window: int | None = None, scaling: dict | None = None,
               extra: dict | None = None) -> dict:
    # Defaults = the frozen v1 contract; v2 passes its own spec explicitly.
    feature_columns = feature_columns if feature_columns is not None else FEATURE_COLUMNS
    model_version = model_version if model_version is not None else MODEL_VERSION
    decay_alpha = decay_alpha if decay_alpha is not None else DECAY_ALPHA
    form_window = form_window if form_window is not None else FORM_WINDOW
    scaling = scaling if scaling is not None else {
        "value_scale": VALUE_SCALE, "strength_scale": STRENGTH_SCALE,
    }

    coefficients: dict[str, dict] = {}
    for pos in POSITIONS:
        pos_df = samples[samples["position"] == pos]
        if len(pos_df) <= len(feature_columns) + 1:
            continue  # too few rows to fit; serving falls back to ep_next
        X = sm.add_constant(pos_df[feature_columns], has_constant="add")
        y = pos_df["target"]
        coefficients[pos] = {}
        for q in QUANTILES:
            res = sm.QuantReg(y, X).fit(q=q)
            params = res.params
            entry = {"const": float(params.get("const", 0.0))}
            for c in feature_columns:
                entry[c] = float(params.get(c, 0.0))
            coefficients[pos][_qkey(q)] = entry
    artifact = {
        "model_version": model_version,
        "feature_columns": feature_columns,
        "decay_alpha": decay_alpha,
        "form_window": form_window,
        "scaling": scaling,
        "coefficients": coefficients,
    }
    if extra:
        overlap = extra.keys() & artifact.keys()
        if overlap:
            raise ValueError(f"extra would clobber artifact keys: {sorted(overlap)}")
        artifact.update(extra)
    return artifact


def predict(artifact: dict, feature_row: dict, position: str, quantile: float) -> float:
    coefs = artifact["coefficients"].get(position)
    if coefs is None:
        return 0.0
    entry = coefs[_qkey(quantile)]
    total = entry["const"]
    for c in artifact["feature_columns"]:
        total += entry[c] * float(feature_row[c])
    return float(total)


def save_artifact(artifact: dict, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(artifact, f, indent=2, sort_keys=True)
        f.write("\n")


def train_v2(history: pd.DataFrame) -> dict:
    """Fit the v2.0 artifact: match-engine features + xGI-free form."""
    from feature_spec_v2 import (
        DECAY_ALPHA_V2, FEATURE_COLUMNS_V2, FORM_WINDOW_V2, LEAGUE_XG_PRIOR,
        MODEL_VERSION_V2, PRIOR_WEIGHT, RATING_ALPHA, RATING_WINDOW, VALUE_SCALE_V2,
    )
    from features_v2 import build_samples_v2
    from match_engine import MatchEngine, build_team_fixtures

    engine = MatchEngine(build_team_fixtures(history))
    samples = build_samples_v2(history, engine)
    return fit_models(
        samples,
        feature_columns=FEATURE_COLUMNS_V2,
        model_version=MODEL_VERSION_V2,
        decay_alpha=DECAY_ALPHA_V2,
        form_window=FORM_WINDOW_V2,
        scaling={"value_scale": VALUE_SCALE_V2},
        extra={"rating": {"window": RATING_WINDOW, "alpha": RATING_ALPHA,
                          "prior_weight": PRIOR_WEIGHT,
                          "league_xg_prior": LEAGUE_XG_PRIOR}},
    )


def train_v21(history: pd.DataFrame, team_strengths: dict) -> dict:
    """Fit the v2.1 candidate (#127): v1 features with xmin -> (p_play, p60),
    plus the self-describing minutes block. Committed but NOT wired into
    serving (#128 parked pending the gate + prospective validation)."""
    from feature_spec_v21 import (
        FEATURE_COLUMNS_V21, MINUTES_CUTOFF, MINUTES_FEATURE_COLUMNS,
        MINUTES_L1_ALPHA, MINUTES_WINDOW_LONG, MINUTES_WINDOW_SHORT,
        MODEL_VERSION_V21,
    )
    from features_v21 import build_samples_v21
    from minutes_model import (build_minutes_samples, fit_minutes_models,
                               precompute_minutes_predictions)

    # Quantile coefs train on leakage-safe (strictly-prior) minutes features —
    # classic stacking; the SERVED minutes model refits on all rows.
    preds = precompute_minutes_predictions(history)
    samples = build_samples_v21(history, team_strengths, preds)
    minutes_models = fit_minutes_models(build_minutes_samples(history))
    return fit_models(
        samples,
        feature_columns=FEATURE_COLUMNS_V21,
        model_version=MODEL_VERSION_V21,
        extra={"minutes": {
            "cutoff": MINUTES_CUTOFF,
            "window_long": MINUTES_WINDOW_LONG,
            "window_short": MINUTES_WINDOW_SHORT,
            "l1_alpha": MINUTES_L1_ALPHA,
            "feature_columns": MINUTES_FEATURE_COLUMNS,
            "models": minutes_models,
        }},
    )


if __name__ == "__main__":
    import sys

    from data import load_history, load_team_strengths
    from features import build_samples

    history = load_history()
    if "--v2" in sys.argv:
        artifact = train_v2(history)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v2.json")
        save_artifact(artifact, out)
        print(f"[train] v2: {len(artifact['coefficients'])} position models -> {out}")
    elif "--v21" in sys.argv:
        strengths = load_team_strengths()
        artifact = train_v21(history, strengths)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v21.json")
        save_artifact(artifact, out)
        print(f"[train] v21: {len(artifact['coefficients'])} position models -> {out}")
    else:
        strengths = load_team_strengths()
        samples = build_samples(history, strengths)
        artifact = fit_models(samples)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v1.json")
        save_artifact(artifact, out)
        print(f"[train] {len(samples)} samples, "
              f"{len(artifact['coefficients'])} position models -> {out}")
