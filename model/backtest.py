"""Walk-forward backtest of the v1 model vs baselines + decision doc."""
from __future__ import annotations

import os

import pandas as pd

from baselines import baseline_form, baseline_last_gw, baseline_ppg
from feature_spec import MODEL_VERSION
from features import build_feature_row, build_samples
from metrics import captaincy_points, interval_coverage, mae, within_position_spearman
from train import fit_models, predict


def walk_forward(history: pd.DataFrame, team_strengths: dict,
                 start_gw: int = 8, end_gw: int = 38) -> pd.DataFrame:
    out_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        train_samples = build_samples(history[history["gw"] < t], team_strengths)
        if len(train_samples) == 0:
            continue
        artifact = fit_models(train_samples)
        # Predict every (player, fixture) played in GW t.
        gw_rows = history[history["gw"] == t]
        for _, target in gw_rows.iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            feat = build_feature_row(prior, target, team_strengths)
            pos = target["position"]
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p25": predict(artifact, feat, pos, 0.25),
                "p50": predict(artifact, feat, pos, 0.50),
                "p75": predict(artifact, feat, pos, 0.75),
                "base_last": baseline_last_gw(prior),
                "base_ppg": baseline_ppg(prior),
                "base_form": baseline_form(prior),
                "xmin": feat["xmin"],
            })
    df = pd.DataFrame(out_rows)
    if df.empty:
        return df
    # Aggregate to (player, gw): sum the additive cols for DGWs; keep first for the rest.
    agg = {"actual": "sum", "p25": "sum", "p50": "sum", "p75": "sum",
           "base_last": "sum", "base_ppg": "sum", "base_form": "sum",
           "position": "first", "xmin": "first"}
    return df.groupby(["player_id", "gw"], as_index=False).agg(agg)


def evaluate(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    model_mae = mae(df["p50"], df["actual"])
    base_form_mae = mae(df["base_form"], df["actual"])
    model_cap = captaincy_points(df, "p50")
    base_form_cap = captaincy_points(df, "base_form")
    coverage = interval_coverage(df, "p25", "p75")
    beats_mae = model_mae < base_form_mae
    beats_cap = model_cap > base_form_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10
    return {
        "n_eval": int(len(df)),
        "model_mae": model_mae,
        "base_last_mae": mae(df["base_last"], df["actual"]),
        "base_ppg_mae": mae(df["base_ppg"], df["actual"]),
        "base_form_mae": base_form_mae,
        "model_spearman": within_position_spearman(df, "p50"),
        "base_form_spearman": within_position_spearman(df, "base_form"),
        "model_captaincy": model_cap,
        "base_form_captaincy": base_form_cap,
        "coverage": coverage,
        "beats_form_mae": beats_mae,
        "beats_form_captaincy": beats_cap,
        "coverage_ok": coverage_ok,
        "passes_gate": bool(beats_mae and beats_cap and coverage_ok),
    }


def write_report(metrics: dict, results: pd.DataFrame, path: str) -> None:
    verdict = "✅ PASS — ship v1 serving (Plan 3)" if metrics["passes_gate"] \
        else "❌ FAIL — documented finding; do not wire serving as-is"
    md = f"""# xPts model — v1 results

**Model version:** `{MODEL_VERSION}`
**Decision:** Build (not buy) — our own model is the intended USP. See
`docs/superpowers/specs/2026-06-16-xpts-model-v1-design.md`.

## Data
- Source: backfilled `player_gw_history`, season 2025/26 (FPL-embedded Opta xG).
- Features: exp-decay form (window 6, α 0.85) of xG/xA/xGI/threat/creativity/
  influence/bps/defensive_contribution/total_points; recent starts share (xMinutes
  proxy); opponent strength (home/away-aware); was_home; price. Penalty/set-piece
  order, ownership, and explicit FDR are deferred to v2 (anachronistic or redundant
  for a last-season backtest).

## Model
Per-position linear quantile regression (GKP/DEF/MID/FWD × q 0.25/0.50/0.75),
target = a player-fixture's actual total_points. Coefficients are a dot product
(`model/artifacts/xpts-v1.json`) so Deno serving reproduces them with near-zero skew.

## Validation
Walk-forward over 2025/26 (GW 8→38): for each GW *t*, train on `gw < t`, predict *t*,
accumulate out-of-sample. Evaluated among players with recent starts share ≥ 0.5
(n = {metrics['n_eval']}).

| metric | model p50 | baseline (c) exp-decay form | last-GW | season PPG |
|--------|-----------|------------------------------|---------|------------|
| MAE (lower better) | {metrics['model_mae']:.3f} | {metrics['base_form_mae']:.3f} | {metrics['base_last_mae']:.3f} | {metrics['base_ppg_mae']:.3f} |
| within-position Spearman | {metrics['model_spearman']:.3f} | {metrics['base_form_spearman']:.3f} | — | — |
| cumulative captaincy points | {metrics['model_captaincy']:.0f} | {metrics['base_form_captaincy']:.0f} | — | — |

Interval coverage of `[p25, p75]`: {metrics['coverage']:.3f} (target ≈ 0.50 ± 0.10).

## Gate
- Beats baseline (c) on MAE: **{metrics['beats_form_mae']}**
- Beats baseline (c) on cumulative captaincy: **{metrics['beats_form_captaincy']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**

## A→C migration trigger (v2)
The `projections` table is the frozen contract; the app reads only it. Move serving
to a Python batch job (Approach C) when the model outgrows a portable dot product
(e.g. GBM/ensemble) such that re-implementing inference in Deno risks train/serve
skew — *not* merely when adding xG data. Until then, serving stays in-stack (Deno
`pg_cron`).
"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(md)


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    history = load_history()
    strengths = load_team_strengths()
    results = walk_forward(history, strengths)
    metrics = evaluate(results)
    out = os.path.join(os.path.dirname(__file__), "..", "docs", "xpts-model.md")
    write_report(metrics, results, os.path.normpath(out))
    print(f"[backtest] n_eval={metrics['n_eval']} "
          f"model_mae={metrics['model_mae']:.3f} base_form_mae={metrics['base_form_mae']:.3f} "
          f"captaincy {metrics['model_captaincy']:.0f} vs {metrics['base_form_captaincy']:.0f} "
          f"coverage={metrics['coverage']:.3f} PASS={metrics['passes_gate']}")
