import numpy as np
import pandas as pd

from backtest import walk_forward, evaluate

STRENGTHS = {
    t: {"strength_defence_home": 1100, "strength_defence_away": 1100,
        "strength_attack_home": 1100, "strength_attack_away": 1100}
    for t in range(1, 21)
}


def _history(n_players=30, n_gw=12, seed=1):
    rng = np.random.default_rng(seed)
    rows = []
    for pid in range(1, n_players + 1):
        pos = ["GKP", "DEF", "MID", "FWD"][pid % 4]
        skill = rng.uniform(1, 6)
        for gw in range(1, n_gw + 1):
            pts = max(0, rng.normal(skill, 1.5))
            rows.append({
                "player_id": pid, "fixture_id": gw * 100 + pid, "gw": gw,
                "position": pos, "team_id": (pid % 20) + 1,
                "opponent_team": ((pid + gw) % 20) + 1, "was_home": bool(gw % 2),
                "minutes": 90, "starts": 1, "total_points": pts,
                "expected_goals": pts / 10, "expected_assists": 0.0,
                "expected_goal_involvements": pts / 10, "threat": pts,
                "creativity": 0.0, "influence": pts, "bps": pts * 3,
                "defensive_contribution": 0, "value": 50 + pid,
            })
    return pd.DataFrame(rows)


def test_walk_forward_produces_oos_predictions_per_player_gw():
    res = walk_forward(_history(), STRENGTHS, start_gw=8, end_gw=12)
    assert set(["player_id", "gw", "position", "actual", "p25", "p50", "p75",
                "base_form", "xmin"]).issubset(res.columns)
    assert res["gw"].min() >= 8 and res["gw"].max() <= 12
    # one row per (player, gw) after aggregation
    assert not res.duplicated(["player_id", "gw"]).any()
    # quantiles ordered on average
    assert res["p25"].mean() <= res["p50"].mean() <= res["p75"].mean()


def test_evaluate_returns_gate_fields():
    res = walk_forward(_history(), STRENGTHS, start_gw=8, end_gw=12)
    m = evaluate(res, min_xmin=0.5)
    for key in ["model_mae", "base_form_mae", "model_captaincy", "base_form_captaincy",
                "coverage", "beats_form_mae", "beats_form_captaincy",
                "coverage_ok", "passes_gate"]:
        assert key in m
    assert isinstance(m["passes_gate"], bool)
    # passes_gate must be the logical AND of the three component booleans.
    assert m["passes_gate"] == (m["beats_form_mae"] and m["beats_form_captaincy"] and m["coverage_ok"])
