"""walk_forward_v21 shapes + evaluate_v21 gate logic and filters."""
import pandas as pd

from backtest_v21 import evaluate_v21, walk_forward_v21


def _mk_results(v1_err: float, v21_err: float, cap_flip: bool) -> pd.DataFrame:
    rows = []
    for gw in (8, 9):
        for i in range(10):
            actual = float(i)
            inside = i % 2 == 0            # coverage exactly 0.5
            rows.append({
                "player_id": i, "gw": gw, "position": "MID", "actual": actual,
                "p50_v1": actual + v1_err, "p50_aug": actual,
                "p25": actual - 1.0 if inside else actual + 1.0,
                "p50": actual + v21_err,
                "p75": actual + 1.0 if inside else actual + 2.0,
                "base_form": actual + 2.0, "xmin": 1.0, "hot3": float(i),
            })
    df = pd.DataFrame(rows)
    if cap_flip:
        # candidate crowns a dud (actual 0) while v1 keeps the true top pick;
        # 9.5 only just tops the candidate's real max (9 + v21_err), so the
        # single distorted row cannot flip the MAE comparison.
        df.loc[(df["gw"] == 8) & (df["player_id"] == 0), "p50"] = 9.5
    return df


def _mk_minutes() -> pd.DataFrame:
    # xmin is WRONG on rows 2/3 (extreme confident misses) so the hurdle
    # model's calibrated p60 must score a lower log-loss.
    return pd.DataFrame({
        "player_id": [1, 2, 3, 4], "gw": [8] * 4, "position": ["MID"] * 4,
        "p_play": [0.95, 0.3, 0.9, 0.4], "p60": [0.9, 0.1, 0.8, 0.2],
        "xmin": [1.0, 1.0, 0.0, 0.0], "played": [1.0, 0.0, 1.0, 1.0],
        "sixty": [1.0, 0.0, 1.0, 0.0],
    })


def test_gate_pass_and_fail_paths():
    ok = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), _mk_minutes())
    assert ok["beats_v1_mae"] and ok["captaincy_ok"] and ok["coverage_ok"]
    assert ok["passes_gate"]
    bad = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=True), _mk_minutes())
    assert bad["beats_v1_mae"] and not bad["captaincy_ok"]
    assert not bad["passes_gate"]


def test_eval_filter_uses_heuristic_xmin_and_uncapped_is_everything():
    df = _mk_results(2.0, 0.25, cap_flip=False)
    df.loc[df["gw"] == 8, "xmin"] = 0.0
    m = evaluate_v21(df, _mk_minutes())
    assert m["n_eval"] == 10               # only gw 9 rows survive the filter
    assert m["uncapped"]["n"] == 20        # uncapped sees all rows
    assert m["minutes"]["logloss_p60"] < m["minutes"]["logloss_xmin"]


def test_walk_forward_shapes(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v21(
        synthetic_history, synthetic_strengths, start_gw=25, end_gw=28)
    assert not results.empty and not minutes_rows.empty
    assert {"p50_v1", "p50_aug", "p25_aug", "p75_aug",
            "p25", "p50", "p75", "xmin", "hot3"} <= set(results.columns)
    assert {"p_play", "p60", "played", "sixty", "xmin"} <= set(minutes_rows.columns)
    m = evaluate_v21(results, minutes_rows)
    for k in ("passes_gate", "beats_v1_mae", "captaincy_ok", "coverage_ok"):
        assert isinstance(m[k], bool)
    assert m["minutes"]["n"] == len(minutes_rows)


import pytest

from backtest_v21 import REPORT_MARKER, write_report_v21


def _metrics_stub() -> dict:
    return {
        "n_eval": 100, "v1_mae": 2.0632, "aug_mae": 2.06, "v21_mae": 2.05,
        "base_form_mae": 2.44, "v1_captaincy": 185.0, "v21_captaincy": 186.0,
        "v21_spearman": 0.31, "v1_spearman": 0.30, "coverage": 0.49,
        "beats_v1_mae": True, "captaincy_ok": True, "coverage_ok": True,
        "passes_gate": True,
        "uncapped": {"n": 200, "v1_mae": 2.5, "v21_mae": 2.4},
        "minutes": {"n": 200, "logloss_p60": 0.4, "logloss_xmin": 0.6,
                    "brier_p60": 0.12, "brier_xmin": 0.2,
                    "calibration": [{"bucket": "(0.0, 0.5]", "mean_pred": 0.3,
                                     "observed": 0.28, "n": 100}]},
        "hot_streak": {"n": 20, "v21_signed_error": -1.0,
                       "v1_signed_error": -1.1, "base_form_signed_error": 2.0},
    }


def test_report_truncates_only_own_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    prefix = "# v1 stuff\n\nv1 body\n\n<!-- xpts-v2-results -->\n\nv2 body\n"
    path.write_text(prefix + f"\n{REPORT_MARKER}\n\nOLD v21 section\n")
    write_report_v21(_metrics_stub(), str(path))
    content = path.read_text()
    assert content.startswith(prefix.rstrip() + "\n\n" + REPORT_MARKER)
    assert content.count(REPORT_MARKER) == 1
    assert "OLD v21 section" not in content
    assert "✅ PASS" in content


def test_report_refuses_duplicate_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    path.write_text(f"{REPORT_MARKER}\nx\n{REPORT_MARKER}\ny\n")
    with pytest.raises(ValueError):
        write_report_v21(_metrics_stub(), str(path))


def test_evaluate_v21_raises_clearly_on_empty_minutes_rows():
    empty = pd.DataFrame(columns=["player_id", "gw", "position", "p_play",
                                  "p60", "xmin", "played", "sixty"])
    with pytest.raises(ValueError, match="minutes_rows is empty"):
        evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), empty)


def test_calibration_buckets_are_readable_ranges():
    m = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), _mk_minutes())
    assert m["minutes"]["calibration"]
    for b in m["minutes"]["calibration"]:
        # raw pd.Interval reprs look like "(0.0989, 0.341]" — we want plain
        # "0.099–0.341" ranges in the report table.
        assert "(" not in b["bucket"] and "]" not in b["bucket"]


def test_walk_forward_aggregate_quantile_ordering(synthetic_history, synthetic_strengths):
    # Per-row p25<=p75 is flaky by design under raw QuantReg crossing; the
    # aggregate ordering is the non-flaky guard for a 0.25/0.75 arg swap
    # (triaged minor from #140).
    results, _ = walk_forward_v21(synthetic_history, synthetic_strengths,
                                  start_gw=25, end_gw=28)
    assert results["p25_aug"].mean() < results["p75_aug"].mean()
