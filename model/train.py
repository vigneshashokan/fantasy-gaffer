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


def fit_models(samples: pd.DataFrame) -> dict:
    coefficients: dict[str, dict] = {}
    for pos in POSITIONS:
        pos_df = samples[samples["position"] == pos]
        if len(pos_df) <= len(FEATURE_COLUMNS) + 1:
            continue  # too few rows to fit; serving falls back to ep_next
        X = sm.add_constant(pos_df[FEATURE_COLUMNS], has_constant="add")
        y = pos_df["target"]
        coefficients[pos] = {}
        for q in QUANTILES:
            res = sm.QuantReg(y, X).fit(q=q)
            params = res.params
            entry = {"const": float(params.get("const", 0.0))}
            for c in FEATURE_COLUMNS:
                entry[c] = float(params.get(c, 0.0))
            coefficients[pos][_qkey(q)] = entry
    return {
        "model_version": MODEL_VERSION,
        "feature_columns": FEATURE_COLUMNS,
        "decay_alpha": DECAY_ALPHA,
        "form_window": FORM_WINDOW,
        "scaling": {"value_scale": VALUE_SCALE, "strength_scale": STRENGTH_SCALE},
        "coefficients": coefficients,
    }


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


if __name__ == "__main__":
    from data import load_history, load_team_strengths
    from features import build_samples

    history = load_history()
    strengths = load_team_strengths()
    samples = build_samples(history, strengths)
    artifact = fit_models(samples)
    out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v1.json")
    save_artifact(artifact, out)
    print(f"[train] {len(samples)} samples, "
          f"{len(artifact['coefficients'])} position models -> {out}")
