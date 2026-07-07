"""serve_v3 CLI/I-O tests: table allowlist + depth-iff-shadow SQL, no-op
guards, --as-of-gw history filtering, dry-run, and the main flow with all DB
I/O monkeypatched (no live DB in the unit suite)."""
import pandas as pd
import pytest

import serve_v3
from serve_v3 import build_upsert_sql, main


def test_upsert_sql_rejects_unknown_table():
    with pytest.raises(ValueError, match="XPTS_SERVE_TABLE"):
        build_upsert_sql("players; drop table players", include_depth=False)


def test_upsert_sql_depth_iff_shadow():
    shadow = build_upsert_sql("projections_shadow", include_depth=True)
    live = build_upsert_sql("projections", include_depth=False)
    for col in ("mean", "p_goal", "p_assist", "p_cs", "p_haul", "p60"):
        assert col in shadow and col not in live
    for frag in ("insert into public.projections_shadow", "on conflict (player_id, gw)",
                 "model_version"):
        assert frag in shadow
    assert "insert into public.projections " in live


def _fixtures(finished: bool) -> pd.DataFrame:
    return pd.DataFrame([{"id": 900 + i, "event": 25 + i,
                          "kickoff_time": pd.Timestamp("2026-02-01T15:00:00Z"),
                          "team_h": 1, "team_a": 2, "finished": finished}
                         for i in range(4)])


def _history() -> pd.DataFrame:
    rows = []
    for pid, team in ((1, 1), (2, 2)):
        for gw in range(20, 25):
            rows.append({"player_id": pid, "gw": gw, "fixture_id": gw * 10 + pid,
                         "position": "MID", "team_id": team,
                         "opponent_team": 3 - team, "was_home": gw % 2 == 0,
                         "minutes": 90, "starts": 1, "total_points": 5,
                         "expected_goals": 0.3, "expected_assists": 0.2,
                         "saves": 0, "yellow_cards": 0, "red_cards": 0,
                         "own_goals": 0, "penalties_missed": 0,
                         "penalties_saved": 0, "bonus": 0,
                         "defensive_contribution": 0, "goals_scored": 0,
                         "assists": 0, "clean_sheets": 0, "goals_conceded": 1})
    return pd.DataFrame(rows)


@pytest.fixture
def wired(monkeypatch):
    """Patch every DB touchpoint; capture upserts."""
    calls = {"upserts": []}
    monkeypatch.setattr(serve_v3, "load_fixtures", lambda url: _fixtures(False))
    monkeypatch.setattr(serve_v3, "load_history",
                        lambda database_url=None, season=None: _history())
    monkeypatch.setattr(serve_v3, "upsert_rows",
                        lambda url, table, rows: calls["upserts"].append((table, rows)) or len(rows))
    return calls


def test_main_serves_and_upserts(wired, capsys):
    rc = main(["--n-sims", "200"])
    assert rc == 0
    assert len(wired["upserts"]) == 1
    table, rows = wired["upserts"][0]
    assert table == "projections_shadow"
    assert len(rows) > 0 and {"p25", "p50", "p75", "mean"} <= set(rows.columns)
    out = capsys.readouterr().out
    assert "[serve-v31]" in out and "gws=[25, 26, 27]" in out


def test_main_offseason_noop(wired, monkeypatch, capsys):
    monkeypatch.setattr(serve_v3, "load_fixtures", lambda url: _fixtures(True))
    rc = main([])
    assert rc == 0 and not wired["upserts"]
    assert "skipped: no unfinished fixtures" in capsys.readouterr().out


def test_main_pregw1_noop(wired, monkeypatch, capsys):
    monkeypatch.setattr(serve_v3, "load_history",
                        lambda database_url=None, season=None: _history().iloc[0:0])
    rc = main([])
    assert rc == 0 and not wired["upserts"]
    assert "skipped: no" in capsys.readouterr().out


def test_main_dry_run_writes_nothing(wired, capsys):
    rc = main(["--dry-run", "--n-sims", "200"])
    assert rc == 0 and not wired["upserts"]
    assert "DRY RUN" in capsys.readouterr().out


def test_main_as_of_filters_history(wired, monkeypatch):
    seen = {}
    real = _history()

    def fake_load(database_url=None, season=None):
        return real

    monkeypatch.setattr(serve_v3, "load_history", fake_load)
    monkeypatch.setattr(serve_v3, "load_fixtures", lambda url: _fixtures(True))
    orig = serve_v3.serve_rows

    def spy(history, fixtures, target_gws, **kw):
        seen["max_gw"] = int(history["gw"].max())
        return orig(history, fixtures, target_gws, **kw)

    monkeypatch.setattr(serve_v3, "serve_rows", spy)
    rc = main(["--as-of-gw", "23", "--dry-run", "--n-sims", "100"])
    assert rc == 0
    assert seen["max_gw"] == 22   # gw >= 23 filtered out of every component


def test_main_rejects_bad_table_env(monkeypatch):
    monkeypatch.setenv("XPTS_SERVE_TABLE", "not_a_table")
    with pytest.raises(ValueError, match="XPTS_SERVE_TABLE"):
        main([])
