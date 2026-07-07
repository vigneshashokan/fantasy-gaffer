"""#130 prospective-eval tests: season cutoff, model_version split, joint
frame, MAE pools, ex-ante captaincy (own-pool argmax; missing actual -> 0),
promotion statuses, and the doc writer's marker semantics."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from eval_prospective import (SCOREBOARD_MARKER, captain_picks, evaluated_gws,
                              joint_frame, mae_summary, promotion_status,
                              season_cutoff, split_by_model, write_doc)


def test_season_cutoff_is_july_first_of_start_year():
    assert season_cutoff("2026/27") == datetime(2026, 7, 1, tzinfo=timezone.utc)
    assert season_cutoff("2025/26") == datetime(2025, 7, 1, tzinfo=timezone.utc)


def _rows():
    return pd.DataFrame([
        {"player_id": 1, "gw": 1, "p50": 5.0, "mean": 5.5, "model_version": "v3.1"},
        {"player_id": 1, "gw": 1, "p50": 4.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 2, "gw": 1, "p50": 2.0, "mean": 2.2, "model_version": "v3.1"},
        {"player_id": 2, "gw": 1, "p50": 3.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 1, "gw": 2, "p50": 6.0, "mean": 6.1, "model_version": "v3.1"},
        {"player_id": 1, "gw": 2, "p50": 5.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 9, "gw": 1, "p50": 9.0, "mean": 9.0, "model_version": "v2-experimental"},
    ])


def _actuals():
    return pd.DataFrame([
        {"player_id": 1, "gw": 1, "actual": 8.0, "minutes": 90},
        {"player_id": 2, "gw": 1, "actual": 2.0, "minutes": 30},
        {"player_id": 1, "gw": 2, "actual": 3.0, "minutes": 90},
    ])


def test_split_by_model_strict_on_version():
    v31, v1 = split_by_model(_rows())
    assert len(v31) == 3 and (v31["model_version"] == "v3.1").all()
    assert len(v1) == 3 and v1["model_version"].str.startswith("v1").all()
    # the experimental row belongs to neither family
    assert 9 not in set(v31["player_id"]) | set(v1["player_id"])


def test_joint_frame_and_evaluated_gws():
    v31, v1 = split_by_model(_rows())
    j = joint_frame(v31, v1, _actuals())
    assert len(j) == 3  # (1,1), (2,1), (1,2)
    assert evaluated_gws(v31, v1, _actuals()) == [1, 2]


def test_mae_summary_pools():
    v31, v1 = split_by_model(_rows())
    j = joint_frame(v31, v1, _actuals())
    m = mae_summary(j)
    # full pool: v31 errors |5.5-8... no: MAE uses p50 (the shipped point
    # estimate): |5-8|, |2-2|, |6-3| -> 2.0 ; v1: |4-8|, |3-2|, |5-3| -> 7/3
    assert m["full"]["n"] == 3
    assert m["full"]["v31"] == pytest.approx(2.0)
    assert m["full"]["v1"] == pytest.approx(7.0 / 3.0)
    # starters pool: minutes >= 60 -> rows (1,1) and (1,2)
    assert m["starters"]["n"] == 2
    assert m["starters"]["v31"] == pytest.approx((3.0 + 3.0) / 2.0)


def test_captain_picks_own_pool_and_missing_actual_zero():
    v31, v1 = split_by_model(_rows())
    ep = pd.DataFrame([{"player_id": 2, "gw": 1, "ep_next": 4.5}])
    picks = captain_picks(v31, v1, ep, _actuals(), [1, 2])
    p = picks.set_index(["model", "gw"])
    assert p.loc[("v31", 1), "player_id"] == 1      # argmax mean (5.5)
    assert p.loc[("v31", 1), "actual"] == 8.0
    assert p.loc[("v1", 1), "player_id"] == 1       # argmax p50 (4.0)
    assert p.loc[("ep", 1), "player_id"] == 2       # its own pool
    # gw 2: v1 pool has only player 1; ep has no gw-2 rows -> no ep pick
    assert ("ep", 2) not in p.index
    # a projected pick with no actual row scores 0:
    v31_only = pd.DataFrame([{"player_id": 7, "gw": 2, "p50": 9.9, "mean": 9.9,
                              "model_version": "v3.1"}])
    picks2 = captain_picks(v31_only, v31_only.assign(model_version="v1.0.0"),
                           ep.iloc[0:0], _actuals(), [2])
    assert (picks2["actual"] == 0.0).all()


def test_promotion_status_each_branch():
    ok_mae = {"full": {"n": 100, "v31": 2.0, "v1": 2.1}}
    s, r = promotion_status(6, ok_mae, {"v31": 50.0, "v1": 50.0})
    assert s == "PROMOTE-ELIGIBLE"
    s, r = promotion_status(5, ok_mae, {"v31": 50.0, "v1": 50.0})
    assert s == "HOLD" and "5 evaluated" in r
    s, r = promotion_status(6, {"full": {"n": 100, "v31": 2.2, "v1": 2.1}},
                            {"v31": 50.0, "v1": 50.0})
    assert s == "HOLD" and "MAE" in r
    s, r = promotion_status(6, ok_mae, {"v31": 49.0, "v1": 50.0})
    assert s == "HOLD" and "captaincy" in r


def test_write_doc_preserves_runbook_above_marker(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("# Runbook\n\nkeep me\n\n" + SCOREBOARD_MARKER +
                 "\n\nstale scoreboard\n")
    write_doc(str(p), "fresh scoreboard content")
    content = p.read_text()
    assert "keep me" in content and "stale scoreboard" not in content
    assert content.count(SCOREBOARD_MARKER) == 1
    assert content.index("fresh scoreboard") > content.index(SCOREBOARD_MARKER)


def test_write_doc_refuses_missing_marker(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("# Runbook without marker\n")
    with pytest.raises(ValueError, match="marker"):
        write_doc(str(p), "content")
