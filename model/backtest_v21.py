"""Walk-forward backtest for xPts v2.1 (#127): v1 benchmark vs the
pre-registered candidate (xmin -> p_play/p60) vs the augment diagnostic,
the gate, and the minutes model's standalone quality. Also the report
writer (own-marker-scoped) and the __main__ entry point run against the
full local dataset."""
from __future__ import annotations

import os

import pandas as pd

from backtest_v2 import hot3_points
from baselines import baseline_form
from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import FEATURE_COLUMNS_V21, MINUTES_CUTOFF, MODEL_VERSION_V21
from features import build_feature_row, build_samples
from features_v21 import build_feature_row_v21, build_samples_v21
from metrics import (brier, captaincy_points, interval_coverage, log_loss,
                     mae, within_position_spearman)
from minutes_model import precompute_minutes_predictions
from train import fit_models, predict

# Variant (c): v1's columns (incl. xmin) + the minutes outputs. Diagnostic-only
# under #127's registration; #138 pre-registers it as its own gate candidate —
# that gate lives in backtest_aug.py (spec: docs/superpowers/specs/
# 2026-07-06-xpts-v138-augment-design.md §2).
FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]

REPORT_MARKER = "<!-- xpts-v21-results -->"


def walk_forward_v21(history: pd.DataFrame, team_strengths: dict,
                     start_gw: int = 8, end_gw: int = 38
                     ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (results, minutes_rows): results aggregated per (player, gw)
    like backtest_v2; minutes_rows stay per-fixture for the standalone
    minutes diagnostics (p60 vs the actual 60+ outcome)."""
    preds = precompute_minutes_predictions(history)
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in preds.iterrows()}
    out_rows: list[dict] = []
    minutes_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        s_v21 = build_samples_v21(past, team_strengths, preds)
        if len(s_v1) == 0 or len(s_v21) == 0:
            continue
        art_v1 = fit_models(s_v1)
        art_v21 = fit_models(s_v21, feature_columns=FEATURE_COLUMNS_V21,
                             model_version=MODEL_VERSION_V21)
        # (c) augment: the v21 frame already carries xmin as a diagnostic
        # column, so the same frame fits v1-columns + minutes outputs.
        art_aug = fit_models(s_v21, feature_columns=FEATURE_COLUMNS_AUG,
                             model_version="v21-aug")
        for _, target in history[history["gw"] == t].iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            key = (pid, t)
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            pos = target["position"]
            f1 = build_feature_row(prior, target, team_strengths)
            f21 = build_feature_row_v21(prior, target, team_strengths,
                                        {"p_play": p_play, "p60": p60})
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p25_aug": predict(art_aug, f21, pos, 0.25),
                "p50_aug": predict(art_aug, f21, pos, 0.50),
                "p75_aug": predict(art_aug, f21, pos, 0.75),
                "p25": predict(art_v21, f21, pos, 0.25),
                "p50": predict(art_v21, f21, pos, 0.50),
                "p75": predict(art_v21, f21, pos, 0.75),
                "base_form": baseline_form(prior),
                "xmin": f1["xmin"],
                "hot3": hot3_points(history, pid, t),
            })
            minutes_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "p_play": p_play, "p60": p60, "xmin": f1["xmin"],
                "played": 1.0 if target["minutes"] >= 1 else 0.0,
                "sixty": 1.0 if target["minutes"] >= MINUTES_CUTOFF else 0.0,
            })
    df = pd.DataFrame(out_rows)
    mdf = pd.DataFrame(minutes_rows)
    if df.empty:
        return df, mdf
    agg = {"actual": "sum", "p50_v1": "sum", "p25_aug": "sum",
           "p50_aug": "sum", "p75_aug": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
    return df.groupby(["player_id", "gw"], as_index=False).agg(agg), mdf


def evaluate_v21(results: pd.DataFrame, minutes_rows: pd.DataFrame,
                 min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    aug_mae = mae(df["p50_aug"], df["actual"])
    v21_mae = mae(df["p50"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    v21_cap = captaincy_points(df, "p50")
    coverage = interval_coverage(df, "p25", "p75")
    beats_mae = v21_mae < v1_mae
    cap_ok = v21_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    m = minutes_rows
    if len(m) == 0:
        raise ValueError("evaluate_v21: minutes_rows is empty — the "
                         "walk-forward produced no per-fixture minutes rows")
    calibration = []
    dec = pd.qcut(m["p60"], 10, duplicates="drop")
    for interval, g in m.groupby(dec, observed=True):
        calibration.append({"bucket": f"{interval.left:.3f}–{interval.right:.3f}",
                            "mean_pred": float(g["p60"].mean()),
                            "observed": float(g["sixty"].mean()),
                            "n": int(len(g))})

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "aug_mae": aug_mae, "v21_mae": v21_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v21_captaincy": v21_cap,
        "v21_spearman": within_position_spearman(df, "p50"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v21_mae": mae(results["p50"], results["actual"]),
        },
        "minutes": {
            "n": int(len(m)),
            "logloss_p60": log_loss(m["p60"], m["sixty"]),
            "logloss_xmin": log_loss(m["xmin"], m["sixty"]),
            "brier_p60": brier(m["p60"], m["sixty"]),
            "brier_xmin": brier(m["xmin"], m["sixty"]),
            "calibration": calibration,
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v21_signed_error": float((hot["p50"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def _calibration_table(cal: list[dict]) -> str:
    lines = ["| bucket | mean p60 | observed 60+ rate | n |",
             "|--------|----------|-------------------|---|"]
    for b in cal:
        lines.append(f"| {b['bucket']} | {b['mean_pred']:.3f} "
                     f"| {b['observed']:.3f} | {b['n']} |")
    return "\n".join(lines)


def write_report_v21(metrics: dict, path: str) -> None:
    verdict = ("✅ PASS — revive #128/#130 for this candidate (prospective "
               "validation before any promotion)" if metrics["passes_gate"]
               else "❌ FAIL — documented finding; #128 stays parked")
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER}

# xPts model — v2.1 results (minutes model, #127)

**Model version:** `{MODEL_VERSION_V21}` · gate vs v1 on the same walk-forward
(2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5; n = {metrics['n_eval']}).
Spec: `docs/superpowers/specs/2026-07-05-xpts-v21-minutes-model-design.md`.

## Ablation (MAE, lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) candidate — xmin → p_play + p60 | {metrics['v21_mae']:.4f} |
| (c) augment — v1 + p_play + p60 (diagnostic only) | {metrics['aug_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: candidate {metrics['v21_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: candidate {metrics['v21_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).
Uncapped population (n = {metrics['uncapped']['n']}): candidate MAE
{metrics['uncapped']['v21_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Minutes model standalone (per-fixture eval rows, n = {metrics['minutes']['n']})

| metric | hurdle model (p60) | xmin-as-P(60+) baseline |
|--------|--------------------|--------------------------|
| log-loss | {metrics['minutes']['logloss_p60']:.4f} | {metrics['minutes']['logloss_xmin']:.4f} |
| Brier | {metrics['minutes']['brier_p60']:.4f} | {metrics['minutes']['brier_xmin']:.4f} |

### Calibration (p60 deciles)

{_calibration_table(metrics['minutes']['calibration'])}

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): candidate {hs['v21_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

- candidate beats v1 on MAE: **{metrics['beats_v1_mae']}**
- candidate captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER) > 1:
        raise ValueError("duplicate xpts-v21 marker in report — refusing to write")
    if REPORT_MARKER in content:
        content = content[: content.index(REPORT_MARKER)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    history = load_history()
    strengths = load_team_strengths()
    results, minutes_rows = walk_forward_v21(history, strengths)
    metrics = evaluate_v21(results, minutes_rows)
    out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                        "docs", "xpts-model.md"))
    write_report_v21(metrics, out)
    print(f"[backtest-v21] n={metrics['n_eval']} v1={metrics['v1_mae']:.4f} "
          f"aug={metrics['aug_mae']:.4f} v21={metrics['v21_mae']:.4f} "
          f"cap {metrics['v21_captaincy']:.0f} vs {metrics['v1_captaincy']:.0f} "
          f"cov={metrics['coverage']:.3f} "
          f"minutes-ll {metrics['minutes']['logloss_p60']:.4f} vs "
          f"xmin-ll {metrics['minutes']['logloss_xmin']:.4f} "
          f"PASS={metrics['passes_gate']}")
