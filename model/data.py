"""I/O: load player_gw_history from Postgres and team strengths from bootstrap."""
from __future__ import annotations

import os

import pandas as pd
import psycopg
import requests

DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"

_HISTORY_COLUMNS = [
    "player_id", "fixture_id", "gw", "position", "team_id", "opponent_team",
    "was_home", "minutes", "starts", "goals_scored", "assists", "clean_sheets",
    "goals_conceded", "bonus", "bps", "total_points", "expected_goals",
    "expected_assists", "expected_goal_involvements", "expected_goals_conceded",
    "ict_index", "influence", "creativity", "threat", "defensive_contribution",
    "value",
]


def parse_team_strengths(bootstrap: dict) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for t in bootstrap["teams"]:
        out[int(t["id"])] = {
            "strength_attack_home": t["strength_attack_home"],
            "strength_attack_away": t["strength_attack_away"],
            "strength_defence_home": t["strength_defence_home"],
            "strength_defence_away": t["strength_defence_away"],
        }
    return out


def load_team_strengths(fetch=requests.get) -> dict[int, dict]:
    resp = fetch(BOOTSTRAP_URL, headers={"User-Agent": "fpl-gaffer-model/1.0"}, timeout=15)
    resp.raise_for_status()
    return parse_team_strengths(resp.json())


def load_history(database_url: str | None = None, season: str = "2025/26") -> pd.DataFrame:
    url = database_url or os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    cols = ", ".join(_HISTORY_COLUMNS)
    with psycopg.connect(url) as conn:
        df = pd.read_sql(
            f"select {cols} from public.player_gw_history where season = %(s)s",
            conn, params={"s": season},
        )
    # numeric() columns arrive as Decimal/str; coerce the feature-relevant ones.
    numeric = [
        "expected_goals", "expected_assists", "expected_goal_involvements",
        "expected_goals_conceded", "ict_index", "influence", "creativity", "threat",
    ]
    for c in numeric:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    df["was_home"] = df["was_home"].astype(bool)
    return df
