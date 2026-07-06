"""Emit a golden parity fixture: synthetic inputs + the exact features and
p25/p50/p75 the Python pipeline produces, so the Deno serving port can assert
byte-for-byte parity (train/serve skew guard). Run after train.py."""
from __future__ import annotations

import json
import os

import pandas as pd

from feature_spec import FEATURE_COLUMNS, MODEL_VERSION, POSITIONS
from features import build_feature_row
from train import predict

from feature_spec_v2 import FEATURE_COLUMNS_V2, MODEL_VERSION_V2
from features_v2 import build_feature_row_v2
from match_engine import MatchEngine, build_team_fixtures

_ART = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v1.json")
_OUT = os.path.join(os.path.dirname(__file__), "artifacts", "parity-fixture.json")
_ART_V2 = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v2.json")

# Deterministic synthetic team history: teams 1..4, 4 GWs, asymmetric xG so
# ratings/lambdas are non-trivial. The Deno port must reproduce every number.
_TEAM_HISTORY_ROWS = []
_xg = {(1, True): 1.8, (1, False): 1.1, (2, True): 1.2, (2, False): 0.7,
       (3, True): 1.5, (3, False): 1.3, (4, True): 0.9, (4, False): 0.6}
_fixture = 100
for gw, pairs in enumerate([[(1, 2), (3, 4)], [(2, 3), (4, 1)],
                            [(1, 3), (2, 4)], [(3, 1), (4, 2)]], start=1):
    for h, a in pairs:
        _fixture += 1
        for team, opp, home in ((h, a, True), (a, h, False)):
            _TEAM_HISTORY_ROWS.append({
                "player_id": team * 1000 + _fixture, "fixture_id": _fixture,
                "gw": gw, "team_id": team, "opponent_team": opp,
                "was_home": home, "expected_goals": _xg[(team, home)],
                "goals_scored": 0,
            })

# One opponent club with distinct home/away strengths so the away/home branch
# is exercised.
CLUB_STRENGTHS = {
    5: {"strength_defence_home": 1200, "strength_defence_away": 1300,
        "strength_attack_home": 1100, "strength_attack_away": 1000},
}


def _prior(pos: str):
    # Position-specific prior rows with realistic stats for each position
    position_priors = {
        "GKP": [
            {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 2,
             "expected_goals": 0.0, "expected_assists": 0.0, "expected_goal_involvements": 0.0,
             "threat": 0.0, "creativity": 0.0, "influence": 12.0, "bps": 15,
             "defensive_contribution": 0, "value": 45},
            {"gw": 2, "fixture_id": 20, "starts": 1, "minutes": 90, "total_points": 6,
             "expected_goals": 0.0, "expected_assists": 0.0, "expected_goal_involvements": 0.0,
             "threat": 0.0, "creativity": 2.0, "influence": 28.0, "bps": 25,
             "defensive_contribution": 0, "value": 45},
        ],
        "DEF": [
            {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 2,
             "expected_goals": 0.02, "expected_assists": 0.05, "expected_goal_involvements": 0.07,
             "threat": 8.0, "creativity": 12.0, "influence": 18.0, "bps": 18,
             "defensive_contribution": 8, "value": 50},
            {"gw": 2, "fixture_id": 20, "starts": 1, "minutes": 90, "total_points": 7,
             "expected_goals": 0.05, "expected_assists": 0.10, "expected_goal_involvements": 0.15,
             "threat": 12.0, "creativity": 20.0, "influence": 30.0, "bps": 28,
             "defensive_contribution": 10, "value": 50},
        ],
        "MID": [
            {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 3,
             "expected_goals": 0.15, "expected_assists": 0.12, "expected_goal_involvements": 0.27,
             "threat": 25.0, "creativity": 30.0, "influence": 22.0, "bps": 18,
             "defensive_contribution": 3, "value": 75},
            {"gw": 2, "fixture_id": 20, "starts": 1, "minutes": 90, "total_points": 9,
             "expected_goals": 0.45, "expected_assists": 0.25, "expected_goal_involvements": 0.70,
             "threat": 55.0, "creativity": 48.0, "influence": 40.0, "bps": 30,
             "defensive_contribution": 4, "value": 76},
        ],
        "FWD": [
            {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 2,
             "expected_goals": 0.30, "expected_assists": 0.08, "expected_goal_involvements": 0.38,
             "threat": 40.0, "creativity": 15.0, "influence": 20.0, "bps": 15,
             "defensive_contribution": 1, "value": 85},
            {"gw": 2, "fixture_id": 20, "starts": 1, "minutes": 90, "total_points": 8,
             "expected_goals": 0.65, "expected_assists": 0.15, "expected_goal_involvements": 0.80,
             "threat": 70.0, "creativity": 25.0, "influence": 38.0, "bps": 28,
             "defensive_contribution": 1, "value": 86},
        ],
    }
    return pd.DataFrame(position_priors[pos])


