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


from feature_spec_v2 import LEAGUE_XG_PRIOR
from match_engine import MatchEngine


def _tf(team, opp, gw, fixture, home, xg_for, xg_against):
    return {
        "fixture_id": fixture, "team_id": team, "opponent_team": opp, "gw": gw,
        "was_home": home, "xg_for": xg_for, "xg_against": xg_against,
        "goals_for": 0, "goals_against": 0,
    }


# Team 1: two HOME matches (GW1 xg 2.0, GW3 xg 1.0). Team 2: one AWAY match.
TF = pd.DataFrame([
    _tf(1, 2, 1, 10, True, 2.0, 0.5),
    _tf(2, 1, 1, 10, False, 0.5, 2.0),
    _tf(1, 3, 3, 30, True, 1.0, 1.5),
    _tf(3, 1, 3, 30, False, 1.5, 1.0),
])


def test_rating_uses_only_prior_gws_no_leakage():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=0)
    # before_gw=3 sees only the GW1 match -> att_home(1) = 2.0
    assert eng.rating(1, "home", "att", before_gw=3) == pytest.approx(2.0)
    # before_gw=4 sees both, alpha=1 -> plain mean, most-recent-first irrelevant
    assert eng.rating(1, "home", "att", before_gw=4) == pytest.approx(1.5)


def test_rating_exp_decay_weights_recent_match_more():
    eng = MatchEngine(TF, window=6, alpha=0.5, prior_weight=0)
    # recent-first [1.0 (GW3), 2.0 (GW1)], weights [1, .5]/1.5
    assert eng.rating(1, "home", "att", before_gw=4) == pytest.approx((1.0 + 0.5 * 2.0) / 1.5)


def test_rating_shrinks_toward_league_baseline():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=2)
    L = eng.league_baseline("home", before_gw=3)  # only GW1: league home xg = 2.0... shrunk
    k, raw = 1, 2.0
    expected = (k * raw + 2 * L) / (k + 2)
    assert eng.rating(1, "home", "att", before_gw=3) == pytest.approx(expected)


def test_unseen_team_rating_is_exactly_league_baseline():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=4)
    # Team 99 (promoted, k=0) -> pure league baseline
    assert eng.rating(99, "home", "att", before_gw=4) == pytest.approx(
        eng.league_baseline("home", before_gw=4)
    )


def test_league_baseline_shrinks_to_prior_when_no_data():
    eng = MatchEngine(TF)
    # before GW1 nothing exists -> exactly the constant prior
    assert eng.league_baseline("home", before_gw=1) == pytest.approx(LEAGUE_XG_PRIOR)


def test_league_baseline_blends_data_with_prior():
    eng = MatchEngine(TF, prior_weight=4)
    # home rows before GW4: xg 2.0 (GW1) + 1.0 (GW3) -> raw mean 1.5, n=2
    expected = (2 * 1.5 + 4 * LEAGUE_XG_PRIOR) / (2 + 4)
    assert eng.league_baseline("home", before_gw=4) == pytest.approx(expected)


def test_def_rating_reads_xg_against_at_venue():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=0)
    # team 1 home defence: conceded 0.5 (GW1), 1.5 (GW3)
    assert eng.rating(1, "home", "def", before_gw=4) == pytest.approx(1.0)
