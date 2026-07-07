"""Pure serving pipeline for the v3.1 candidate (#128, spec §2–§3). No I/O —
serve_v3.py owns the DB; everything here is pandas-in/pandas-out so the unit
suite and the §5 parity guard drive it directly. Composes the frozen model
modules (rates_v3 / simulate_v3 / minutes_model / match_engine / assist_scale);
never reimplements them."""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from assist_scale import compute_assist_scale
from feature_spec_v3 import N_SIMS, V3_SEED_BASE
from match_engine import MatchEngine, build_team_fixtures
from minutes_model import (_fallback_rates, _rate_models,
                           build_minutes_feature_row, build_minutes_samples,
                           fit_minutes_models, predict_minutes)
from rates_v3 import build_player_rates, position_rate_priors
from simulate_v3 import simulate_player_fixture, summarize_draws

SERVE_GW_WINDOW = 3
_SIM_KEYS = ("total", "goals", "assists", "cs")


def season_label_for(kickoff: datetime) -> str:
    """Python port of the Deno currentSeasonLabel (calendar.ts): before August
    the season started the prior calendar year. E.g. 2026-09 -> '2026/27'."""
    start = kickoff.year if kickoff.month >= 8 else kickoff.year - 1
    return f"{start}/{(start + 1) % 100:02d}"


def select_target_gws(fixtures: pd.DataFrame, as_of_gw: int | None = None,
                      n: int = SERVE_GW_WINDOW) -> list[int]:
    """Next n distinct GWs. Production (as_of_gw None): events with >= 1
    unfinished fixture. --as-of-gw t: events >= t regardless of `finished`
    (historical DBs have everything finished)."""
    f = fixtures[fixtures["event"].notna()]
    if as_of_gw is None:
        f = f[~f["finished"].astype(bool)]
    else:
        f = f[f["event"] >= as_of_gw]
    gws = sorted(int(e) for e in f["event"].unique())
    return gws[:n]


def latest_player_state(history: pd.DataFrame) -> pd.DataFrame:
    """One row per player: team_id + position from his most recent history row
    (mid-season transfers ~ last-played-for club — spec §3 approximation)."""
    latest = (history.sort_values(["gw", "fixture_id"])
              .groupby("player_id", as_index=False).last())
    return latest[["player_id", "team_id", "position"]]


def build_targets(fixtures: pd.DataFrame, latest: pd.DataFrame,
                  target_gws: list[int]) -> pd.DataFrame:
    """(player, fixture) targets: every known player whose team plays in a
    target GW. DGW -> multiple rows per (player, gw); blank -> none."""
    cols = ["player_id", "gw", "fixture_id", "position", "team_id",
            "opponent_team", "was_home"]
    rows: list[dict] = []
    fx = fixtures[fixtures["event"].isin(target_gws)]
    for _, f in fx.iterrows():
        for team, opp, home in ((int(f["team_h"]), int(f["team_a"]), True),
                                (int(f["team_a"]), int(f["team_h"]), False)):
            for _, p in latest[latest["team_id"] == team].iterrows():
                rows.append({"player_id": int(p["player_id"]),
                             "gw": int(f["event"]), "fixture_id": int(f["id"]),
                             "position": p["position"], "team_id": team,
                             "opponent_team": opp, "was_home": home})
    if not rows:
        return pd.DataFrame(columns=cols)
    return (pd.DataFrame(rows, columns=cols)
            .sort_values(["gw", "player_id", "fixture_id"])
            .reset_index(drop=True))


def fit_serve_minutes(history: pd.DataFrame) -> dict:
    """Serve-mode minutes fit: one hurdle fit on ALL (strictly prior) history —
    exactly precompute_minutes_predictions' step-t branch when history is
    pre-filtered to gw < t (a sample's features are built from gw < its target,
    so the two formulations see identical data)."""
    samples = build_minutes_samples(history)
    if len(samples):
        return fit_minutes_models(samples)
    return _rate_models(*_fallback_rates(history))


def serve_minutes_predictions(history: pd.DataFrame,
                              models: dict) -> dict[int, tuple[float, float]]:
    """(p_play, p60) once per player with >= 1 history row; reused for every
    target GW (the features cannot change before new data arrives)."""
    out: dict[int, tuple[float, float]] = {}
    for pid, rows in history.groupby("player_id"):
        feat = build_minutes_feature_row(rows)
        pos = rows.sort_values(["gw", "fixture_id"]).iloc[-1]["position"]
        out[int(pid)] = predict_minutes(models, feat, pos)
    return out


