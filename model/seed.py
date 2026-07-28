"""Prior-season seeding for the GW1 cold start (#212). Pure; no I/O.

Synthesizes SEED_ROWS pseudo-fixture rows from element-summary.history_past
season aggregates. Those rows are prepended to a player's real history and
consumed by the UNCHANGED feature builder, so the existing exp-decay blends the
prior out as real gameweeks arrive.
"""
from __future__ import annotations

from feature_spec import FORM_STATS
from seed_spec import (
    NEWCOMER_K,
    SEASON_WEIGHTS,
    SEED_DENOMINATOR,
    SEED_DEPTH,
    SEED_ROWS,
)


def blend_rates(seasons: list[dict]) -> dict | None:
    """seasons: season-aggregate dicts, MOST RECENT FIRST. Uses up to SEED_DEPTH."""
    use = seasons[:SEED_DEPTH]
    if not use:
        return None
    w = list(SEASON_WEIGHTS[:len(use)])
    total = sum(w)
    w = [x / total for x in w]

    out: dict[str, float] = {}
    for stat in FORM_STATS:
        out[stat] = sum(
            wi * (float(s.get(stat, 0.0)) / SEED_DENOMINATOR)
            for wi, s in zip(w, use)
        )
    # Fractional on purpose: xmin is mean(starts) over the window, so this IS
    # the availability signal. Do not round to 0/1.
    out["starts"] = sum(
        wi * (float(s.get("starts", 0.0)) / SEED_DENOMINATOR)
        for wi, s in zip(w, use)
    )
    return out


def pseudo_rows(rates: dict | None) -> list[dict]:
    """SEED_ROWS identical rows shaped like player_gw_history.

    gw=0 puts them below every real gameweek under the existing
    sort_values(["gw", "fixture_id"], ascending=False), so real rows always
    fill the window first. fixture_id is negative and distinct only to keep
    that sort total.
    """
    if rates is None:
        return []
    return [
        {
            "gw": 0,
            "fixture_id": -(i + 1),
            "starts": rates["starts"],
            **{stat: rates[stat] for stat in FORM_STATS},
        }
        for i in range(SEED_ROWS)
    ]


def newcomer_rates(position: str, now_cost: int, pool: list[dict]) -> dict | None:
    """k-nearest-by-price prior for a player with no prior-season history.

    pool entries: {"position", "end_cost", "element_code", "rates"} for every
    player that DOES have blended rates. Reference price is last season's
    end_cost; the newcomer is matched on now_cost.

    The sort key includes element_code so the ordering is TOTAL — two players
    equidistant from the target must resolve identically here and in the TS
    port, or the parity fixture flakes.
    """
    same = [p for p in pool if p["position"] == position]
    if not same:
        return None
    same = sorted(
        same,
        key=lambda p: (abs(p["end_cost"] - now_cost), p["end_cost"], p["element_code"]),
    )[:NEWCOMER_K]

    n = float(len(same))
    keys = list(FORM_STATS) + ["starts"]
    return {k: sum(float(p["rates"][k]) for p in same) / n for k in keys}
