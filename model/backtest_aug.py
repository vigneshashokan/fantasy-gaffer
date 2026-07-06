"""#138 gate module: the pre-registered augment candidate (v1's columns incl.
xmin + the #127 minutes outputs p_play/p60) vs the in-run v1 benchmark, on
walk_forward_v21's output. Spec:
docs/superpowers/specs/2026-07-06-xpts-v138-augment-design.md.

The candidate's fits/predictions come from walk_forward_v21 (variant (c),
FEATURE_COLUMNS_AUG) — this module only evaluates and reports. Minutes-model
standalone metrics are NOT recomputed here (unchanged from #127)."""
from __future__ import annotations

import os
import sys

import pandas as pd

from backtest_v21 import walk_forward_v21
from metrics import (captaincy_points, interval_coverage, mae,
                     within_position_spearman)

REPORT_MARKER_AUG = "<!-- xpts-v138-results -->"
MODEL_VERSION_AUG = "v21-aug"


def evaluate_aug(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    aug_mae = mae(df["p50_aug"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    aug_cap = captaincy_points(df, "p50_aug")
    coverage = interval_coverage(df, "p25_aug", "p75_aug")
    beats_mae = aug_mae < v1_mae
    cap_ok = aug_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "aug_mae": aug_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "aug_captaincy": aug_cap,
        "aug_spearman": within_position_spearman(df, "p50_aug"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "aug_mae": mae(results["p50_aug"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "aug_signed_error": float((hot["p50_aug"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def write_report_aug(metrics: dict, path: str) -> None:
    verdict = ("✅ PASS — revive #128/#130 for this candidate (prospective "
               "validation before any promotion)" if metrics["passes_gate"]
               else "❌ FAIL — documented finding; #128 stays parked")
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER_AUG}

# xPts model — #138 results (augment candidate: v1 + p_play/p60, xmin kept)

**Model version:** `{MODEL_VERSION_AUG}` · pre-registered gate vs v1 on the same
walk-forward (2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5;
n = {metrics['n_eval']}). Candidate = FEATURE_COLUMNS_AUG — v1's full feature
set including xmin, plus the #127 minutes-model outputs p_play/p60.
Spec: `docs/superpowers/specs/2026-07-06-xpts-v138-augment-design.md`.
In-run comparison only: published priors (augment 2.0440 as #127's diagnostic)
drift at the 4th decimal with live team strengths.

## MAE (lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) augment candidate — v1 + p_play + p60 | {metrics['aug_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: candidate {metrics['aug_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: candidate {metrics['aug_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25_aug, p75_aug]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).
Uncapped population (n = {metrics['uncapped']['n']}): candidate MAE
{metrics['uncapped']['aug_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): candidate {hs['aug_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

- candidate beats v1 on MAE: **{metrics['beats_v1_mae']}**
- candidate captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER_AUG) > 1:
        raise ValueError("duplicate xpts-v138 marker in report — refusing to write")
    if REPORT_MARKER_AUG in content:
        content = content[: content.index(REPORT_MARKER_AUG)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


def run_gate(history: pd.DataFrame, team_strengths: dict, report_path: str,
             dump_path: str | None = None,
             start_gw: int = 8, end_gw: int = 38) -> dict:
    """The gate run: walk-forward -> (optional) frame dumps -> evaluate ->
    report. Dumps happen BEFORE evaluation so the captain-flip diagnostic
    reads the exact frames that produced the verdict (live-strengths drift
    makes any re-run non-identical). minutes_rows ride along as
    <dump>.minutes.csv for the p60-pathology check."""
    results, minutes_rows = walk_forward_v21(history, team_strengths,
                                             start_gw=start_gw, end_gw=end_gw)
    if dump_path is not None:
        results.to_csv(dump_path, index=False)
        root, ext = os.path.splitext(dump_path)
        minutes_rows.to_csv(f"{root}.minutes{ext}", index=False)
    metrics = evaluate_aug(results)
    write_report_aug(metrics, report_path)
    return metrics


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    report = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                           "docs", "xpts-model.md"))
    dump = sys.argv[1] if len(sys.argv) > 1 else None
    m = run_gate(load_history(), load_team_strengths(), report, dump)
    print(f"[backtest-aug] n={m['n_eval']} v1={m['v1_mae']:.4f} "
          f"aug={m['aug_mae']:.4f} "
          f"cap {m['aug_captaincy']:.0f} vs {m['v1_captaincy']:.0f} "
          f"cov={m['coverage']:.3f} PASS={m['passes_gate']}")