def build_sim_inputs(history: pd.DataFrame, targets: pd.DataFrame,
                     minutes_preds: dict, priors: dict, engine: MatchEngine,
                     k_assist: float, before_gw: int) -> list[dict]:
    """Per-target simulate_player_fixture inputs — deterministic and
    set-independent (the §5 parity surface). Mirrors walk_forward_v3's
    per-target computation line for line; skips players with no minutes
    prediction (zero history rows)."""
    inputs: list[dict] = []
    for _, t in targets.iterrows():
        pid = int(t["player_id"])
        if pid not in minutes_preds:
            continue
        prior = history[history["player_id"] == pid]
        p_play, p60 = minutes_preds[pid]
        pos = t["position"]
        team, opp = int(t["team_id"]), int(t["opponent_team"])
        was_home = bool(t["was_home"])
        lam_for, lam_against = engine.lambdas(team, opp, was_home,
                                              before_gw=before_gw)
        venue = "home" if was_home else "away"
        att = engine.rating(team, venue, "att", before_gw=before_gw)
        m_att = lam_for / att if att > 0 else 1.0
        ov = "away" if was_home else "home"
        l_ov = engine.league_baseline(ov, before_gw=before_gw)
        m_sav = lam_against / l_ov if l_ov > 0 else 1.0
        player = build_player_rates(prior, pos, priors)
        player = {**player, "rates": {**player["rates"],
                                      "xa90": player["rates"]["xa90"] * k_assist}}
        inputs.append({"player_id": pid, "gw": int(t["gw"]),
                       "fixture_id": int(t["fixture_id"]), "position": pos,
                       "p_play": p_play, "p60": p60, "player": player,
                       "lam_against": lam_against, "m_att": m_att,
                       "m_sav": m_sav})
    return inputs


def simulate_serve(inputs: list[dict], n_sims: int = N_SIMS) -> pd.DataFrame:
    """Simulate every target with a per-target seeded rng (spec §2 — one
    player entering/leaving the set cannot shift another's draws), sum DGW
    draw arrays elementwise per (player, gw), summarize + round to the
    projections_shadow column scales."""
    acc: dict[tuple[int, int], dict] = {}
    for t in inputs:
        rng = np.random.default_rng((V3_SEED_BASE, t["gw"], t["player_id"],
                                     t["fixture_id"]))
        sim = simulate_player_fixture(rng, t["position"], t["p_play"], t["p60"],
                                      t["player"], t["lam_against"], t["m_att"],
                                      t["m_sav"], n=n_sims)
        key = (t["player_id"], t["gw"])
        if key in acc:
            for k in _SIM_KEYS:
                acc[key][k] = acc[key][k] + sim[k]
        else:
            acc[key] = {k: sim[k] for k in _SIM_KEYS}
            acc[key]["position"] = t["position"]
            acc[key]["p60"] = t["p60"]
    rows = []
    for (pid, gw), arrs in acc.items():
        s = summarize_draws(arrs, arrs["position"])
        rows.append({"player_id": pid, "gw": gw,
                     "p25": round(s["p25_v3"], 1), "p50": round(s["p50_v3"], 1),
                     "p75": round(s["p75_v3"], 1), "mean": round(s["mean_v3"], 2),
                     "p_goal": round(s["p_goal"], 3),
                     "p_assist": round(s["p_assist"], 3),
                     "p_cs": round(s["p_cs_pts"], 3),
                     "p_haul": round(s["p_haul"], 3),
                     "p60": round(arrs["p60"], 3)})
    if not rows:
        return pd.DataFrame(columns=["player_id", "gw", "p25", "p50", "p75",
                                     "mean", "p_goal", "p_assist", "p_cs",
                                     "p_haul", "p60"])
    return (pd.DataFrame(rows).sort_values(["gw", "player_id"])
            .reset_index(drop=True))


def serve_rows(history: pd.DataFrame, fixtures: pd.DataFrame,
               target_gws: list[int],
               n_sims: int = N_SIMS) -> tuple[pd.DataFrame, dict]:
    """The full pure pipeline for pre-selected target GWs. Callers guarantee
    history is non-empty and strictly prior to every target GW."""
    before_gw = min(target_gws)
    priors = position_rate_priors(history)
    k_assist = compute_assist_scale(history)
    engine = MatchEngine(build_team_fixtures(history))
    models = fit_serve_minutes(history)
    minutes_preds = serve_minutes_predictions(history, models)
    latest = latest_player_state(history)
    targets = build_targets(fixtures, latest, target_gws)
    inputs = build_sim_inputs(history, targets, minutes_preds, priors, engine,
                              k_assist, before_gw)
    rows = simulate_serve(inputs, n_sims=n_sims)
    info = {"target_gws": target_gws, "k_assist": float(k_assist),
            "n_targets": len(inputs), "n_rows": len(rows)}
    return rows, info
