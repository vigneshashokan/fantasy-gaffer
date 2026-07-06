"""Small documented grid over the rating hyperparams (spec §2), selected by
walk-forward MAE of the full v2 variant. Run once; freeze the winner into
feature_spec_v2.py. GRID=quick runs a single config as a smoke test.

NOTE: hyperparams are passed via walk_forward_v2(rating_params=...) — never by
patching module constants (MatchEngine's defaults bind at definition time, so
patching feature_spec_v2/match_engine attributes would silently do nothing)."""
from __future__ import annotations

import itertools
import os

from backtest_v2 import evaluate_v2, walk_forward_v2
from data import load_history, load_team_strengths

GRID = {
    "window": [6, 10, 19],
    "alpha": [0.8, 0.9, 1.0],
    "prior_weight": [2, 4],
}

# The frozen defaults (feature_spec_v2). On (4-dp) MAE ties — observed: all
# 18 configs tied — BEST must be the incumbent, not min()'s arbitrary pick.
INCUMBENT = {"window": 10, "alpha": 0.9, "prior_weight": 4}


def main() -> None:
    history = load_history()
    strengths = load_team_strengths()
    combos = [{"window": 10, "alpha": 0.9, "prior_weight": 4}] \
        if os.environ.get("GRID") == "quick" else [
            dict(zip(GRID, vals)) for vals in itertools.product(*GRID.values())
        ]
    results = []
    for combo in combos:
        m = evaluate_v2(walk_forward_v2(history, strengths, rating_params=combo))
        results.append((combo, m["v2_mae"], m["v2_captaincy"]))
        print(f"[grid] {combo} -> MAE {m['v2_mae']:.4f} cap {m['v2_captaincy']:.0f}")
    best = min(results, key=lambda r: (round(r[1], 4), r[0] != INCUMBENT))
    print(f"[grid] BEST: {best[0]} MAE {best[1]:.4f} cap {best[2]:.0f}")


if __name__ == "__main__":
    main()
