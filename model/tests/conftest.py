"""Shared deterministic fixtures for v2.1/v3 tests: 8 players (2 per position)
x 30 GWs with rotation patterns and within-position stat variation, giving every
position both hurdle label classes (rotation benching + sub-60 cameos); now
carries the full v3 column set (goals/assists/CS/GC/bonus/saves/pens/cards/OG).
No RNG."""
import pandas as pd
import pytest


@pytest.fixture
def synthetic_history() -> pd.DataFrame:
    rows = []
    positions = ["GKP", "DEF", "MID", "FWD"]
    for pid in range(1, 9):
        pos = positions[(pid - 1) % 4]
        rotated = pid in (3, 4, 5, 6)
        for gw in range(1, 31):
            benched = rotated and gw % 5 == 0
            minutes = 0 if benched else (90 if (gw + pid) % 3 else (62 if gw % 2 else 25))
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
                "goals_scored": 1 if (minutes >= 60 and (gw + pid) % 6 == 0) else 0,
                "assists": 1 if (minutes >= 1 and (gw + pid) % 7 == 0) else 0,
                "clean_sheets": 1 if (minutes >= 60 and gw % 4 == 0) else 0,
                "goals_conceded": (gw + pid) % 3 if minutes else 0,
                "bonus": (3 if (gw + pid) % 11 == 0 else 1) if (minutes and (gw + pid) % 5 == 0) else 0,
                "saves": (3 + gw % 4) if (pos == "GKP" and minutes) else 0,
                "penalties_saved": 1 if (pos == "GKP" and minutes and gw % 13 == 0) else 0,
                "penalties_missed": 1 if (pos == "FWD" and minutes and gw % 12 == 0) else 0,
                "yellow_cards": 1 if (minutes and (gw + 2 * pid) % 8 == 0) else 0,
                "red_cards": 1 if (minutes and (gw + pid) % 19 == 0) else 0,
                "own_goals": 1 if (minutes and (gw + pid) % 23 == 0) else 0,
            })
    return pd.DataFrame(rows)


@pytest.fixture
def synthetic_strengths() -> dict:
    return {i: {"strength_attack_home": 1200 + i * 10,
                "strength_attack_away": 1250 + i * 10,
                "strength_defence_home": 1100 + i * 10,
                "strength_defence_away": 1150 + i * 10} for i in range(1, 5)}
