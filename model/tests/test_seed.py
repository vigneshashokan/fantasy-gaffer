import pytest

from feature_spec import FORM_STATS, FORM_WINDOW
from seed import blend_rates, newcomer_rates, pseudo_rows
from seed_spec import NEWCOMER_K, SEASON_WEIGHTS, SEED_DENOMINATOR, SEED_ROWS


def season(**over):
    base = {s: 0.0 for s in FORM_STATS}
    base.update({"starts": 0, "end_cost": 100, "element_code": 1})
    base.update(over)
    return base


def test_seed_rows_matches_form_window():
    # The whole decay mechanism relies on the pseudo-rows exactly filling the
    # window. If FORM_WINDOW moves and SEED_ROWS does not, the prior either
    # never fully clears or under-fills at GW1.
    assert SEED_ROWS == FORM_WINDOW


def test_blend_single_season_renormalises_to_one():
    r = blend_rates([season(total_points=380, starts=38)])
    assert r["total_points"] == pytest.approx(380 / SEED_DENOMINATOR)
    assert r["starts"] == pytest.approx(1.0)


def test_blend_two_seasons_applies_declared_weights():
    r = blend_rates([
        season(total_points=380, starts=38),
        season(total_points=38, starts=0),
    ])
    expected = SEASON_WEIGHTS[0] * (380 / 38) + SEASON_WEIGHTS[1] * (38 / 38)
    assert r["total_points"] == pytest.approx(expected)
    assert r["starts"] == pytest.approx(SEASON_WEIGHTS[0] * 1.0)


def test_blend_ignores_seasons_beyond_depth():
    two = blend_rates([season(total_points=380), season(total_points=38)])
    three = blend_rates([
        season(total_points=380), season(total_points=38), season(total_points=999),
    ])
    assert two["total_points"] == pytest.approx(three["total_points"])


def test_blend_empty_returns_none():
    assert blend_rates([]) is None


def test_pseudo_rows_sort_below_every_real_gameweek():
    rows = pseudo_rows(blend_rates([season(total_points=380, starts=38)]))
    assert len(rows) == SEED_ROWS
    # Real gameweeks start at 1; every pseudo-row must lose the descending sort.
    assert all(r["gw"] == 0 for r in rows)
    assert len({r["fixture_id"] for r in rows}) == SEED_ROWS


def test_pseudo_rows_carry_fractional_starts():
    # xmin is mean(starts) over the window, so a fraction here IS the mechanism
    # for availability — not a type error to be rounded away.
    rows = pseudo_rows(blend_rates([season(starts=19)]))
    assert rows[0]["starts"] == pytest.approx(0.5)


def mk(position, end_cost, code, total_points):
    return {"position": position, "end_cost": end_cost, "element_code": code,
            "rates": {**{s: 0.0 for s in FORM_STATS},
                      "total_points": float(total_points), "starts": 1.0}}


def test_newcomer_takes_exactly_k_nearest_by_price_within_position():
    # end_cost 50..89, total_points == end_cost, so the expected mean is
    # computable exactly. Asserting the precise value is the point: a loose
    # bound would pass for almost any wrong selection.
    pool = [mk("MID", 50 + i, i, 50 + i) for i in range(40)]
    # An outlier in another position at the exact target price: if position
    # filtering is broken this dominates the mean and the assert fails loudly.
    pool.append(mk("FWD", 90, 999, 100000.0))

    r = newcomer_rates("MID", 90, pool)
    # The 10 MIDs nearest 90 are end_cost 80..89; mean total_points = 84.5.
    assert r["total_points"] == pytest.approx(84.5)
    assert r["starts"] == pytest.approx(1.0)


def test_newcomer_no_pool_returns_none():
    assert newcomer_rates("GKP", 45, []) is None


def test_newcomer_pool_smaller_than_k_uses_all_of_it():
    pool = [mk("GKP", 45, 1, 3.0), mk("GKP", 55, 2, 5.0)]
    assert newcomer_rates("GKP", 50, pool)["total_points"] == pytest.approx(4.0)


def test_newcomer_tie_break_is_order_independent():
    # The two boundary candidates share BOTH abs_dist (9) AND end_cost (41) —
    # only element_code can break this tie. Python's sort is stable, so an
    # implementation whose key is missing element_code would instead keep
    # whichever of the pair appeared FIRST in the input list: reversing the
    # pool would then change the answer, which is exactly what this test
    # discriminates against (a prior version of this test used a pair with
    # different end_costs, so its second key component alone resolved the
    # order and element_code was never exercised).
    pool = [mk("DEF", 50 + i, 100 + i, 50 + i) for i in range(9)]   # dist 0..8
    pool.append(mk("DEF", 41, 200, 41))    # dist 9, end_cost 41 -> wins tie
    pool.append(mk("DEF", 41, 201, 141))   # dist 9, end_cost 41, loses tie

    forward = newcomer_rates("DEF", 50, pool)["total_points"]
    reverse = newcomer_rates("DEF", 50, list(reversed(pool)))["total_points"]
    assert forward == pytest.approx(reverse)
    # 50..58 (sum 486) plus 41 => 527/10 = 52.7. Had code 201 (total_points
    # 141) won instead: (486 + 141)/10 = 62.7, so this assertion actually
    # discriminates between the two tie-break outcomes.
    assert forward == pytest.approx(52.7)
