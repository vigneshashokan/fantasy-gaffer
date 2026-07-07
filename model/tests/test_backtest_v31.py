"""backtest_v31 tests (#144): captain-picks argmax + tie semantics vs
captaincy_points, bootstrap gate condition, evaluate_v31 pass/fail per gate
condition (including an explicit full-pass frame), and the walk-forward
wrapper smoke. Report/run_gate tests are appended by Task 4."""
import numpy as np
import pandas as pd
import pytest

from backtest_v31 import (bootstrap_captaincy, build_captain_picks,
                          evaluate_v31, walk_forward_v31)
from metrics import captaincy_points

FAST = dict(start_gw=25, end_gw=28, n_sims=300)


def _picks_input_frame() -> pd.DataFrame:
    # 3 GWs x 3 players; a different clear winner per ranking column.
    rows = []
    for gw in (1, 2, 3):
        for pid, mean_v3, p50_v1, base_form, actual in [
                (1, 9.0, 2.0, 1.0, 8.0),
                (2, 3.0, 8.0, 2.0, 4.0),
                (3, 1.0, 1.0, 9.0, 2.0)]:
            rows.append({"player_id": pid, "gw": gw, "mean_v3": mean_v3,
                         "p50_v1": p50_v1, "base_form": base_form,
                         "actual": actual, "xmin": 1.0})
    return pd.DataFrame(rows)


def test_build_captain_picks_argmax_per_model():
    picks = build_captain_picks(_picks_input_frame())
    assert len(picks) == 9  # 3 gws x 3 models
    v31 = picks[picks["model"] == "v31"]
    assert set(v31["player_id"]) == {1} and float(v31["actual"].sum()) == 24.0
    v1 = picks[picks["model"] == "v1"]
    assert set(v1["player_id"]) == {2} and float(v1["actual"].sum()) == 12.0
    base = picks[picks["model"] == "base"]
    assert set(base["player_id"]) == {3} and float(base["actual"].sum()) == 6.0


def test_captain_pick_tie_matches_captaincy_points():
    # idxmax keeps the first index on ties — must match metrics.captaincy_points.
    df = pd.DataFrame([
        {"player_id": 1, "gw": 1, "mean_v3": 5.0, "p50_v1": 5.0,
         "base_form": 5.0, "actual": 3.0, "xmin": 1.0},
        {"player_id": 2, "gw": 1, "mean_v3": 5.0, "p50_v1": 5.0,
         "base_form": 5.0, "actual": 7.0, "xmin": 1.0},
    ])
    picks = build_captain_picks(df)
    v31_sum = float(picks[picks["model"] == "v31"]["actual"].sum())
    assert v31_sum == captaincy_points(df, "mean_v3")
    assert v31_sum == 3.0


def _picks_from_actuals(v31_actuals, v1_actuals) -> pd.DataFrame:
    rows = []
    for i, (a31, a1) in enumerate(zip(v31_actuals, v1_actuals), start=1):
        rows.append({"gw": i, "model": "v31", "player_id": 1, "pred": 0.0, "actual": a31})
        rows.append({"gw": i, "model": "v1", "player_id": 2, "pred": 0.0, "actual": a1})
        rows.append({"gw": i, "model": "base", "player_id": 3, "pred": 0.0, "actual": 0.0})
    return pd.DataFrame(rows)


def test_bootstrap_all_positive_deltas_pass():
    out = bootstrap_captaincy(_picks_from_actuals([5.0] * 10, [3.0] * 10), n_boot=500)
    assert out["q90"] == pytest.approx(20.0)  # every resample sums to 10 x 2
    assert out["p_worse"] == 0.0


def test_bootstrap_uniform_negative_deltas_fail():
    out = bootstrap_captaincy(_picks_from_actuals([1.0] * 10, [4.0] * 10), n_boot=500)
    assert out["q90"] == pytest.approx(-30.0)
    assert out["q90"] < 0.0
    assert out["p_worse"] == 1.0


