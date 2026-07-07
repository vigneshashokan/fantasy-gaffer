"""§5 serve-path skew guard — env-gated (XPTS_PARITY=1). Proves the serve
orchestration reproduces the gate-validated walk_forward_v3's per-target
simulate inputs EXACTLY on 2025/26 GW30 against the local snapshot-restored
DB. Input-parity, not draw-parity: the backtest shares one RNG stream per GW,
so set differences would shift draws spuriously; inputs are deterministic and
set-independent (spec §5)."""
import os

import numpy as np
import pandas as pd
import pytest

RUN = os.environ.get("XPTS_PARITY") == "1"
pytestmark = pytest.mark.skipif(
    not RUN, reason="set XPTS_PARITY=1 to run (needs the local 2025/26 DB; ~5 min)")

AS_OF = 30
SEASON = "2025/26"


@pytest.fixture(scope="module")
def frames():
    from data import load_history, load_team_strengths
    from serve_v3 import load_fixtures
    from data import DEFAULT_DATABASE_URL
    history = load_history(season=SEASON)
    assert len(history) > 20000, "local DB must hold the restored 2025/26 season"
    fixtures = load_fixtures(os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL))
    strengths = load_team_strengths()
    return history, fixtures, strengths


def _capture_backtest_inputs(history, strengths):
    """Run walk_forward_v3 at GW30 with simulate_player_fixture spied, then
    key the captured calls by re-deriving the target order (sorted gw-30 rows
    minus zero-prior players — walk_forward's own iteration semantics)."""
    import backtest_v3
    captured = []
    real = backtest_v3.simulate_player_fixture

    def spy(rng, position, p_play, p60, player, lam_against, m_att, m_sav, n):
        captured.append({"position": position, "p_play": p_play, "p60": p60,
                         "player": player, "lam_against": lam_against,
                         "m_att": m_att, "m_sav": m_sav})
        return real(rng, position, p_play, p60, player, lam_against,
                    m_att, m_sav, n=n)

    backtest_v3.simulate_player_fixture = spy
    try:
        backtest_v3.walk_forward_v3(history, strengths, start_gw=AS_OF,
                                    end_gw=AS_OF, n_sims=8, assist_scale=True)
    finally:
        backtest_v3.simulate_player_fixture = real

    targets = history[history["gw"] == AS_OF].sort_values(
        ["player_id", "fixture_id"])
    prior_counts = history[history["gw"] < AS_OF].groupby("player_id").size()
    keys = [(int(t["player_id"]), int(t["fixture_id"]))
            for _, t in targets.iterrows()
            if prior_counts.get(int(t["player_id"]), 0) > 0]
    assert len(keys) == len(captured), "target-order re-derivation drifted"
    return dict(zip(keys, captured))


def _serve_inputs(history, fixtures):
    from assist_scale import compute_assist_scale
    from match_engine import MatchEngine, build_team_fixtures
    from rates_v3 import position_rate_priors
    from serving import (build_sim_inputs, build_targets, fit_serve_minutes,
                         latest_player_state, select_target_gws,
                         serve_minutes_predictions)
    hist = history[history["gw"] < AS_OF]
    gws = select_target_gws(fixtures, as_of_gw=AS_OF)
    assert gws[0] == AS_OF
    priors = position_rate_priors(hist)
    k = compute_assist_scale(hist)
    engine = MatchEngine(build_team_fixtures(hist))
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    latest = latest_player_state(hist)
    targets = build_targets(fixtures, latest, [AS_OF])  # compare gw==AS_OF only
    inputs = build_sim_inputs(hist, targets, preds, priors, engine, k,
                              before_gw=AS_OF)
    return {(i["player_id"], i["fixture_id"]): i for i in inputs}


def _tuples_equal(a, b) -> list[str]:
    bad = []
    for f in ("p_play", "p60", "lam_against", "m_att", "m_sav"):
        if a[f] != pytest.approx(b[f], rel=1e-9, abs=1e-12):
            bad.append(f)
    for name in a["player"]["rates"]:
        if a["player"]["rates"][name] != pytest.approx(
                b["player"]["rates"][name], rel=1e-9, abs=1e-12):
            bad.append(f"rates.{name}")
    if a["player"]["p_dc"] != pytest.approx(b["player"]["p_dc"], rel=1e-9, abs=1e-12):
        bad.append("p_dc")
    if not np.allclose(np.asarray(a["player"]["bonus"], float),
                       np.asarray(b["player"]["bonus"], float),
                       rtol=1e-9, atol=1e-12):
        bad.append("bonus")
    return bad


@pytest.fixture(scope="module")
def parity_maps(frames):
    """ref + got computed ONCE for the module — the backtest capture runs a
    full minutes precompute + one v1 fit (minutes of wall-clock)."""
    history, fixtures, strengths = frames
    return (_capture_backtest_inputs(history, strengths),
            _serve_inputs(history, fixtures))


def test_serve_inputs_match_walk_forward(parity_maps):
    ref, got = parity_maps

    both = sorted(set(ref) & set(got))
    only_ref, only_got = set(ref) - set(got), set(got) - set(ref)
    # Set differences must be small and explainable (team-assignment /
    # position drift for players whose latest-prior club or position differs
    # from the GW-30 truth — spec §5 expects ~0–5).
    assert len(both) >= 0.95 * max(len(ref), len(got))
    assert len(only_ref) + len(only_got) <= 15, (
        f"unexplained set difference: only_ref={sorted(only_ref)[:5]} "
        f"only_got={sorted(only_got)[:5]}")

    mismatched, pos_drift = [], []
    for key in both:
        if ref[key]["position"] != got[key]["position"]:
            pos_drift.append(key)          # explainable: FPL reclassification
            continue
        bad = _tuples_equal(ref[key], got[key])
        if bad:
            mismatched.append((key, bad))
    assert len(pos_drift) <= 10, f"position drift too large: {pos_drift[:5]}"
    assert not mismatched, f"input mismatches: {mismatched[:5]}"
    print(f"\n[parity] intersection={len(both)} only_ref={len(only_ref)} "
          f"only_got={len(only_got)} pos_drift={len(pos_drift)}")


def test_sampled_shared_seed_draws_identical(parity_maps):
    """Belt-and-braces (spec §5): identical inputs + the frozen simulator =
    identical draws under a shared per-target seed."""
    from simulate_v3 import simulate_player_fixture
    ref, got = parity_maps
    both = sorted(set(ref) & set(got))
    sample = [k for k in both if ref[k]["position"] == got[k]["position"]][:20]
    assert len(sample) == 20
    for pid, fid in sample:
        a, b = ref[(pid, fid)], got[(pid, fid)]
        da = simulate_player_fixture(np.random.default_rng((99, pid, fid)),
                                     a["position"], a["p_play"], a["p60"],
                                     a["player"], a["lam_against"], a["m_att"],
                                     a["m_sav"], n=500)
        db = simulate_player_fixture(np.random.default_rng((99, pid, fid)),
                                     b["position"], b["p_play"], b["p60"],
                                     b["player"], b["lam_against"], b["m_att"],
                                     b["m_sav"], n=500)
        assert np.array_equal(da["total"], db["total"]), (pid, fid)
