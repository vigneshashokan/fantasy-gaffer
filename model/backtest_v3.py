"""Walk-forward backtest + pre-registered gate for xPts v3 (#129): the
generative simulator (PRIMARY) and the 50/50 Vincentized v1 blend
(SECONDARY) vs the in-run v1 benchmark. Spec (frozen registration §2):
docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md. #144 adds
the assist_scale flag + u_mid emission (spec:
docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md)."""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

from backtest_v2 import hot3_points
from baselines import baseline_form
from assist_scale import compute_assist_scale
from feature_spec_v21 import MINUTES_CUTOFF
from feature_spec_v3 import MODEL_VERSION_V3, N_SIMS, V3_SEED_BASE
from features import build_feature_row, build_samples
from match_engine import MatchEngine, build_team_fixtures
from metrics import (captaincy_points, interval_coverage, mae,
                     within_position_spearman)
from minutes_model import precompute_minutes_predictions
from rates_v3 import build_player_rates, position_rate_priors
from simulate_v3 import simulate_player_fixture, summarize_draws
from train import fit_models, predict

REPORT_MARKER_V3 = "<!-- xpts-v3-results -->"

_SIM_KEYS = ("total", "goals", "assists", "cs")


def mid_p_value(total: np.ndarray, actual: float) -> float:
    """Mid-P PIT of `actual` under the empirical distribution of `total`
    (#144 spec §2: P(draws < a) + 0.5·P(draws = a); exact for the
    integer-valued draw arrays and integer-valued actuals we feed it)."""
    return float((total < actual).mean() + 0.5 * (total == actual).mean())