def test_bootstrap_is_seed_deterministic():
    picks = _picks_from_actuals([2.0, 9.0, 1.0, 7.0, 3.0], [4.0, 2.0, 6.0, 1.0, 5.0])
    a = bootstrap_captaincy(picks)
    b = bootstrap_captaincy(picks)
    assert a["q90"] == b["q90"] and a["p_worse"] == b["p_worse"]


def test_bootstrap_raises_on_single_gw():
    with pytest.raises(ValueError, match="2 distinct GWs"):
        bootstrap_captaincy(_picks_from_actuals([5.0], [3.0]))


def _v31_frame(median_beats=True, cap_beats_base=True, cap_vs_v1="tie",
               cov_inside=True) -> pd.DataFrame:
    """Hand-built results frame: 4 gws x 4 MID players, one clear captain per
    ranking. cap_vs_v1: "tie" -> v3.1 and v1 both captain player 1 (deltas 0,
    q90 = 0 passes C2 — an exact tie is deliberately a pass); "lose_big" ->
    v3.1 captains a 2-point player every gw (q90 < 0 fails). cov_inside puts
    HALF the u_mid values inside [0.25, 0.75] (coverage 0.5)."""
    rows = []
    for gw in (1, 2, 3, 4):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            err_v31 = 0.5 if median_beats else 3.0
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                # v1 always captains player 1 (actual 10); v1 MAE = 1.25.
                "p50_v1": 8.0 if i == 0 else 1.0,
                # base captains player 4 (actual 2) unless cap_beats_base=False:
                # then player 1, tying v3.1's 40 (C1 needs a STRICT beat).
                "base_form": ((3.0 if i == 3 else 1.0) if cap_beats_base
                              else (9.0 if i == 0 else 1.0)),
                "mean_v3": ((9.5 if i == 0 else 1.0) if cap_vs_v1 == "tie"
                            else (9.5 if i == 1 else 1.0)),
                "p50_v3": actual - err_v31,
                "u_mid": (0.5 if i < 2 else 0.9) if cov_inside else 0.9,
            })
    return pd.DataFrame(rows)


def test_evaluate_v31_full_pass_frame():
    m = evaluate_v31(_v31_frame())
    # median MAE 0.5 < v1 1.25; cap 40 > base 8; deltas all 0 -> q90 = 0 >= 0;
    # coverage 0.5. Every condition — and the gate — must be True.
    assert m["beats_v1_mae"]
    assert m["cap_c1"] and m["cap_c2"] and m["captaincy_ok"]
    assert m["coverage_ok"]
    assert m["passes_gate"] is True
    assert m["v31_captaincy"] == 40.0 and m["base_captaincy"] == 8.0


def test_evaluate_v31_fails_on_median_mae():
    m = evaluate_v31(_v31_frame(median_beats=False))
    assert not m["beats_v1_mae"]
    assert not m["passes_gate"]


def test_evaluate_v31_fails_c1_on_baseline_tie():
    m = evaluate_v31(_v31_frame(cap_beats_base=False))
    assert not m["cap_c1"]
    assert not m["captaincy_ok"] and not m["passes_gate"]


def test_evaluate_v31_fails_c2_on_significant_deficit():
    m = evaluate_v31(_v31_frame(cap_vs_v1="lose_big"))
    assert m["boot"]["q90"] < 0.0
    assert not m["cap_c2"]
    assert not m["captaincy_ok"] and not m["passes_gate"]


def test_evaluate_v31_fails_on_coverage():
    m = evaluate_v31(_v31_frame(cov_inside=False))
    assert m["coverage_mid_p"] == 0.0
    assert not m["coverage_ok"] and not m["passes_gate"]


def test_evaluate_v31_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_v31(pd.DataFrame())


def test_walk_forward_v31_smoke(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v31(synthetic_history,
                                             synthetic_strengths, **FAST)
    assert {"u_mid", "mean_v3", "p50_v3", "p50_v1", "base_form",
            "xmin"} <= set(results.columns)
    assert len(results) > 0 and len(minutes_rows) > 0
    assert results["u_mid"].between(0.0, 1.0).all()
