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

_ART = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v1.json")
_OUT = os.path.join(os.path.dirname(__file__), "artifacts", "parity-fixture.json")

# One opponent club with distinct home/away strengths so the away/home branch
# is exercised.
CLUB_STRENGTHS = {
    5: {"strength_defence_home": 1200, "strength_defence_away": 1300,
        "strength_attack_home": 1100, "strength_attack_away": 1000},
}


def _prior(pid: int):
    # two prior GWs with non-trivial, distinct stats
    return pd.DataFrame([
        {"gw": 1, "fixture_id": pid * 10, "starts": 1, "minutes": 90, "total_points": 3,
         "expected_goals": 0.2, "expected_assists": 0.1, "expected_goal_involvements": 0.3,
         "threat": 20.0, "creativity": 10.0, "influence": 15.0, "bps": 18,
         "defensive_contribution": 2, "value": 70},
        {"gw": 2, "fixture_id": pid * 10 + 1, "starts": 1, "minutes": 80, "total_points": 9,
         "expected_goals": 0.6, "expected_assists": 0.3, "expected_goal_involvements": 0.9,
         "threat": 55.0, "creativity": 33.0, "influence": 44.0, "bps": 30,
         "defensive_contribution": 4, "value": 71},
    ])


def main() -> None:
    artifact = json.load(open(_ART))
    cases = []
    for i, pos in enumerate(POSITIONS):
        if pos not in artifact["coefficients"]:
            continue
        prior = _prior(i + 1)
        target = pd.Series({"was_home": bool(i % 2), "opponent_team": 5, "value": 72})
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
    out = {"model_version": MODEL_VERSION, "cases": cases}
    with open(_OUT, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[parity] wrote {len(cases)} cases -> {_OUT}")


if __name__ == "__main__":
    main()
