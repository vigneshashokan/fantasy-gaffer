import pandas as pd
import pytest

from match_engine import build_team_fixtures


def _hrow(player_id, fixture, gw, team, opp, home, xg, goals=0):
    return {
        "player_id": player_id, "fixture_id": fixture, "gw": gw,
        "team_id": team, "opponent_team": opp, "was_home": home,
        "expected_goals": xg, "goals_scored": goals,
    }


# Fixture 10 (GW1): team 1 home vs team 2. Two players a side.
HISTORY = pd.DataFrame([
    _hrow(101, 10, 1, 1, 2, True, 0.5, goals=1),
    _hrow(102, 10, 1, 1, 2, True, 0.7),
    _hrow(201, 10, 1, 2, 1, False, 0.2),
    _hrow(202, 10, 1, 2, 1, False, 0.1, goals=1),
    # Fixture 20 (GW2): team 1 away vs team 3.
    _hrow(101, 20, 2, 1, 3, False, 0.3),
    _hrow(301, 20, 2, 3, 1, True, 1.1, goals=2),
])


def test_one_row_per_fixture_team_with_summed_xg():
    tf = build_team_fixtures(HISTORY)
    assert len(tf) == 4  # 2 fixtures x 2 sides
    t1 = tf[(tf.fixture_id == 10) & (tf.team_id == 1)].iloc[0]
    assert t1.xg_for == pytest.approx(1.2)   # 0.5 + 0.7
    assert t1.xg_against == pytest.approx(0.3)  # opponents' 0.2 + 0.1
    assert bool(t1.was_home) is True
    assert t1.opponent_team == 2
    assert t1.gw == 1


def test_goals_for_and_against_from_player_sums():
    tf = build_team_fixtures(HISTORY)
    t2 = tf[(tf.fixture_id == 10) & (tf.team_id == 2)].iloc[0]
    assert t2.goals_for == 1      # player 202
    assert t2.goals_against == 1  # team 1's player 101
    assert t2.xg_against == pytest.approx(1.2)


def test_away_side_mirrors_home_side():
    tf = build_team_fixtures(HISTORY)
    t3 = tf[(tf.fixture_id == 20) & (tf.team_id == 3)].iloc[0]
    assert bool(t3.was_home) is True
    t1a = tf[(tf.fixture_id == 20) & (tf.team_id == 1)].iloc[0]
    assert bool(t1a.was_home) is False
    assert t1a.xg_against == pytest.approx(1.1)
    assert t1a.goals_against == 2