def build_v2_cases() -> dict:
    with open(_ART_V2) as f:
        artifact = json.load(f)
    team_history = pd.DataFrame(_TEAM_HISTORY_ROWS)
    engine = MatchEngine(build_team_fixtures(team_history))
    position_values = {"GKP": 45, "DEF": 50, "MID": 76, "FWD": 86}
    cases = []
    for i, pos in enumerate(POSITIONS):
        if pos not in artifact["coefficients"]:
            continue
        prior = _prior(pos)
        target = pd.Series({
            "was_home": bool(i % 2), "opponent_team": 3, "team_id": 1,
            "value": position_values[pos], "gw": 5,
        })
        feat = build_feature_row_v2(prior, target, engine)
        cases.append({
            "position": pos,
            "prior_rows": prior.drop(columns=["minutes", "value"]).to_dict(orient="records"),
            "target": {"was_home": bool(target["was_home"]),
                       "opponent_team": 3, "team_id": 1, "gw": 5,
                       "value": int(target["value"])},
            "expected_features": {c: feat[c] for c in FEATURE_COLUMNS_V2},
            "expected": {
                "p25": predict(artifact, feat, pos, 0.25),
                "p50": predict(artifact, feat, pos, 0.50),
                "p75": predict(artifact, feat, pos, 0.75),
            },
        })
    return {"model_version": MODEL_VERSION_V2,
            "team_history": _TEAM_HISTORY_ROWS, "cases": cases}


def main() -> None:
    with open(_ART) as f:
        artifact = json.load(f)
    cases = []
    position_values = {"GKP": 45, "DEF": 50, "MID": 76, "FWD": 86}
    for i, pos in enumerate(POSITIONS):
        if pos not in artifact["coefficients"]:
            continue
        prior = _prior(pos)
        target = pd.Series({"was_home": bool(i % 2), "opponent_team": 5, "value": position_values[pos]})
        feat = build_feature_row(prior, target, CLUB_STRENGTHS)
        cases.append({
            "position": pos,
            "prior_rows": prior.drop(columns=["minutes", "value"]).to_dict(orient="records"),
            "target": {"was_home": bool(target["was_home"]),
                       "opponent_team": int(target["opponent_team"]),
                       "value": int(target["value"])},
            "club_strengths": {str(k): v for k, v in CLUB_STRENGTHS.items()},
            "expected_features": {c: feat[c] for c in FEATURE_COLUMNS},
            "expected": {
                "p25": predict(artifact, feat, pos, 0.25),
                "p50": predict(artifact, feat, pos, 0.50),
                "p75": predict(artifact, feat, pos, 0.75),
            },
        })
    out = {"model_version": MODEL_VERSION, "cases": cases, "v2": build_v2_cases()}
    with open(_OUT, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[parity] wrote {len(cases)} cases -> {_OUT}")


if __name__ == "__main__":
    main()
