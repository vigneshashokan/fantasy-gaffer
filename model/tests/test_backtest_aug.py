"""#138 gate: evaluate_aug fields, _aug-column coverage, report writer scoping,
run_gate results+minutes dump."""
import pandas as pd
import pytest

from backtest_aug import (REPORT_MARKER_AUG, evaluate_aug, run_gate,
                          write_report_aug)


def _mk_results(aug_err: float, cap_flip: bool) -> pd.DataFrame:
    rows = []
    for gw in (8, 9):
        for i in range(10):
            actual = float(i)
            inside = i % 2 == 0            # _aug coverage exactly 0.5
            rows.append({
                "player_id": i, "gw": gw, "position": "MID", "actual": actual,
                "p50_v1": actual + 2.0, "p50_aug": actual + aug_err,
                "p25_aug": actual - 1.0 if inside else actual + 1.0,
                "p75_aug": actual + 1.0 if inside else actual + 2.0,
                # v21 columns present-but-wrong (coverage 0.0): evaluate_aug
                # must NOT read these.
                "p25": actual + 5.0, "p50": actual + 5.0, "p75": actual + 6.0,
                "base_form": actual + 2.0, "xmin": 1.0, "hot3": float(i),
            })
    df = pd.DataFrame(rows)
    if cap_flip:
        # candidate crowns a dud (actual 0); 9.5 only just tops the real max
        # (9 + aug_err), so one distorted row can't flip the MAE comparison.
        df.loc[(df["gw"] == 8) & (df["player_id"] == 0), "p50_aug"] = 9.5
    return df


def test_gate_pass_and_fail_paths():
    ok = evaluate_aug(_mk_results(0.25, cap_flip=False))
    assert ok["beats_v1_mae"] and ok["captaincy_ok"] and ok["coverage_ok"]
    assert ok["passes_gate"]
    bad = evaluate_aug(_mk_results(0.25, cap_flip=True))
    assert bad["beats_v1_mae"] and not bad["captaincy_ok"]
    assert not bad["passes_gate"]


def test_coverage_reads_aug_columns_not_v21():
    m = evaluate_aug(_mk_results(0.25, cap_flip=False))
    # the v21 p25/p75 in the frame give coverage 0.0; the _aug bands were
    # constructed for exactly 0.5 — a 0.5 reading proves column selection.
    assert m["coverage"] == 0.5 and m["coverage_ok"]


def test_eval_filter_uses_heuristic_xmin_and_uncapped_is_everything():
    df = _mk_results(0.25, cap_flip=False)
    df.loc[df["gw"] == 8, "xmin"] = 0.0
    m = evaluate_aug(df)
    assert m["n_eval"] == 10               # only gw 9 rows survive the filter
    assert m["uncapped"]["n"] == 20        # uncapped sees all rows


def _metrics_stub() -> dict:
    return {
        "n_eval": 100, "v1_mae": 2.0632, "aug_mae": 2.0440,
        "base_form_mae": 2.44, "v1_captaincy": 185.0, "aug_captaincy": 186.0,
        "aug_spearman": 0.31, "v1_spearman": 0.30, "coverage": 0.49,
        "beats_v1_mae": True, "captaincy_ok": True, "coverage_ok": True,
        "passes_gate": True,
        "uncapped": {"n": 200, "v1_mae": 2.5, "aug_mae": 2.4},
        "hot_streak": {"n": 20, "aug_signed_error": -1.0,
                       "v1_signed_error": -1.1, "base_form_signed_error": 2.0},
    }


def test_report_appends_after_v21_and_truncates_own_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    prefix = ("# v1\n\n<!-- xpts-v2-results -->\n\nv2 body\n\n"
              "<!-- xpts-v21-results -->\n\nv21 body\n")
    path.write_text(prefix + f"\n{REPORT_MARKER_AUG}\n\nOLD v138 section\n")
    write_report_aug(_metrics_stub(), str(path))
    content = path.read_text()
    assert content.startswith(prefix.rstrip() + "\n\n" + REPORT_MARKER_AUG)
    assert content.count(REPORT_MARKER_AUG) == 1
    assert "OLD v138 section" not in content
    assert "v21 body" in content           # earlier sections untouched
    assert "✅ PASS" in content


def test_report_refuses_duplicate_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    path.write_text(f"{REPORT_MARKER_AUG}\nx\n{REPORT_MARKER_AUG}\ny\n")
    with pytest.raises(ValueError):
        write_report_aug(_metrics_stub(), str(path))


def test_run_gate_dumps_frames_and_writes_report(tmp_path, synthetic_history,
                                                 synthetic_strengths):
    report = tmp_path / "xpts-model.md"
    report.write_text("# doc\n")
    dump = tmp_path / "results.csv"
    m = run_gate(synthetic_history, synthetic_strengths, str(report),
                 dump_path=str(dump), start_gw=25, end_gw=28)
    dumped = pd.read_csv(dump)
    assert {"p50_v1", "p50_aug", "p25_aug", "p75_aug"} <= set(dumped.columns)
    minutes = pd.read_csv(tmp_path / "results.minutes.csv")
    assert {"player_id", "gw", "p_play", "p60"} <= set(minutes.columns)
    assert m["n_eval"] > 0 and isinstance(m["passes_gate"], bool)
    content = report.read_text()
    assert REPORT_MARKER_AUG in content and "## Gate" in content


def test_evaluate_aug_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_aug(pd.DataFrame())
