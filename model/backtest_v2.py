"""Walk-forward backtest for xPts v2.0 (#125): ablation (v1 / v1+match / v2),
the gate, standalone match-engine metrics, and the hot-streak diagnostic.
Writes/replaces a v2 section in docs/xpts-model.md."""
from __future__ import annotations

import math
import os

import pandas as pd

from baselines import baseline_form
from feature_spec import FEATURE_COLUMNS, MODEL_VERSION
from feature_spec_v2 import FEATURE_COLUMNS_V2, MODEL_VERSION_V2
from features import build_feature_row, build_samples
from features_v2 import build_feature_row_v2, build_samples_v2
from match_engine import MatchEngine, build_team_fixtures
from metrics import captaincy_points, interval_coverage, mae, within_position_spearman
from train import fit_models, predict, train_v2

# Ablation variant (b): v1's columns + the three match features.
FEATURE_COLUMNS_V1M = FEATURE_COLUMNS + [
    "team_lambda_for", "team_lambda_against", "p_clean_sheet",
]

REPORT_MARKER = "<!-- xpts-v2-results -->"


def hot3_points(history: pd.DataFrame, player_id: int, gw: int) -> float:
    """Sum of the player's actual points over gws [gw-3, gw-1]."""
    rows = history[(history["player_id"] == player_id)
                   & (history["gw"] >= gw - 3) & (history["gw"] < gw)]
    return float(rows["total_points"].sum()) if len(rows) else 0.0


