"""Walk-forward gate for xPts v3.1 (#144): the #129 simulator + the
strictly-prior global assist multiplier, judged under the re-registered
gate — MAE on the simulated MEDIAN, captaincy on the simulated MEAN with a
variance-aware two-part condition (beats the form baseline outright AND not
significantly worse than v1 by paired bootstrap), and mid-P PIT coverage.
Spec (frozen registration §2):
docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md."""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

from backtest_v3 import walk_forward_v3
from feature_spec_v3 import N_SIMS
from metrics import mae, within_position_spearman

MODEL_VERSION_V31 = "v3.1"
N_BOOTSTRAP = 10000
BOOTSTRAP_SEED = 20260707
REPORT_MARKER_V31 = "<!-- xpts-v31-results -->"

# model label -> the results column whose per-GW argmax is that model's captain
_PICK_COLS = {"v31": "mean_v3", "v1": "p50_v1", "base": "base_form"}


def walk_forward_v31(history: pd.DataFrame, team_strengths: dict,
                     start_gw: int = 8, end_gw: int = 38,
                     n_sims: int = N_SIMS) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The v3.1 candidate IS the v3 walk-forward with the assist multiplier
    on; columns keep the _v3 suffix (the v3.1-ness is this configuration)."""
    return walk_forward_v3(history, team_strengths, start_gw=start_gw,
                           end_gw=end_gw, n_sims=n_sims, assist_scale=True)


def build_captain_picks(df: pd.DataFrame) -> pd.DataFrame:
    """One row per (gw, model): the pick's id, its ranking value, and its
    realized points. Ties resolve by idxmax (first index) — identical to
    metrics.captaincy_points."""
    rows = []
    for gw, g in df.groupby("gw"):
        for model, col in _PICK_COLS.items():
            pick = g.loc[g[col].idxmax()]
            rows.append({"gw": int(gw), "model": model,
                         "player_id": int(pick["player_id"]),
                         "pred": float(pick[col]),
                         "actual": float(pick["actual"])})
    return pd.DataFrame(rows)


def bootstrap_captaincy(picks: pd.DataFrame, n_boot: int = N_BOOTSTRAP,
                        seed: int = BOOTSTRAP_SEED) -> dict:
    """Paired bootstrap of the cumulative per-GW captain-point delta
    (v3.1 − v1). Gate condition C2 = q90 >= 0 (spec §2: fail only if v1 is
    better with >= 90% bootstrap confidence)."""
    wide = picks.pivot(index="gw", columns="model", values="actual")
    if len(wide) < 2:
        raise ValueError("bootstrap_captaincy: need >= 2 distinct GWs")
    deltas = (wide["v31"] - wide["v1"]).to_numpy(dtype=float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(deltas), size=(n_boot, len(deltas)))
    sums = deltas[idx].sum(axis=1)
    return {"q10": float(np.quantile(sums, 0.10)),
            "q50": float(np.quantile(sums, 0.50)),
            "q90": float(np.quantile(sums, 0.90)),
            "p_worse": float((sums < 0).mean()),
            "deltas": deltas}


def evaluate_v31(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    if len(results) == 0:
        raise ValueError("evaluate_v31: results frame is empty — no walk-forward rows")
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    v31_mae = mae(df["p50_v3"], df["actual"])          # registered: simulated MEDIAN
    mean_mae_diag = mae(df["mean_v3"], df["actual"])   # diagnostic (v3's functional)
    picks = build_captain_picks(df)
    cap = picks.groupby("model")["actual"].sum()
    boot = bootstrap_captaincy(picks)

    beats = v31_mae < v1_mae
    cap_c1 = float(cap["v31"]) > float(cap["base"])
    cap_c2 = boot["q90"] >= 0.0
    coverage = float(((df["u_mid"] >= 0.25) & (df["u_mid"] <= 0.75)).mean())
    cov_ok = abs(coverage - 0.5) <= 0.10

    gkp = df[df["position"] == "GKP"]
    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v31_mae": v31_mae, "mean_mae_diag": mean_mae_diag,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v31_captaincy": float(cap["v31"]), "v1_captaincy": float(cap["v1"]),
        "base_captaincy": float(cap["base"]),
        "boot": {k: boot[k] for k in ("q10", "q50", "q90", "p_worse")},
        "coverage_mid_p": coverage,
        "v31_spearman": within_position_spearman(df, "mean_v3"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "beats_v1_mae": bool(beats),
        "cap_c1": bool(cap_c1), "cap_c2": bool(cap_c2),
        "captaincy_ok": bool(cap_c1 and cap_c2),
        "coverage_ok": bool(cov_ok),
        "passes_gate": bool(beats and cap_c1 and cap_c2 and cov_ok),
        "gkp": {
            "n": int(len(gkp)),
            "v1_mae": mae(gkp["p50_v1"], gkp["actual"]) if len(gkp) else 0.0,
            "v31_mae": mae(gkp["p50_v3"], gkp["actual"]) if len(gkp) else 0.0,
        },
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v31_mae": mae(results["p50_v3"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v31_signed_error": float((hot["mean_v3"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }
