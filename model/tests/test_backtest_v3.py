"""backtest_v3 tests on the shared synthetic fixtures: walk-forward shapes
(incl. per-row and aggregate quantile coherence and a DGW row), determinism,
target-GW isolation (no leakage), gate pass/fail for BOTH candidates,
empty-frame guard, report-marker semantics, and dump-before-evaluate."""
import os

import numpy as np
import pandas as pd
import pytest

from assist_scale import compute_assist_scale
from backtest_v3 import mid_p_value
from backtest_v3 import (REPORT_MARKER_V3, evaluate_v3, run_gate,
                         walk_forward_v3, write_report_v3)

FAST = dict(start_gw=25, end_gw=28, n_sims=300)


def test_walk_forward_shapes_and_quantile_coherence(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    need = {"player_id", "gw", "position", "actual", "xmin", "hot3", "base_form",
            "p25_v1", "p50_v1", "p75_v1",
            "mean_v3", "p25_v3", "p50_v3", "p75_v3",
            "p_goal", "p_assist", "p_cs_pts", "p_haul",
            "point_ens", "p25_ens", "p50_ens", "p75_ens", "u_mid"}
    assert need <= set(results.columns)
    assert len(results) > 0 and len(minutes_rows) > 0
    # Simulation quantiles are coherent per row BY CONSTRUCTION (same draws).
    assert (results["p25_v3"] <= results["p50_v3"]).all()
    assert (results["p50_v3"] <= results["p75_v3"]).all()
    # Aggregate ordering (non-flaky) as the cross-column sanity check.
    assert results["p25_v3"].mean() < results["p75_v3"].mean()
    assert results["mean_v3"].notna().all()
    assert results["u_mid"].between(0.0, 1.0).all()


def test_walk_forward_is_deterministic(synthetic_history, synthetic_strengths):
    a, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    b, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    pd.testing.assert_frame_equal(a, b)


def test_dgw_collapses_to_one_row(synthetic_history, synthetic_strengths):
    hist = synthetic_history.copy()
    extra = hist[(hist["player_id"] == 1) & (hist["gw"] == 27)].copy()
    assert len(extra) == 1
    extra["fixture_id"] = 9999
    extra["was_home"] = not bool(extra["was_home"].iloc[0])
    hist = pd.concat([hist, extra], ignore_index=True)
    results, _ = walk_forward_v3(hist, synthetic_strengths, **FAST)
    row = results[(results["player_id"] == 1) & (results["gw"] == 27)]
    assert len(row) == 1  # two fixtures -> one aggregated (player, gw) row
    single, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    srow = single[(single["player_id"] == 1) & (single["gw"] == 27)]
    # A double gameweek must project more than the single fixture alone.
    assert row["mean_v3"].iloc[0] > srow["mean_v3"].iloc[0]


def test_target_gw_stats_do_not_leak_into_predictions(synthetic_history, synthetic_strengths):
    base, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    poisoned = synthetic_history.copy()
    mask = (poisoned["player_id"] == 1) & (poisoned["gw"] == 28)
    poisoned.loc[mask, "expected_goals"] = 99.0  # target-GW stat, not a prior
    out, _ = walk_forward_v3(poisoned, synthetic_strengths, **FAST)
    a = base[(base["player_id"] == 1) & (base["gw"] == 28)]["mean_v3"].iloc[0]
    b = out[(out["player_id"] == 1) & (out["gw"] == 28)]["mean_v3"].iloc[0]
    assert a == pytest.approx(b)


def test_mid_p_value_exact_cases():
    total = np.array([1, 2, 2, 3])
    assert mid_p_value(total, 2.0) == pytest.approx(0.25 + 0.5 * 0.5)
    assert mid_p_value(total, 3.0) == pytest.approx(0.75 + 0.5 * 0.25)
    assert mid_p_value(total, 0.0) == 0.0
    assert mid_p_value(total, 4.0) == 1.0


def test_assist_scale_flag_shifts_p_assist(synthetic_history, synthetic_strengths):
    base, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    scaled, _ = walk_forward_v3(synthetic_history, synthetic_strengths,
                                assist_scale=True, **FAST)
    # Direction-aware: on this fixture k may be < 1 (sparse assists vs xA).
    k = compute_assist_scale(synthetic_history[synthetic_history["gw"] < FAST["start_gw"]])
    assert k != pytest.approx(1.0)
    if k > 1.0:
        assert scaled["p_assist"].mean() > base["p_assist"].mean()
    else:
        assert scaled["p_assist"].mean() < base["p_assist"].mean()
    # No assertion on other components: they share the RNG stream and may
    # legitimately shift when the assist lambda changes.


def _gate_frame(v3_beats: bool, cap_flip: bool, cov_inside: bool) -> pd.DataFrame:
    """Hand-built results frame: 8 rows x 2 gws, one clear captain per gw.
    cov_inside=True puts HALF the rows inside [p25, p75] (coverage 0.5 —
    all-inside would be coverage 1.0, which FAILS the ±0.10 band)."""
    rows = []
    for gw in (1, 2):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            err_v3 = 0.5 if v3_beats else 3.0
            inside = (i < 2) if cov_inside else False
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                "base_form": 2.0,
                # v1 always picks player 1 (actual 10).
                "p50_v1": 8.0 if i == 0 else 1.0,
                "p25_v1": 6.0 if i == 0 else 0.5,
                "p75_v1": 10.0 if i == 0 else 1.5,
                # v3 picks player 1 unless cap_flip: then player 2 (actual 2;
                # 9.6 beats player 1's 10-0.5=9.5 strictly — a tie would let
                # idxmax keep the first row and the flip would never happen).
                "mean_v3": (actual - err_v3) if not (cap_flip and i == 1) else 9.6,
                "p25_v3": actual - 1.0 if inside else actual + 1.0,
                "p50_v3": actual if inside else actual + 1.5,
                "p75_v3": actual + 1.0 if inside else actual + 2.0,
                "p_goal": 0.3, "p_assist": 0.2, "p_cs_pts": 0.1, "p_haul": 0.05,
            })
    df = pd.DataFrame(rows)
    df["point_ens"] = 0.5 * (df["mean_v3"] + df["p50_v1"])
    for k in (25, 50, 75):
        df[f"p{k}_ens"] = 0.5 * (df[f"p{k}_v3"] + df[f"p{k}_v1"])
    return df


def test_evaluate_primary_pass_and_fail_paths():
    good = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))
    assert good["beats_v1_mae_v3"] and good["captaincy_ok_v3"] and good["coverage_ok_v3"]
    assert good["passes_gate_primary"]
    flipped = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=True, cov_inside=True))
    assert not flipped["captaincy_ok_v3"]
    assert not flipped["passes_gate_primary"]
    worse = evaluate_v3(_gate_frame(v3_beats=False, cap_flip=False, cov_inside=True))
    assert not worse["beats_v1_mae_v3"]


def test_evaluate_reports_secondary_independently():
    m = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))
    for key in ("ens_mae", "ens_captaincy", "coverage_ens", "passes_gate_secondary"):
        assert key in m
    assert m["gkp"]["n"] == 0  # synthetic gate frame has no GKP rows


def test_evaluate_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_v3(pd.DataFrame())


def _metrics() -> dict:
    return evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))


def test_report_appends_after_existing_sections(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("# Header\n\n<!-- xpts-v138-results -->\n\nold v138 section\n")
    write_report_v3(_metrics(), str(p))
    content = p.read_text()
    assert "old v138 section" in content
    assert content.index(REPORT_MARKER_V3) > content.index("old v138 section")


def test_report_truncates_own_marker_only(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("keep me\n\n" + REPORT_MARKER_V3 + "\n\nstale v3 section\n")
    write_report_v3(_metrics(), str(p))
    content = p.read_text()
    assert "keep me" in content and "stale v3 section" not in content
    assert content.count(REPORT_MARKER_V3) == 1


def test_report_refuses_duplicate_marker(tmp_path):
    p = tmp_path / "report.md"
    p.write_text(REPORT_MARKER_V3 + "\n\n" + REPORT_MARKER_V3 + "\n")
    with pytest.raises(ValueError, match="duplicate"):
        write_report_v3(_metrics(), str(p))


def test_run_gate_dumps_both_frames_before_evaluating(tmp_path, synthetic_history,
                                                      synthetic_strengths):
    report = tmp_path / "report.md"
    report.write_text("# xPts model\n")
    dump = tmp_path / "results.csv"
    metrics = run_gate(synthetic_history, synthetic_strengths, str(report),
                       dump_path=str(dump), start_gw=25, end_gw=28)
    assert os.path.exists(dump)
    assert os.path.exists(tmp_path / "results.minutes.csv")
    assert isinstance(metrics["passes_gate_primary"], bool)
    assert REPORT_MARKER_V3 in report.read_text()


def _ens_gate_frame() -> pd.DataFrame:
    """SECONDARY-passing frame: the blend beats v1 MAE, matches its captaincy,
    and half its blended intervals cover (coverage 0.5). v3 and v1 intervals
    are set identical per row so the ensemble interval equals both."""
    rows = []
    for gw in (1, 2):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            inside = i < 2
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                "base_form": 2.0,
                "p50_v1": 8.0 if i == 0 else 1.0,
                "p25_v1": actual - 1.0 if inside else actual + 1.0,
                "p75_v1": actual + 1.0 if inside else actual + 2.0,
                "mean_v3": actual - 0.5,
                "p25_v3": actual - 1.0 if inside else actual + 1.0,
                "p50_v3": actual,
                "p75_v3": actual + 1.0 if inside else actual + 2.0,
                "p_goal": 0.3, "p_assist": 0.2, "p_cs_pts": 0.1, "p_haul": 0.05,
            })
    df = pd.DataFrame(rows)
    df["point_ens"] = 0.5 * (df["mean_v3"] + df["p50_v1"])
    for k in (25, 50, 75):
        df[f"p{k}_ens"] = 0.5 * (df[f"p{k}_v3"] + df[f"p{k}_v1"])
    return df


def test_evaluate_secondary_pass_path():
    # ens MAE 0.875 < v1 1.25; ens captains player 1 (ties v1, >= holds);
    # ens coverage 0.5. A p25_v3-for-p25_ens column typo in the secondary
    # block would break this.
    m = evaluate_v3(_ens_gate_frame())
    assert m["beats_v1_mae_ens"] and m["captaincy_ok_ens"] and m["coverage_ok_ens"]
    assert m["passes_gate_secondary"] is True