def walk_forward_v2(history: pd.DataFrame, team_strengths: dict,
                    start_gw: int = 8, end_gw: int = 38,
                    rating_params: dict | None = None) -> pd.DataFrame:
    """rating_params: optional MatchEngine overrides ({window, alpha,
    prior_weight}) — the grid runner's hook; defaults = the frozen spec."""
    tf = build_team_fixtures(history)
    engine = MatchEngine(tf, **(rating_params or {}))  # before_gw threading -> leakage-safe
    out_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        s_v2 = build_samples_v2(past, engine)
        if len(s_v1) == 0 or len(s_v2) == 0:
            continue
        # variant (b): v2 samples carry the match features; merge in v1's
        # static-strength columns so one frame serves both v1m fits.
        # KNOWN APPROXIMATION: neither samples frame carries fixture_id, so a
        # DGW's two per-fixture rows get variant-b statics from the first v1
        # row. Affects only the diagnostic ablation variant on DGW rows.
        s_v1m = s_v2.merge(
            s_v1[["player_id", "gw", "opp_strength_def", "opp_strength_att",
                  "form_expected_goal_involvements"]].drop_duplicates(["player_id", "gw"]),
            on=["player_id", "gw"], how="inner",
        )
        art_v1 = fit_models(s_v1)
        art_v1m = fit_models(s_v1m, feature_columns=FEATURE_COLUMNS_V1M,
                             model_version="v1m", decay_alpha=None,
                             form_window=None, scaling={}, extra=None)
        art_v2 = fit_models(s_v2, feature_columns=FEATURE_COLUMNS_V2,
                            model_version=MODEL_VERSION_V2, decay_alpha=None,
                            form_window=None, scaling={}, extra=None)

        for _, target in history[history["gw"] == t].iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            pos = target["position"]
            f1 = build_feature_row(prior, target, team_strengths)
            f2 = build_feature_row_v2(prior, target, engine)
            f1m = {**f2, "opp_strength_def": f1["opp_strength_def"],
                   "opp_strength_att": f1["opp_strength_att"],
                   "form_expected_goal_involvements": f1["form_expected_goal_involvements"]}
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p50_v1m": predict(art_v1m, f1m, pos, 0.50),
                "p25": predict(art_v2, f2, pos, 0.25),
                "p50": predict(art_v2, f2, pos, 0.50),
                "p75": predict(art_v2, f2, pos, 0.75),
                "base_form": baseline_form(prior),
                "xmin": f2["xmin"],
                "hot3": hot3_points(history, pid, t),
            })
    df = pd.DataFrame(out_rows)
    if df.empty:
        return df
    agg = {"actual": "sum", "p50_v1": "sum", "p50_v1m": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
    return df.groupby(["player_id", "gw"], as_index=False).agg(agg)


def evaluate_v2(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae, v1m_mae, v2_mae = (mae(df[c], df["actual"]) for c in ("p50_v1", "p50_v1m", "p50"))
    v1_cap = captaincy_points(df, "p50_v1")
    v2_cap = captaincy_points(df, "p50")
    coverage = interval_coverage(df, "p25", "p75")
    beats_mae = v2_mae < v1_mae
    cap_ok = v2_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]
    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v1m_mae": v1m_mae, "v2_mae": v2_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v2_captaincy": v2_cap,
        "v2_spearman": within_position_spearman(df, "p50"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "hot_streak": {
            "n": int(len(hot)),
            "v2_signed_error": float((hot["p50"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def _static_lambda(team: int, opp: int, was_home: bool, static: dict, L: float) -> float:
    """Static-strengths baseline in the same multiplicative form: attack index
    of the team at its venue x inverse defence index of the opponent."""
    t, o = static.get(team), static.get(opp)
    if not t or not o:
        return L
    s_att = t["strength_attack_home" if was_home else "strength_attack_away"]
    s_def = o["strength_defence_away" if was_home else "strength_defence_home"]
    mean_att = sum(
        v["strength_attack_home" if was_home else "strength_attack_away"]
        for v in static.values()
    ) / len(static)
    mean_def = sum(
        v["strength_defence_away" if was_home else "strength_defence_home"]
        for v in static.values()
    ) / len(static)
    return L * (s_att / mean_att) * (mean_def / s_def)


def engine_metrics(team_fixtures: pd.DataFrame, static: dict,
                   start_gw: int = 8) -> dict:
    """Standalone engine quality: predicted lambda vs actual match xG (MAE) and
    p_clean_sheet vs actual CS (Brier), dynamic vs the static baseline."""
    engine = MatchEngine(team_fixtures)
    rows = team_fixtures[team_fixtures["gw"] >= start_gw]
    xg_err, xg_err_s, briers, briers_s = [], [], [], []
    for _, r in rows.iterrows():
        lam_for, lam_against = engine.lambdas(
            int(r["team_id"]), int(r["opponent_team"]), bool(r["was_home"]),
            before_gw=int(r["gw"]),
        )
        # League means per venue: the team's goals live in its venue's units,
        # the opponent's (what the team concedes) in the opposite venue's.
        L_t = engine.league_baseline("home" if r["was_home"] else "away", int(r["gw"]))
        L_o = engine.league_baseline("away" if r["was_home"] else "home", int(r["gw"]))
        lam_s_against = _static_lambda(int(r["opponent_team"]), int(r["team_id"]),
                                       not bool(r["was_home"]), static, L_o)
        cs_actual = 1.0 if r["goals_against"] == 0 else 0.0
        xg_err.append(abs(lam_for - float(r["xg_for"])))
        xg_err_s.append(abs(
            _static_lambda(int(r["team_id"]), int(r["opponent_team"]),
                           bool(r["was_home"]), static, L_t) - float(r["xg_for"])))
        briers.append((math.exp(-lam_against) - cs_actual) ** 2)
        briers_s.append((math.exp(-lam_s_against) - cs_actual) ** 2)
    n = len(xg_err)
    return {
        "n_team_fixtures": n,
        "xg_mae": sum(xg_err) / n if n else 0.0,
        "xg_mae_static": sum(xg_err_s) / n if n else 0.0,
        "cs_brier": sum(briers) / n if n else 0.0,
        "cs_brier_static": sum(briers_s) / n if n else 0.0,
    }


def write_report_v2(metrics: dict, engine_m: dict, path: str) -> None:
    verdict = "✅ PASS — proceed to shadow serving (#128)" if metrics["passes_gate"] \
        else "❌ FAIL — documented finding; do NOT wire shadow serving"
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER}

# xPts model — v2.0 results (match engine)

**Model version:** `{MODEL_VERSION_V2}` · gate vs v1 (`{MODEL_VERSION}`) on the same
walk-forward (2025/26, GW 8→38, eval among xmin ≥ 0.5; n = {metrics['n_eval']}).
Spec: `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md`.

## Ablation (MAE, lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.3f} |
| (b) v1 + match features | {metrics['v1m_mae']:.3f} |
| (c) full v2 (xGI + static strengths dropped) | {metrics['v2_mae']:.3f} |
| exp-decay form baseline | {metrics['base_form_mae']:.3f} |

Captaincy: v2 {metrics['v2_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: v2 {metrics['v2_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).

## Match-engine standalone ({engine_m['n_team_fixtures']} team-fixtures)

| metric | dynamic ratings | static strengths |
|--------|-----------------|------------------|
| per-match xG MAE | {engine_m['xg_mae']:.3f} | {engine_m['xg_mae_static']:.3f} |
| clean-sheet Brier | {engine_m['cs_brier']:.3f} | {engine_m['cs_brier_static']:.3f} |

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): v2 {hs['v2_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.
Positive = over-prediction of hot players; the xG-form design should keep v2's
value near the form baseline's or better (regression to the mean).

## Gate

- v2 beats v1 on MAE: **{metrics['beats_v1_mae']}**
- v2 captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if REPORT_MARKER in content:
        content = content[: content.index(REPORT_MARKER)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    history = load_history()
    strengths = load_team_strengths()
    results = walk_forward_v2(history, strengths)
    metrics = evaluate_v2(results)
    static = {k: v for k, v in strengths.items()}
    engine_m = engine_metrics(build_team_fixtures(history), static)
    out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "docs", "xpts-model.md"))
    write_report_v2(metrics, engine_m, out)
    print(f"[backtest-v2] n={metrics['n_eval']} v1={metrics['v1_mae']:.3f} "
          f"v1m={metrics['v1m_mae']:.3f} v2={metrics['v2_mae']:.3f} "
          f"cap {metrics['v2_captaincy']:.0f} vs {metrics['v1_captaincy']:.0f} "
          f"cov={metrics['coverage']:.3f} PASS={metrics['passes_gate']}")
