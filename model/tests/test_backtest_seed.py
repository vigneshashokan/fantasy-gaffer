import pandas as pd
import pytest

from backtest_seed import (
    G2_MIN_STARTS,
    evaluate_g2,
    join_by_code,
    load_eval_history,
    seed_season_floor,
)


def test_eval_history_parses_was_home_to_both_classes():
    # The CSV stores 't'/'f'. bool('f') is True, so an unparsed column makes
    # every fixture a home fixture and gives every row the wrong opponent
    # strengths — wrong answers, no error. (pandas 3 types the column `str`,
    # not `object`, so a dtype guard silently skips the parse.)
    df = load_eval_history()
    assert df["was_home"].dtype == bool
    assert 0.45 < df["was_home"].mean() < 0.55  # not all-True, not all-False


def test_eval_history_rejects_an_unexpected_was_home_value(tmp_path, monkeypatch):
    # An unmapped value maps to NaN, and bool(NaN) is True — the same silent
    # every-fixture-is-home failure. The both-classes assert only catches an
    # ALL-unmapped column, so this branch needs its own check.
    csv = tmp_path / "h.csv"
    csv.write_text("player_id,gw,was_home\n1,1,t\n2,1,f\n3,1,MAYBE\n")
    with pytest.raises(ValueError, match="unexpected was_home values"):
        load_eval_history(str(csv))


def test_join_by_code_maps_prior_season_to_current_element_ids():
    # The whole cross-season join. Element ids churn ~99% between seasons;
    # code does not. Getting this backwards silently pairs each player with a
    # different footballer, which is the failure mode that would look like a
    # merely mediocre model rather than a bug.
    seeds = pd.DataFrame({"element_code": [223094, 154561], "total_points": [6.3, 3.1]})
    bootstrap = pd.DataFrame({"id": [430, 1], "code": [223094, 154561]})
    out = join_by_code(seeds, bootstrap)
    assert set(out["player_id"]) == {430, 1}
    assert out.loc[out.player_id == 430, "total_points"].iloc[0] == pytest.approx(6.3)


def test_join_by_code_drops_unmatched_codes_rather_than_guessing():
    seeds = pd.DataFrame({"element_code": [999999], "total_points": [1.0]})
    bootstrap = pd.DataFrame({"id": [1], "code": [154561]})
    assert len(join_by_code(seeds, bootstrap)) == 0


def test_g2_fails_on_a_goalkeeper_top_pick():
    preds = pd.DataFrame({
        "gw": [1, 2], "player_id": [10, 11], "p50": [9.0, 9.0],
        "position": ["GKP", "MID"], "prior_starts": [38, 38],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is False
    assert any("GKP" in r for r in reasons)


def test_g2_fails_on_an_unproven_top_pick():
    preds = pd.DataFrame({
        "gw": [1], "player_id": [10], "p50": [9.0],
        "position": ["FWD"], "prior_starts": [G2_MIN_STARTS - 1],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is False


def test_g2_passes_a_clean_slate():
    preds = pd.DataFrame({
        "gw": [1, 2], "player_id": [10, 11], "p50": [9.0, 8.0],
        "position": ["FWD", "MID"], "prior_starts": [34, 30],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is True
    assert reasons == []


def test_g0_floor_is_computed_from_seed_seasons_not_the_eval_window():
    # A floor computed on its own answer is unbeatable by construction. The
    # constant must come from the 2024/25 + 2023/24 totals only, so eval-window
    # actuals must not move it at all.
    seeds = pd.DataFrame({
        "position": ["FWD", "FWD", "MID"],
        "total_points": [190.0, 114.0, 76.0],   # /38 -> 5.0, 3.0, 2.0
    })
    floor = seed_season_floor(seeds)
    assert floor["FWD"] == pytest.approx(4.0)
    assert floor["MID"] == pytest.approx(2.0)
    # No eval-window argument exists to leak through.
    assert "eval" not in seed_season_floor.__code__.co_varnames
