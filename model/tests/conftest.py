"""Shared deterministic fixtures for v2.1 tests: 8 players (2 per position)
x 30 GWs with rotation patterns and within-position stat variation. No RNG."""
import pandas as pd
import pytest


@pytest.fixture
def synthetic_history() -> pd.DataFrame:
    rows = []
    positions = ["GKP", "DEF", "MID", "FWD"]
    for pid in range(1, 9):
        pos = positions[(pid - 1) % 4]
        rotated = pid in (3, 7)
        for gw in range(1, 31):
            benched = rotated and gw % 5 == 0
            minutes = 0 if benched else (90 if (gw + pid) % 3 else 62)
            rows.append({
                "player_id": pid, "gw": gw, "fixture_id": gw * 100 + pid,
                "position": pos, "was_home": (gw + pid) % 2 == 0,
                "opponent_team": (pid % 4) + 1, "team_id": ((pid + 1) % 4) + 1,
                "starts": 1 if minutes >= 60 else 0, "minutes": minutes,
                "value": 50 + pid + gw // 10,
                "total_points": (gw * pid) % 9 if minutes else 0,
                "expected_goals": 0.1 * pid + 0.01 * gw,
                "expected_assists": 0.05 * pid + 0.005 * (gw % 4),
                "expected_goal_involvements": 0.15 * pid + 0.01 * gw + 0.01 * (gw % 2),
                "threat": 5.0 * pid + (gw % 7),
                "creativity": 3.0 * pid + (gw % 5),
                "influence": 4.0 * pid + 0.1 * gw,
                "bps": 10 + pid + (gw % 11),
                "defensive_contribution": pid + (gw % 3),
            })
    return pd.DataFrame(rows)


@pytest.fixture
def synthetic_strengths() -> dict:
    return {i: {"strength_attack_home": 1200 + i * 10,
                "strength_attack_away": 1250 + i * 10,
                "strength_defence_home": 1100 + i * 10,
                "strength_defence_away": 1150 + i * 10} for i in range(1, 5)}