def walk_forward_v3(history: pd.DataFrame, team_strengths: dict,
                    start_gw: int = 8, end_gw: int = 38,
                    n_sims: int = N_SIMS,
                    assist_scale: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (results, minutes_rows). results has one row per (player, gw):
    v1 columns aggregated by summing per-fixture quantile predictions (v1's
    existing DGW behavior), v3 columns from elementwise-summed draw arrays
    (quantiles of the sum), ensemble columns from both, and u_mid — the mid-P
    PIT of the row's actual under its own simulated distribution (#144).
    assist_scale=True applies the strictly-prior global assist multiplier
    (#144 spec §3); False preserves #129 behavior."""
    preds = precompute_minutes_predictions(history)
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in preds.iterrows()}
    engine = MatchEngine(build_team_fixtures(history))
    out_rows: list[dict] = []
    minutes_rows: list[dict] = []
    sim_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        if len(s_v1) == 0:
            continue
        art_v1 = fit_models(s_v1)
        priors = position_rate_priors(past)
        k_assist = compute_assist_scale(past) if assist_scale else 1.0
        rng = np.random.default_rng(V3_SEED_BASE + t)
        acc: dict[int, dict] = {}
        targets = history[history["gw"] == t].sort_values(["player_id", "fixture_id"])
        for _, target in targets.iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            key = (pid, t)
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            pos = target["position"]
            team = int(target["team_id"])
            opp = int(target["opponent_team"])
            was_home = bool(target["was_home"])
            lam_for, lam_against = engine.lambdas(team, opp, was_home, before_gw=t)
            venue = "home" if was_home else "away"
            att = engine.rating(team, venue, "att", before_gw=t)
            m_att = lam_for / att if att > 0 else 1.0
            ov = "away" if was_home else "home"
            l_ov = engine.league_baseline(ov, before_gw=t)
            m_sav = lam_against / l_ov if l_ov > 0 else 1.0
            player = build_player_rates(prior, pos, priors)
            if assist_scale:
                player = {**player, "rates": {**player["rates"],
                                              "xa90": player["rates"]["xa90"] * k_assist}}
            sim = simulate_player_fixture(rng, pos, p_play, p60, player,
                                          lam_against, m_att, m_sav, n=n_sims)
            if pid in acc:
                for k in _SIM_KEYS:
                    acc[pid][k] = acc[pid][k] + sim[k]
                acc[pid]["actual_sum"] += float(target["total_points"])
            else:
                acc[pid] = {k: sim[k] for k in _SIM_KEYS}
                acc[pid]["position"] = pos
                acc[pid]["actual_sum"] = float(target["total_points"])
            f1 = build_feature_row(prior, target, team_strengths)
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p25_v1": predict(art_v1, f1, pos, 0.25),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p75_v1": predict(art_v1, f1, pos, 0.75),
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
        for pid, arrs in acc.items():
            row = {"player_id": pid, "gw": t}
            row.update(summarize_draws(arrs, arrs["position"]))
            row["u_mid"] = mid_p_value(arrs["total"], arrs["actual_sum"])
            row["actual_sim"] = arrs["actual_sum"]
            sim_rows.append(row)
    df = pd.DataFrame(out_rows)
    mdf = pd.DataFrame(minutes_rows)
    if df.empty:
        return df, mdf
    agg = {"actual": "sum", "p25_v1": "sum", "p50_v1": "sum", "p75_v1": "sum",
           "base_form": "sum", "position": "first", "xmin": "first",
           "hot3": "first"}
    results = df.groupby(["player_id", "gw"], as_index=False).agg(agg)
    results = results.merge(pd.DataFrame(sim_rows), on=["player_id", "gw"],
                            how="inner", validate="one_to_one")
    if not np.allclose(results["actual"], results["actual_sim"]):
        raise AssertionError(
            "walk_forward_v3: groupby-summed actual != draw-side actual_sum — "
            "the two DGW aggregation paths have drifted")
    results = results.drop(columns=["actual_sim"])
    results["point_ens"] = 0.5 * (results["mean_v3"] + results["p50_v1"])
    for k in (25, 50, 75):
        results[f"p{k}_ens"] = 0.5 * (results[f"p{k}_v3"] + results[f"p{k}_v1"])
    return results, mdf


def evaluate_v3(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    if len(results) == 0:
        raise ValueError("evaluate_v3: results frame is empty — no walk-forward rows")
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    v3_mae = mae(df["mean_v3"], df["actual"])
    ens_mae = mae(df["point_ens"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    v3_cap = captaincy_points(df, "mean_v3")
    ens_cap = captaincy_points(df, "point_ens")
    cov_v3 = interval_coverage(df, "p25_v3", "p75_v3")
    cov_ens = interval_coverage(df, "p25_ens", "p75_ens")

    beats_v3 = v3_mae < v1_mae
    cap_ok_v3 = v3_cap >= v1_cap
    cov_ok_v3 = abs(cov_v3 - 0.5) <= 0.10
    beats_ens = ens_mae < v1_mae
    cap_ok_ens = ens_cap >= v1_cap
    cov_ok_ens = abs(cov_ens - 0.5) <= 0.10

    gkp = df[df["position"] == "GKP"]
    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v3_mae": v3_mae, "ens_mae": ens_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v3_captaincy": v3_cap, "ens_captaincy": ens_cap,
        "v3_spearman": within_position_spearman(df, "mean_v3"),
        "ens_spearman": within_position_spearman(df, "point_ens"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage_v3": cov_v3, "coverage_ens": cov_ens,
        "beats_v1_mae_v3": bool(beats_v3), "captaincy_ok_v3": bool(cap_ok_v3),
        "coverage_ok_v3": bool(cov_ok_v3),
        "beats_v1_mae_ens": bool(beats_ens), "captaincy_ok_ens": bool(cap_ok_ens),
        "coverage_ok_ens": bool(cov_ok_ens),
        "passes_gate_primary": bool(beats_v3 and cap_ok_v3 and cov_ok_v3),
        "passes_gate_secondary": bool(beats_ens and cap_ok_ens and cov_ok_ens),
        "gkp": {
            "n": int(len(gkp)),
            "v1_mae": mae(gkp["p50_v1"], gkp["actual"]) if len(gkp) else 0.0,
            "v3_mae": mae(gkp["mean_v3"], gkp["actual"]) if len(gkp) else 0.0,
        },
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v3_mae": mae(results["mean_v3"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v3_signed_error": float((hot["mean_v3"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def write_report_v3(metrics: dict, path: str) -> None:
    if metrics["passes_gate_primary"]:
        verdict = ("✅ PASS (primary — pure v3) — revive #128/#130 for this "
                   "candidate (prospective validation before any promotion)")
    elif metrics["passes_gate_secondary"]:
        verdict = ("✅ PASS (secondary — v3+v1 ensemble) — revive #128/#130 for "
                   "this candidate (prospective validation before any promotion)")
    else:
        verdict = "❌ FAIL — documented finding; #128 stays parked"
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER_V3}

# xPts model — v3 results (event decomposition, #129)

**Model version:** `{MODEL_VERSION_V3}` · pre-registered gate vs v1 on the same
walk-forward (2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5;
n = {metrics['n_eval']}). PRIMARY = the generative simulator (point estimate =
simulated mean); SECONDARY = 50/50 Vincentized blend with v1. N_SIMS = 8000,
seed-pinned per GW. Spec:
`docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md`.
In-run comparison only (live team strengths drift at the 4th decimal).

## MAE (lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) PRIMARY — v3 simulator | {metrics['v3_mae']:.4f} |
| (c) SECONDARY — 50/50 v3+v1 blend | {metrics['ens_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: v3 {metrics['v3_captaincy']:.0f} · ensemble {metrics['ens_captaincy']:.0f}
· v1 {metrics['v1_captaincy']:.0f}.
Spearman: v3 {metrics['v3_spearman']:.3f} · ensemble {metrics['ens_spearman']:.3f}
· v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: v3 {metrics['coverage_v3']:.3f} · ensemble
{metrics['coverage_ens']:.3f} (target 0.50 ± 0.10).
GKP-only MAE (n = {metrics['gkp']['n']}): v3 {metrics['gkp']['v3_mae']:.4f}
vs v1 {metrics['gkp']['v1_mae']:.4f}.
Uncapped population (n = {metrics['uncapped']['n']}): v3 MAE
{metrics['uncapped']['v3_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): v3 {hs['v3_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

| condition | PRIMARY (v3) | SECONDARY (ensemble) |
|-----------|--------------|----------------------|
| beats v1 on MAE | **{metrics['beats_v1_mae_v3']}** | **{metrics['beats_v1_mae_ens']}** |
| captaincy ≥ v1 | **{metrics['captaincy_ok_v3']}** | **{metrics['captaincy_ok_ens']}** |
| coverage within ±0.10 of 0.50 | **{metrics['coverage_ok_v3']}** | **{metrics['coverage_ok_ens']}** |

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER_V3) > 1:
        raise ValueError("duplicate xpts-v3 marker in report — refusing to write")
    if REPORT_MARKER_V3 in content:
        content = content[: content.index(REPORT_MARKER_V3)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


def run_gate(history: pd.DataFrame, team_strengths: dict, report_path: str,
             dump_path: str | None = None,
             start_gw: int = 8, end_gw: int = 38) -> dict:
    """Walk-forward -> (optional) frame dumps -> evaluate -> report. Dumps
    happen BEFORE evaluation so the diagnostics read the exact frames that
    produced the verdict."""
    results, minutes_rows = walk_forward_v3(history, team_strengths,
                                            start_gw=start_gw, end_gw=end_gw)
    if dump_path is not None:
        results.to_csv(dump_path, index=False)
        root, ext = os.path.splitext(dump_path)
        minutes_rows.to_csv(f"{root}.minutes{ext}", index=False)
    metrics = evaluate_v3(results)
    write_report_v3(metrics, report_path)
    return metrics


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    report = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                           "docs", "xpts-model.md"))
    dump = sys.argv[1] if len(sys.argv) > 1 else None
    m = run_gate(load_history(), load_team_strengths(), report, dump)
    print(f"[backtest-v3] n={m['n_eval']} v1={m['v1_mae']:.4f} "
          f"v3={m['v3_mae']:.4f} ens={m['ens_mae']:.4f} "
          f"cap v3 {m['v3_captaincy']:.0f} / ens {m['ens_captaincy']:.0f} "
          f"vs v1 {m['v1_captaincy']:.0f} "
          f"cov v3={m['coverage_v3']:.3f} ens={m['coverage_ens']:.3f} "
          f"PRIMARY={m['passes_gate_primary']} "
          f"SECONDARY={m['passes_gate_secondary']}")
