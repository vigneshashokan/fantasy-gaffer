"""serving.py part-1 tests: season boundary, target-GW selection (production
vs --as-of-gw), latest-player-state, target enumeration, and the serve-mode
minutes composition (fit-once + predict-per-player + zero-sample fallback)."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from serving import (SERVE_GW_WINDOW, build_targets, fit_serve_minutes,
                     latest_player_state, season_label_for, select_target_gws,
                     serve_minutes_predictions)


def _fx(id, event, finished, kickoff="2026-08-15T14:00:00Z", h=1, a=2):
    return {"id": id, "event": event, "kickoff_time": pd.Timestamp(kickoff),
            "team_h": h, "team_a": a, "finished": finished}


def test_season_label_august_boundary():
    assert season_label_for(datetime(2026, 8, 15, tzinfo=timezone.utc)) == "2026/27"
    assert season_label_for(datetime(2026, 7, 31, tzinfo=timezone.utc)) == "2025/26"
    assert season_label_for(datetime(2027, 3, 1, tzinfo=timezone.utc)) == "2026/27"
    assert season_label_for(pd.Timestamp("2026-02-20T15:00:00Z")) == "2025/26"


def test_select_target_gws_production_mode():
    fixtures = pd.DataFrame([
        _fx(1, 1, True), _fx(2, 2, False), _fx(3, 2, False),
        _fx(4, 3, False), _fx(5, 4, False), _fx(6, 5, False),
    ])
    assert select_target_gws(fixtures) == [2, 3, 4]


def test_select_target_gws_offseason_empty():
    fixtures = pd.DataFrame([_fx(1, 1, True), _fx(2, 2, True)])
    assert select_target_gws(fixtures) == []


def test_select_target_gws_ignores_null_event():
    fixtures = pd.DataFrame([_fx(1, None, False), _fx(2, 7, False)])
    assert select_target_gws(fixtures) == [7]


def test_select_target_gws_as_of_ignores_finished():
    fixtures = pd.DataFrame([_fx(i, gw, True) for i, gw in
                             enumerate([28, 29, 30, 31, 32, 33], start=1)])
    assert select_target_gws(fixtures, as_of_gw=30) == [30, 31, 32]


def _hist_row(pid, gw, team, pos="MID", minutes=90, fixture_id=None):
    return {"player_id": pid, "gw": gw, "fixture_id": fixture_id or gw * 100 + pid,
            "position": pos, "team_id": team, "opponent_team": 9,
            "was_home": True, "minutes": minutes,
            "starts": 1 if minutes >= 60 else 0}


def test_latest_player_state_takes_most_recent_row():
    hist = pd.DataFrame([
        _hist_row(1, 1, team=5, pos="MID"),
        _hist_row(1, 8, team=7, pos="FWD"),   # transferred + reclassified
        _hist_row(2, 3, team=5, pos="DEF"),
    ])
    latest = latest_player_state(hist).set_index("player_id")
    assert latest.loc[1, "team_id"] == 7 and latest.loc[1, "position"] == "FWD"
    assert latest.loc[2, "team_id"] == 5


def test_build_targets_enumerates_both_sides_dgw_and_blank():
    fixtures = pd.DataFrame([
        _fx(900, 10, False, h=5, a=7),
        _fx(901, 10, False, h=7, a=8),   # team 7 doubles in GW 10
        _fx(902, 11, False, h=5, a=8),   # team 7 blanks in GW 11
    ])
    latest = pd.DataFrame([
        {"player_id": 1, "team_id": 5, "position": "MID"},
        {"player_id": 2, "team_id": 7, "position": "FWD"},
    ])
    t = build_targets(fixtures, latest, [10, 11])
    p2 = t[t["player_id"] == 2]
    assert list(p2["fixture_id"]) == [900, 901]        # DGW: two targets in GW 10
    assert (p2["gw"] == 10).all()                       # blank: none in GW 11
    p1_900 = t[(t["player_id"] == 1) & (t["fixture_id"] == 900)].iloc[0]
    assert p1_900["was_home"] and p1_900["opponent_team"] == 7
    p2_900 = t[(t["player_id"] == 2) & (t["fixture_id"] == 900)].iloc[0]
    assert not p2_900["was_home"] and p2_900["opponent_team"] == 5
    assert list(t.columns) == ["player_id", "gw", "fixture_id", "position",
                               "team_id", "opponent_team", "was_home"]


def test_build_targets_empty_when_no_players():
    fixtures = pd.DataFrame([_fx(900, 10, False, h=5, a=7)])
    latest = pd.DataFrame([{"player_id": 1, "team_id": 3, "position": "MID"}])
    t = build_targets(fixtures, latest, [10])
    assert len(t) == 0 and "player_id" in t.columns


def test_serve_minutes_matches_precompute_at_step(synthetic_history):
    """The serve-mode composition must reproduce precompute_minutes_predictions'
    step-t behavior when history is pre-filtered to gw < t (spec §2)."""
    from minutes_model import precompute_minutes_predictions
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    ref = precompute_minutes_predictions(synthetic_history)
    ref_t = ref[ref["gw"] == t].set_index("player_id")
    for pid, (p_play, p60) in preds.items():
        if pid in ref_t.index:
            assert p_play == pytest.approx(ref_t.loc[pid, "p_play"], rel=1e-12)
            assert p60 == pytest.approx(ref_t.loc[pid, "p60"], rel=1e-12)
    assert set(ref_t.index) <= set(preds.keys())


def test_serve_minutes_zero_sample_fallback():
    # Single-GW history -> zero training samples -> rate-model fallback.
    hist = pd.DataFrame([_hist_row(1, 1, team=5), _hist_row(2, 1, team=5, minutes=0)])
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    assert set(preds.keys()) == {1, 2}
    for p_play, p60 in preds.values():
        assert 0.0 < p_play < 1.0 and 0.0 < p60 <= p_play


def _future_fixtures_from_history(history: pd.DataFrame, gws: list[int]) -> pd.DataFrame:
    """Reconstruct a fixtures frame for the synthetic season's rows at `gws`
    (one row per fixture_id, sides from the was_home flag)."""
    rows = {}
    for _, r in history[history["gw"].isin(gws)].iterrows():
        fid = int(r["fixture_id"])
        if fid in rows:
            continue
        h = int(r["team_id"]) if r["was_home"] else int(r["opponent_team"])
        a = int(r["opponent_team"]) if r["was_home"] else int(r["team_id"])
        rows[fid] = {"id": fid, "event": int(r["gw"]),
                     "kickoff_time": pd.Timestamp("2026-02-01T15:00:00Z"),
                     "team_h": h, "team_a": a, "finished": False}
    return pd.DataFrame(list(rows.values()))


def _t25_setup(synthetic_history, gws):
    """Shared part-2 scaffolding: prior history, reconstructed fixtures, and
    the fitted run-level components at t = 25."""
    from assist_scale import compute_assist_scale
    from match_engine import MatchEngine, build_team_fixtures
    from rates_v3 import position_rate_priors
    from serving import build_sim_inputs

    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    priors = position_rate_priors(hist)
    k = compute_assist_scale(hist)
    engine = MatchEngine(build_team_fixtures(hist))
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    latest = latest_player_state(hist)
    fixtures = _future_fixtures_from_history(synthetic_history, gws)
    targets = build_targets(fixtures, latest, gws)
    inputs = build_sim_inputs(hist, targets, preds, priors, engine, k,
                              before_gw=t)
    return {"hist": hist, "fixtures": fixtures, "k": k, "priors": priors,
            "preds": preds, "inputs": inputs}


def test_build_sim_inputs_matches_walk_forward_semantics(synthetic_history):
    """Inputs must be computed exactly the way walk_forward_v3 computes them
    (same rate build, same non-mutating scaled copy, same minutes source)."""
    from rates_v3 import build_player_rates

    s = _t25_setup(synthetic_history, [25])
    inputs = s["inputs"]
    assert len(inputs) > 0
    by_key = {(i["player_id"], i["fixture_id"]): i for i in inputs}
    key = sorted(by_key)[0]
    i = by_key[key]
    prior = s["hist"][s["hist"]["player_id"] == key[0]]
    raw = build_player_rates(prior, i["position"], s["priors"])
    assert i["player"]["rates"]["xa90"] == pytest.approx(
        raw["rates"]["xa90"] * s["k"])
    assert i["player"]["rates"]["xg90"] == pytest.approx(raw["rates"]["xg90"])
    # non-mutation: a fresh build still yields the unscaled rate
    assert raw["rates"]["xa90"] == pytest.approx(
        build_player_rates(prior, i["position"], s["priors"])["rates"]["xa90"])
    assert (i["p_play"], i["p60"]) == s["preds"][key[0]]
    assert i["m_att"] > 0 and i["m_sav"] > 0 and i["lam_against"] >= 0


def test_simulate_serve_row_shape_and_determinism(synthetic_history):
    from serving import serve_rows
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    fixtures = _future_fixtures_from_history(synthetic_history, [25, 26, 27])
    a, info_a = serve_rows(hist, fixtures, [25, 26, 27], n_sims=300)
    b, _ = serve_rows(hist, fixtures, [25, 26, 27], n_sims=300)
    pd.testing.assert_frame_equal(a, b)  # per-target seeding is deterministic
    need = {"player_id", "gw", "p25", "p50", "p75", "mean",
            "p_goal", "p_assist", "p_cs", "p_haul", "p60"}
    assert need <= set(a.columns)
    assert len(a) > 0 and info_a["n_rows"] == len(a)
    assert (a["p25"] <= a["p50"]).all() and (a["p50"] <= a["p75"]).all()
    for col, dp in (("p25", 1), ("mean", 2), ("p_goal", 3)):
        assert (a[col] == a[col].round(dp)).all()
    assert a["p60"].between(0, 1).all()


def test_simulate_serve_per_target_seed_isolation(synthetic_history):
    """Removing one player's TARGETS must not change any other player's row
    (the spec §2 rationale for per-target seeding). Operates on the inputs
    list so run-level components (k_assist, priors, minutes) are held fixed —
    dropping history rows would legitimately change those for everyone."""
    from serving import simulate_serve

    s = _t25_setup(synthetic_history, [25])
    inputs = s["inputs"]
    drop_pid = inputs[0]["player_id"]
    kept = [i for i in inputs if i["player_id"] != drop_pid]
    assert len(kept) < len(inputs)
    full = simulate_serve(inputs, n_sims=300)
    reduced = simulate_serve(kept, n_sims=300)
    merged = full[full["player_id"] != drop_pid].merge(
        reduced, on=["player_id", "gw"], suffixes=("_a", "_b"))
    assert len(merged) == len(reduced)
    for c in ("p50", "mean", "p_goal", "p_assist"):
        assert (merged[f"{c}_a"] == merged[f"{c}_b"]).all()


def test_simulate_serve_dgw_sums_draws(synthetic_history):
    from serving import serve_rows
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    single = _future_fixtures_from_history(synthetic_history, [25])
    # duplicate player 1's fixture as a second GW-25 fixture (DGW)
    row = single[single["team_h"].eq(hist[hist["player_id"] == 1]["team_id"].iloc[-1])
                 | single["team_a"].eq(hist[hist["player_id"] == 1]["team_id"].iloc[-1])].iloc[0]
    extra = row.copy(); extra["id"] = 9999
    dgw = pd.concat([single, extra.to_frame().T], ignore_index=True)
    a, _ = serve_rows(hist, single, [25], n_sims=300)
    b, _ = serve_rows(hist, dgw, [25], n_sims=300)
    pa = a[a["player_id"] == 1]["mean"].iloc[0]
    pb = b[b["player_id"] == 1]["mean"].iloc[0]
    assert len(b[b["player_id"] == 1]) == 1   # one row per (player, gw)
    assert pb > pa                            # a double projects more than a single
