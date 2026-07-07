# xPts Serving Revival (#128/#130) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the A→C shadow serving for the frozen v3.1 candidate (GitHub Actions nightly Python batch → `projections_shadow`) plus the #130 prospective eval script and promotion runbook.

**Architecture:** A pure pipeline module (`model/serving.py`) composes the frozen model modules (rates/simulator/minutes/engine/assist-scale) with per-target seeding; a thin CLI (`model/serve_v3.py`) owns DB I/O and no-op guards; a new `projections_shadow` migration and a scheduled workflow run it nightly. The eval (`model/eval_prospective.py`) is on-demand and read-only, splitting rows strictly by `model_version`. A parity test proves the serve orchestration reproduces the gate-validated walk-forward's simulate-inputs exactly on 2025/26 GW30.

**Tech Stack:** Python 3.12 (venv `model/.venv`), pandas/numpy/psycopg, pytest; one SQL migration; one GitHub Actions workflow. Spec: `docs/superpowers/specs/2026-07-07-xpts-serving-revival-design.md`.

## Global Constraints

- **The served candidate is the frozen registered v3.1 configuration** (spec §2): compose `rates_v3.py`, `simulate_v3.py`, `minutes_model.py`, `match_engine.py`, `assist_scale.py`, `points_rules.py` — NEVER reimplement or modify them. The assist multiplier applies via the non-mutating spread `{**player, "rates": {**player["rates"], "xa90": player["rates"]["xa90"] * k_assist}}`. `N_SIMS = 8000` default; per-target RNG `np.random.default_rng((V3_SEED_BASE, gw, player_id, fixture_id))`.
- **Frozen/untouched:** every existing `model/*.py` module, everything under `supabase/functions/`, everything under `src/`, all committed artifacts. Files this plan may create/modify: `model/serving.py`, `model/serve_v3.py`, `model/eval_prospective.py`, `model/tests/test_serving.py`, `model/tests/test_serve_v3.py`, `model/tests/test_serve_parity.py`, `model/tests/test_eval_prospective.py`, `supabase/migrations/20260707130000_projections_shadow.sql`, `.github/workflows/xpts-serve.yml`, `docs/xpts-prospective.md`. Nothing else.
- **Never run `backtest_v2.py`, `backtest_v21.py`, `backtest_aug.py`, `backtest_v3.py`, or `backtest_v31.py` as `__main__`** (report writers truncate `docs/xpts-model.md`; `backtest_v31` `__main__` starts a 50-minute job).
- **Table allowlist:** the serve writer validates its target table against `("projections_shadow", "projections")` before building any SQL; depth columns (`mean, p_goal, p_assist, p_cs, p_haul, p60`) are written **iff** the target is `projections_shadow`.
- **Eval attribution is by `model_version`, never table identity** (spec §7): union both projection tables, split `'v3.1'` vs `like 'v1%'`; rows valid iff `computed_at ≥ July 1 of the season's start year`. `model_version` for the serve writer = `MODEL_VERSION_V31` imported from `backtest_v31` (`"v3.1"`).
- **Season boundary is August** (port of `currentSeasonLabel` in `supabase/functions/fpl-ingest/lib/calendar.ts`): before August the season started the prior calendar year.
- **Environment:** pytest via `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest <target> -q`. Always absolute paths. Baseline before this plan: 158 tests passing.
- **Branch:** all commits on `feat/xpts-serving-revival` (exists, checked out; verify with `git branch --show-current`).

---

### Task 1: `model/serving.py` part 1 — season label, targets, serve-mode minutes

**Files:**
- Create: `model/serving.py`
- Test: `model/tests/test_serving.py`

**Interfaces:**
- Consumes: `minutes_model.{build_minutes_feature_row, build_minutes_samples, fit_minutes_models, predict_minutes, _fallback_rates, _rate_models}` (existing, frozen).
- Produces (Task 2 extends this same module; Task 3/4 import from it): `SERVE_GW_WINDOW = 3`; `season_label_for(kickoff) -> str`; `select_target_gws(fixtures: pd.DataFrame, as_of_gw: int | None = None, n: int = SERVE_GW_WINDOW) -> list[int]`; `latest_player_state(history) -> pd.DataFrame` (columns `player_id, team_id, position`); `build_targets(fixtures, latest, target_gws) -> pd.DataFrame` (columns `player_id, gw, fixture_id, position, team_id, opponent_team, was_home`); `fit_serve_minutes(history) -> dict`; `serve_minutes_predictions(history, models) -> dict[int, tuple[float, float]]`.
- The `fixtures` frame everywhere in this plan has columns `id, event, kickoff_time, team_h, team_a, finished` (the `public.fixtures` shape).

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_serving.py`:

```python
"""serving.py part-1 tests: season boundary, target-GW selection (production
vs --as-of-gw), latest-player-state, target enumeration, and the serve-mode
minutes composition (fit-once + predict-per-player + zero-sample fallback)."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from serving import (SERVE_GW_WINDOW, build_targets, fit_serve_minutes,
                     latest_player_state, season_label_for, select_target_gws,
                     serve_minutes_predictions)


def _fx(id, event, finished, kickoff="2026-08-15T14:00:00Z", h=1, a=2):
    return {"id": id, "event": event, "kickoff_time": pd.Timestamp(kickoff),
            "team_h": h, "team_a": a, "finished": finished}


def test_season_label_august_boundary():
    assert season_label_for(datetime(2026, 8, 15, tzinfo=timezone.utc)) == "2026/27"
    assert season_label_for(datetime(2026, 7, 31, tzinfo=timezone.utc)) == "2025/26"
    assert season_label_for(datetime(2027, 3, 1, tzinfo=timezone.utc)) == "2026/27"
    assert season_label_for(pd.Timestamp("2026-02-20T15:00:00Z")) == "2025/26"


def test_select_target_gws_production_mode():
    fixtures = pd.DataFrame([
        _fx(1, 1, True), _fx(2, 2, False), _fx(3, 2, False),
        _fx(4, 3, False), _fx(5, 4, False), _fx(6, 5, False),
    ])
    assert select_target_gws(fixtures) == [2, 3, 4]


def test_select_target_gws_offseason_empty():
    fixtures = pd.DataFrame([_fx(1, 1, True), _fx(2, 2, True)])
    assert select_target_gws(fixtures) == []


def test_select_target_gws_ignores_null_event():
    fixtures = pd.DataFrame([_fx(1, None, False), _fx(2, 7, False)])
    assert select_target_gws(fixtures) == [7]


def test_select_target_gws_as_of_ignores_finished():
    fixtures = pd.DataFrame([_fx(i, gw, True) for i, gw in
                             enumerate([28, 29, 30, 31, 32, 33], start=1)])
    assert select_target_gws(fixtures, as_of_gw=30) == [30, 31, 32]


def _hist_row(pid, gw, team, pos="MID", minutes=90, fixture_id=None):
    return {"player_id": pid, "gw": gw, "fixture_id": fixture_id or gw * 100 + pid,
            "position": pos, "team_id": team, "opponent_team": 9,
            "was_home": True, "minutes": minutes,
            "starts": 1 if minutes >= 60 else 0}


def test_latest_player_state_takes_most_recent_row():
    hist = pd.DataFrame([
        _hist_row(1, 1, team=5, pos="MID"),
        _hist_row(1, 8, team=7, pos="FWD"),   # transferred + reclassified
        _hist_row(2, 3, team=5, pos="DEF"),
    ])
    latest = latest_player_state(hist).set_index("player_id")
    assert latest.loc[1, "team_id"] == 7 and latest.loc[1, "position"] == "FWD"
    assert latest.loc[2, "team_id"] == 5


def test_build_targets_enumerates_both_sides_dgw_and_blank():
    fixtures = pd.DataFrame([
        _fx(900, 10, False, h=5, a=7),
        _fx(901, 10, False, h=7, a=8),   # team 7 doubles in GW 10
        _fx(902, 11, False, h=5, a=8),   # team 7 blanks in GW 11
    ])
    latest = pd.DataFrame([
        {"player_id": 1, "team_id": 5, "position": "MID"},
        {"player_id": 2, "team_id": 7, "position": "FWD"},
    ])
    t = build_targets(fixtures, latest, [10, 11])
    p2 = t[t["player_id"] == 2]
    assert list(p2["fixture_id"]) == [900, 901]        # DGW: two targets in GW 10
    assert (p2["gw"] == 10).all()                       # blank: none in GW 11
    p1_900 = t[(t["player_id"] == 1) & (t["fixture_id"] == 900)].iloc[0]
    assert p1_900["was_home"] and p1_900["opponent_team"] == 7
    p2_900 = t[(t["player_id"] == 2) & (t["fixture_id"] == 900)].iloc[0]
    assert not p2_900["was_home"] and p2_900["opponent_team"] == 5
    assert list(t.columns) == ["player_id", "gw", "fixture_id", "position",
                               "team_id", "opponent_team", "was_home"]


def test_build_targets_empty_when_no_players():
    fixtures = pd.DataFrame([_fx(900, 10, False, h=5, a=7)])
    latest = pd.DataFrame([{"player_id": 1, "team_id": 3, "position": "MID"}])
    t = build_targets(fixtures, latest, [10])
    assert len(t) == 0 and "player_id" in t.columns


def test_serve_minutes_matches_precompute_at_step(synthetic_history):
    """The serve-mode composition must reproduce precompute_minutes_predictions'
    step-t behavior when history is pre-filtered to gw < t (spec §2)."""
    from minutes_model import precompute_minutes_predictions
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    ref = precompute_minutes_predictions(synthetic_history)
    ref_t = ref[ref["gw"] == t].set_index("player_id")
    for pid, (p_play, p60) in preds.items():
        if pid in ref_t.index:
            assert p_play == pytest.approx(ref_t.loc[pid, "p_play"], rel=1e-12)
            assert p60 == pytest.approx(ref_t.loc[pid, "p60"], rel=1e-12)
    assert set(ref_t.index) <= set(preds.keys())


def test_serve_minutes_zero_sample_fallback():
    # Single-GW history -> zero training samples -> rate-model fallback.
    hist = pd.DataFrame([_hist_row(1, 1, team=5), _hist_row(2, 1, team=5, minutes=0)])
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    assert set(preds.keys()) == {1, 2}
    for p_play, p60 in preds.values():
        assert 0.0 < p_play < 1.0 and 0.0 < p60 <= p_play
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serving.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'serving'`

- [ ] **Step 3: Write the implementation**

Create `model/serving.py`:

```python
"""Pure serving pipeline for the v3.1 candidate (#128, spec §2–§3). No I/O —
serve_v3.py owns the DB; everything here is pandas-in/pandas-out so the unit
suite and the §5 parity guard drive it directly. Composes the frozen model
modules (rates_v3 / simulate_v3 / minutes_model / match_engine / assist_scale);
never reimplements them."""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from assist_scale import compute_assist_scale
from feature_spec_v3 import N_SIMS, V3_SEED_BASE
from match_engine import MatchEngine, build_team_fixtures
from minutes_model import (_fallback_rates, _rate_models,
                           build_minutes_feature_row, build_minutes_samples,
                           fit_minutes_models, predict_minutes)
from rates_v3 import build_player_rates, position_rate_priors
from simulate_v3 import simulate_player_fixture, summarize_draws

SERVE_GW_WINDOW = 3
_SIM_KEYS = ("total", "goals", "assists", "cs")


def season_label_for(kickoff: datetime) -> str:
    """Python port of the Deno currentSeasonLabel (calendar.ts): before August
    the season started the prior calendar year. E.g. 2026-09 -> '2026/27'."""
    start = kickoff.year if kickoff.month >= 8 else kickoff.year - 1
    return f"{start}/{(start + 1) % 100:02d}"


def select_target_gws(fixtures: pd.DataFrame, as_of_gw: int | None = None,
                      n: int = SERVE_GW_WINDOW) -> list[int]:
    """Next n distinct GWs. Production (as_of_gw None): events with >= 1
    unfinished fixture. --as-of-gw t: events >= t regardless of `finished`
    (historical DBs have everything finished)."""
    f = fixtures[fixtures["event"].notna()]
    if as_of_gw is None:
        f = f[~f["finished"].astype(bool)]
    else:
        f = f[f["event"] >= as_of_gw]
    gws = sorted(int(e) for e in f["event"].unique())
    return gws[:n]


def latest_player_state(history: pd.DataFrame) -> pd.DataFrame:
    """One row per player: team_id + position from his most recent history row
    (mid-season transfers ~ last-played-for club — spec §3 approximation)."""
    latest = (history.sort_values(["gw", "fixture_id"])
              .groupby("player_id", as_index=False).last())
    return latest[["player_id", "team_id", "position"]]


def build_targets(fixtures: pd.DataFrame, latest: pd.DataFrame,
                  target_gws: list[int]) -> pd.DataFrame:
    """(player, fixture) targets: every known player whose team plays in a
    target GW. DGW -> multiple rows per (player, gw); blank -> none."""
    cols = ["player_id", "gw", "fixture_id", "position", "team_id",
            "opponent_team", "was_home"]
    rows: list[dict] = []
    fx = fixtures[fixtures["event"].isin(target_gws)]
    for _, f in fx.iterrows():
        for team, opp, home in ((int(f["team_h"]), int(f["team_a"]), True),
                                (int(f["team_a"]), int(f["team_h"]), False)):
            for _, p in latest[latest["team_id"] == team].iterrows():
                rows.append({"player_id": int(p["player_id"]),
                             "gw": int(f["event"]), "fixture_id": int(f["id"]),
                             "position": p["position"], "team_id": team,
                             "opponent_team": opp, "was_home": home})
    if not rows:
        return pd.DataFrame(columns=cols)
    return (pd.DataFrame(rows, columns=cols)
            .sort_values(["gw", "player_id", "fixture_id"])
            .reset_index(drop=True))


def fit_serve_minutes(history: pd.DataFrame) -> dict:
    """Serve-mode minutes fit: one hurdle fit on ALL (strictly prior) history —
    exactly precompute_minutes_predictions' step-t branch when history is
    pre-filtered to gw < t (a sample's features are built from gw < its target,
    so the two formulations see identical data)."""
    samples = build_minutes_samples(history)
    if len(samples):
        return fit_minutes_models(samples)
    return _rate_models(*_fallback_rates(history))


def serve_minutes_predictions(history: pd.DataFrame,
                              models: dict) -> dict[int, tuple[float, float]]:
    """(p_play, p60) once per player with >= 1 history row; reused for every
    target GW (the features cannot change before new data arrives)."""
    out: dict[int, tuple[float, float]] = {}
    for pid, rows in history.groupby("player_id"):
        feat = build_minutes_feature_row(rows)
        pos = rows.sort_values(["gw", "fixture_id"]).iloc[-1]["position"]
        out[int(pid)] = predict_minutes(models, feat, pos)
    return out
```

(`np`, `compute_assist_scale`, `MatchEngine`, `build_player_rates`, `position_rate_priors`, `simulate_player_fixture`, `summarize_draws`, `N_SIMS`, `V3_SEED_BASE`, `_SIM_KEYS` are imported/defined now because Task 2 extends this same module — a linter may flag them unused until then; leave them.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serving.py -q`
Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/serving.py model/tests/test_serving.py
git commit -m "feat(model): serving core part 1 — season label, targets, serve-mode minutes (#128)"
```

---

### Task 2: `model/serving.py` part 2 — sim inputs, per-target simulation, pipeline

**Files:**
- Modify: `model/serving.py` (append three functions)
- Test: `model/tests/test_serving.py` (append tests)

**Interfaces:**
- Consumes: Task 1's functions; frozen modules per Global Constraints.
- Produces (Tasks 3/4 rely on these):
  `build_sim_inputs(history, targets, minutes_preds, priors, engine, k_assist, before_gw) -> list[dict]` — each dict has keys `player_id, gw, fixture_id, position, p_play, p60, player, lam_against, m_att, m_sav` (`player` = the assist-scaled `build_player_rates` output; this list is the §5 parity surface);
  `simulate_serve(inputs, n_sims=N_SIMS) -> pd.DataFrame` with columns `player_id, gw, p25, p50, p75, mean, p_goal, p_assist, p_cs, p_haul, p60` (rounded 1/2/3 dp per spec §4);
  `serve_rows(history, fixtures, target_gws, n_sims=N_SIMS) -> tuple[pd.DataFrame, dict]` (info keys `target_gws, k_assist, n_targets, n_rows`).

- [ ] **Step 1: Write the failing tests**

Append to `model/tests/test_serving.py`:

```python
def _future_fixtures_from_history(history: pd.DataFrame, gws: list[int]) -> pd.DataFrame:
    """Reconstruct a fixtures frame for the synthetic season's rows at `gws`
    (one row per fixture_id, sides from the was_home flag)."""
    rows = {}
    for _, r in history[history["gw"].isin(gws)].iterrows():
        fid = int(r["fixture_id"])
        if fid in rows:
            continue
        h = int(r["team_id"]) if r["was_home"] else int(r["opponent_team"])
        a = int(r["opponent_team"]) if r["was_home"] else int(r["team_id"])
        rows[fid] = {"id": fid, "event": int(r["gw"]),
                     "kickoff_time": pd.Timestamp("2026-02-01T15:00:00Z"),
                     "team_h": h, "team_a": a, "finished": False}
    return pd.DataFrame(list(rows.values()))


def _t25_setup(synthetic_history, gws):
    """Shared part-2 scaffolding: prior history, reconstructed fixtures, and
    the fitted run-level components at t = 25."""
    from assist_scale import compute_assist_scale
    from match_engine import MatchEngine, build_team_fixtures
    from rates_v3 import position_rate_priors
    from serving import build_sim_inputs

    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    priors = position_rate_priors(hist)
    k = compute_assist_scale(hist)
    engine = MatchEngine(build_team_fixtures(hist))
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    latest = latest_player_state(hist)
    fixtures = _future_fixtures_from_history(synthetic_history, gws)
    targets = build_targets(fixtures, latest, gws)
    inputs = build_sim_inputs(hist, targets, preds, priors, engine, k,
                              before_gw=t)
    return {"hist": hist, "fixtures": fixtures, "k": k, "priors": priors,
            "preds": preds, "inputs": inputs}


def test_build_sim_inputs_matches_walk_forward_semantics(synthetic_history):
    """Inputs must be computed exactly the way walk_forward_v3 computes them
    (same rate build, same non-mutating scaled copy, same minutes source)."""
    from rates_v3 import build_player_rates

    s = _t25_setup(synthetic_history, [25])
    inputs = s["inputs"]
    assert len(inputs) > 0
    by_key = {(i["player_id"], i["fixture_id"]): i for i in inputs}
    key = sorted(by_key)[0]
    i = by_key[key]
    prior = s["hist"][s["hist"]["player_id"] == key[0]]
    raw = build_player_rates(prior, i["position"], s["priors"])
    assert i["player"]["rates"]["xa90"] == pytest.approx(
        raw["rates"]["xa90"] * s["k"])
    assert i["player"]["rates"]["xg90"] == pytest.approx(raw["rates"]["xg90"])
    # non-mutation: a fresh build still yields the unscaled rate
    assert raw["rates"]["xa90"] == pytest.approx(
        build_player_rates(prior, i["position"], s["priors"])["rates"]["xa90"])
    assert (i["p_play"], i["p60"]) == s["preds"][key[0]]
    assert i["m_att"] > 0 and i["m_sav"] > 0 and i["lam_against"] >= 0


def test_simulate_serve_row_shape_and_determinism(synthetic_history):
    from serving import serve_rows
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    fixtures = _future_fixtures_from_history(synthetic_history, [25, 26, 27])
    a, info_a = serve_rows(hist, fixtures, [25, 26, 27], n_sims=300)
    b, _ = serve_rows(hist, fixtures, [25, 26, 27], n_sims=300)
    pd.testing.assert_frame_equal(a, b)  # per-target seeding is deterministic
    need = {"player_id", "gw", "p25", "p50", "p75", "mean",
            "p_goal", "p_assist", "p_cs", "p_haul", "p60"}
    assert need <= set(a.columns)
    assert len(a) > 0 and info_a["n_rows"] == len(a)
    assert (a["p25"] <= a["p50"]).all() and (a["p50"] <= a["p75"]).all()
    for col, dp in (("p25", 1), ("mean", 2), ("p_goal", 3)):
        assert (a[col] == a[col].round(dp)).all()
    assert a["p60"].between(0, 1).all()


def test_simulate_serve_per_target_seed_isolation(synthetic_history):
    """Removing one player's TARGETS must not change any other player's row
    (the spec §2 rationale for per-target seeding). Operates on the inputs
    list so run-level components (k_assist, priors, minutes) are held fixed —
    dropping history rows would legitimately change those for everyone."""
    from serving import simulate_serve

    s = _t25_setup(synthetic_history, [25])
    inputs = s["inputs"]
    drop_pid = inputs[0]["player_id"]
    kept = [i for i in inputs if i["player_id"] != drop_pid]
    assert len(kept) < len(inputs)
    full = simulate_serve(inputs, n_sims=300)
    reduced = simulate_serve(kept, n_sims=300)
    merged = full[full["player_id"] != drop_pid].merge(
        reduced, on=["player_id", "gw"], suffixes=("_a", "_b"))
    assert len(merged) == len(reduced)
    for c in ("p50", "mean", "p_goal", "p_assist"):
        assert (merged[f"{c}_a"] == merged[f"{c}_b"]).all()


def test_simulate_serve_dgw_sums_draws(synthetic_history):
    from serving import serve_rows
    t = 25
    hist = synthetic_history[synthetic_history["gw"] < t]
    single = _future_fixtures_from_history(synthetic_history, [25])
    # duplicate player 1's fixture as a second GW-25 fixture (DGW)
    row = single[single["team_h"].eq(hist[hist["player_id"] == 1]["team_id"].iloc[-1])
                 | single["team_a"].eq(hist[hist["player_id"] == 1]["team_id"].iloc[-1])].iloc[0]
    extra = row.copy(); extra["id"] = 9999
    dgw = pd.concat([single, extra.to_frame().T], ignore_index=True)
    a, _ = serve_rows(hist, single, [25], n_sims=300)
    b, _ = serve_rows(hist, dgw, [25], n_sims=300)
    pa = a[a["player_id"] == 1]["mean"].iloc[0]
    pb = b[b["player_id"] == 1]["mean"].iloc[0]
    assert len(b[b["player_id"] == 1]) == 1   # one row per (player, gw)
    assert pb > pa                            # a double projects more than a single
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serving.py -q`
Expected: FAIL — `ImportError: cannot import name 'build_sim_inputs' from 'serving'` (and `serve_rows`)

- [ ] **Step 3: Write the implementation**

Append to `model/serving.py`:

```python
def build_sim_inputs(history: pd.DataFrame, targets: pd.DataFrame,
                     minutes_preds: dict, priors: dict, engine: MatchEngine,
                     k_assist: float, before_gw: int) -> list[dict]:
    """Per-target simulate_player_fixture inputs — deterministic and
    set-independent (the §5 parity surface). Mirrors walk_forward_v3's
    per-target computation line for line; skips players with no minutes
    prediction (zero history rows)."""
    inputs: list[dict] = []
    for _, t in targets.iterrows():
        pid = int(t["player_id"])
        if pid not in minutes_preds:
            continue
        prior = history[history["player_id"] == pid]
        p_play, p60 = minutes_preds[pid]
        pos = t["position"]
        team, opp = int(t["team_id"]), int(t["opponent_team"])
        was_home = bool(t["was_home"])
        lam_for, lam_against = engine.lambdas(team, opp, was_home,
                                              before_gw=before_gw)
        venue = "home" if was_home else "away"
        att = engine.rating(team, venue, "att", before_gw=before_gw)
        m_att = lam_for / att if att > 0 else 1.0
        ov = "away" if was_home else "home"
        l_ov = engine.league_baseline(ov, before_gw=before_gw)
        m_sav = lam_against / l_ov if l_ov > 0 else 1.0
        player = build_player_rates(prior, pos, priors)
        player = {**player, "rates": {**player["rates"],
                                      "xa90": player["rates"]["xa90"] * k_assist}}
        inputs.append({"player_id": pid, "gw": int(t["gw"]),
                       "fixture_id": int(t["fixture_id"]), "position": pos,
                       "p_play": p_play, "p60": p60, "player": player,
                       "lam_against": lam_against, "m_att": m_att,
                       "m_sav": m_sav})
    return inputs


def simulate_serve(inputs: list[dict], n_sims: int = N_SIMS) -> pd.DataFrame:
    """Simulate every target with a per-target seeded rng (spec §2 — one
    player entering/leaving the set cannot shift another's draws), sum DGW
    draw arrays elementwise per (player, gw), summarize + round to the
    projections_shadow column scales."""
    acc: dict[tuple[int, int], dict] = {}
    for t in inputs:
        rng = np.random.default_rng((V3_SEED_BASE, t["gw"], t["player_id"],
                                     t["fixture_id"]))
        sim = simulate_player_fixture(rng, t["position"], t["p_play"], t["p60"],
                                      t["player"], t["lam_against"], t["m_att"],
                                      t["m_sav"], n=n_sims)
        key = (t["player_id"], t["gw"])
        if key in acc:
            for k in _SIM_KEYS:
                acc[key][k] = acc[key][k] + sim[k]
        else:
            acc[key] = {k: sim[k] for k in _SIM_KEYS}
            acc[key]["position"] = t["position"]
            acc[key]["p60"] = t["p60"]
    rows = []
    for (pid, gw), arrs in acc.items():
        s = summarize_draws(arrs, arrs["position"])
        rows.append({"player_id": pid, "gw": gw,
                     "p25": round(s["p25_v3"], 1), "p50": round(s["p50_v3"], 1),
                     "p75": round(s["p75_v3"], 1), "mean": round(s["mean_v3"], 2),
                     "p_goal": round(s["p_goal"], 3),
                     "p_assist": round(s["p_assist"], 3),
                     "p_cs": round(s["p_cs_pts"], 3),
                     "p_haul": round(s["p_haul"], 3),
                     "p60": round(arrs["p60"], 3)})
    if not rows:
        return pd.DataFrame(columns=["player_id", "gw", "p25", "p50", "p75",
                                     "mean", "p_goal", "p_assist", "p_cs",
                                     "p_haul", "p60"])
    return (pd.DataFrame(rows).sort_values(["gw", "player_id"])
            .reset_index(drop=True))


def serve_rows(history: pd.DataFrame, fixtures: pd.DataFrame,
               target_gws: list[int],
               n_sims: int = N_SIMS) -> tuple[pd.DataFrame, dict]:
    """The full pure pipeline for pre-selected target GWs. Callers guarantee
    history is non-empty and strictly prior to every target GW."""
    before_gw = min(target_gws)
    priors = position_rate_priors(history)
    k_assist = compute_assist_scale(history)
    engine = MatchEngine(build_team_fixtures(history))
    models = fit_serve_minutes(history)
    minutes_preds = serve_minutes_predictions(history, models)
    latest = latest_player_state(history)
    targets = build_targets(fixtures, latest, target_gws)
    inputs = build_sim_inputs(history, targets, minutes_preds, priors, engine,
                              k_assist, before_gw)
    rows = simulate_serve(inputs, n_sims=n_sims)
    info = {"target_gws": target_gws, "k_assist": float(k_assist),
            "n_targets": len(inputs), "n_rows": len(rows)}
    return rows, info
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serving.py -q`
Expected: `14 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/serving.py model/tests/test_serving.py
git commit -m "feat(model): serving core part 2 — sim inputs, per-target seeding, pipeline (#128)"
```

---

### Task 3: migration + `model/serve_v3.py` CLI/I-O

**Files:**
- Create: `supabase/migrations/20260707130000_projections_shadow.sql`
- Create: `model/serve_v3.py`
- Test: `model/tests/test_serve_v3.py`

**Interfaces:**
- Consumes: `serving.{season_label_for, select_target_gws, serve_rows}`; `data.{DEFAULT_DATABASE_URL, load_history}`; `backtest_v31.MODEL_VERSION_V31`.
- Produces: the CLI `python serve_v3.py [--season S] [--as-of-gw N] [--dry-run] [--n-sims N]`; `build_upsert_sql(table, include_depth) -> str`; `upsert_rows(url, table, rows) -> int`; `load_fixtures(url) -> pd.DataFrame`; `main(argv=None) -> int`. Task 4's parity test and the workflow invoke this CLI.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707130000_projections_shadow.sql`:

```sql
-- #128: shadow-serving target for the v3.1 candidate
-- (spec docs/superpowers/specs/2026-07-07-xpts-serving-revival-design.md §4).
-- Mirrors public.projections (the frozen client contract) plus nullable depth
-- columns unique to the simulator. NO FK on player_id: FPL element ids are
-- season-scoped and the shadow writer must not depend on the players table.
-- RLS enabled with NO policies: service-role only — client exposure of depth
-- data is a separate post-promotion product decision.

create table public.projections_shadow (
  player_id      integer  not null,
  gw             smallint not null,
  p25            numeric(4,1) not null,
  p50            numeric(4,1) not null,
  p75            numeric(4,1) not null,
  model_version  text     not null,
  computed_at    timestamptz not null default now(),
  mean           numeric(5,2),
  p_goal         numeric(4,3),
  p_assist       numeric(4,3),
  p_cs           numeric(4,3),
  p_haul         numeric(4,3),
  p60            numeric(4,3),
  primary key (player_id, gw)
);

alter table public.projections_shadow enable row level security;

create index projections_shadow_gw_idx on public.projections_shadow (gw);
```

- [ ] **Step 2: Apply the migration locally to verify it is valid SQL**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app && docker exec -i supabase_db_fantasy-gaffer psql -U postgres < supabase/migrations/20260707130000_projections_shadow.sql`
Expected: `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX` (no errors). (CI applies it to prod on merge via `supabase db push`; local apply doubles as validation and enables Task 4's live checks.)

- [ ] **Step 3: Write the failing tests**

Create `model/tests/test_serve_v3.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serve_v3.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'serve_v3'`

- [ ] **Step 5: Write the implementation**

Create `model/serve_v3.py`:

```python
"""#128 serving entry point: Postgres in, projections_shadow out. Thin I/O
around model/serving.py; run nightly by .github/workflows/xpts-serve.yml.
DB-only by design — zero FPL API calls (spec §3).

Usage: python serve_v3.py [--season 2025/26] [--as-of-gw 30] [--dry-run]
                          [--n-sims 8000]
Env:   DATABASE_URL (falls back to the local stack), XPTS_SERVE_TABLE
       (default projections_shadow; allowlisted)."""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd
import psycopg

from backtest_v31 import MODEL_VERSION_V31
from data import DEFAULT_DATABASE_URL, load_history
from serving import season_label_for, select_target_gws, serve_rows

ALLOWED_TABLES = ("projections_shadow", "projections")
CONTRACT_COLUMNS = ["player_id", "gw", "p25", "p50", "p75"]
DEPTH_COLUMNS = ["mean", "p_goal", "p_assist", "p_cs", "p_haul", "p60"]


def load_fixtures(url: str) -> pd.DataFrame:
    with psycopg.connect(url) as conn:
        return pd.read_sql(
            "select id, event, kickoff_time, team_h, team_a, finished "
            "from public.fixtures", conn)


def build_upsert_sql(table: str, include_depth: bool) -> str:
    if table not in ALLOWED_TABLES:
        raise ValueError(
            f"XPTS_SERVE_TABLE must be one of {ALLOWED_TABLES}, got {table!r}")
    cols = CONTRACT_COLUMNS + ["model_version"] + (DEPTH_COLUMNS if include_depth else [])
    col_list = ", ".join(cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols
                        if c not in ("player_id", "gw"))
    return (f"insert into public.{table} ({col_list}, computed_at) "
            f"values ({placeholders}, now()) "
            f"on conflict (player_id, gw) do update set {updates}, "
            f"computed_at = now()")


def upsert_rows(url: str, table: str, rows: pd.DataFrame) -> int:
    include_depth = table == "projections_shadow"
    sql = build_upsert_sql(table, include_depth)
    cols = CONTRACT_COLUMNS + (DEPTH_COLUMNS if include_depth else [])
    params = []
    for _, r in rows.iterrows():
        p = {c: (int(r[c]) if c in ("player_id", "gw") else float(r[c]))
             for c in cols}
        p["model_version"] = MODEL_VERSION_V31
        params.append(p)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(params)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Serve v3.1 projections")
    ap.add_argument("--season", default=None,
                    help="override the kickoff-derived season label")
    ap.add_argument("--as-of-gw", type=int, default=None,
                    help="historical mode: history filtered to gw < N, "
                         "targets = GWs >= N (spec §3 CLI)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--n-sims", type=int, default=None)
    args = ap.parse_args(argv)

    url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    table = os.environ.get("XPTS_SERVE_TABLE", "projections_shadow")
    build_upsert_sql(table, table == "projections_shadow")  # fail fast on a bad name

    fixtures = load_fixtures(url)
    target_gws = select_target_gws(fixtures, as_of_gw=args.as_of_gw)
    if not target_gws:
        print("[serve-v31] skipped: no unfinished fixtures (off-season)")
        return 0
    first_kick = (fixtures[fixtures["event"].isin(target_gws)]["kickoff_time"]
                  .dropna().min())
    season = args.season or season_label_for(first_kick)
    history = load_history(database_url=url, season=season)
    if args.as_of_gw is not None:
        history = history[history["gw"] < args.as_of_gw]
    if len(history) == 0:
        print(f"[serve-v31] skipped: no {season} history yet (pre-GW1)")
        return 0

    kwargs = {} if args.n_sims is None else {"n_sims": args.n_sims}
    rows, info = serve_rows(history, fixtures, target_gws, **kwargs)
    if args.dry_run:
        print(rows.head(10).to_string())
        print(f"[serve-v31] DRY RUN season={season} gws={info['target_gws']} "
              f"k={info['k_assist']:.4f} targets={info['n_targets']} "
              f"rows={info['n_rows']}")
        return 0
    n = upsert_rows(url, table, rows)
    print(f"[serve-v31] season={season} gws={info['target_gws']} "
          f"k={info['k_assist']:.4f} targets={info['n_targets']} rows={n} "
          f"table={table}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serve_v3.py -q`
Expected: `8 passed`

- [ ] **Step 7: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add supabase/migrations/20260707130000_projections_shadow.sql model/serve_v3.py model/tests/test_serve_v3.py
git commit -m "feat(model): projections_shadow migration + serve_v3 CLI with allowlisted upsert (#128)"
```

---

### Task 4: workflow + the §5 parity guard

**Files:**
- Create: `.github/workflows/xpts-serve.yml`
- Test: `model/tests/test_serve_parity.py`

**Interfaces:**
- Consumes: the serve CLI and `serving.py` pipeline (Tasks 1–3); `backtest_v3.walk_forward_v3` (frozen); the local snapshot-restored 2025/26 DB.
- Produces: nothing downstream — this is the validation task. The parity test is env-gated: it runs ONLY when `XPTS_PARITY=1` is set (a live run takes several minutes — the walk-forward's minutes precompute plus a v1 fit); when the env var is set but the DB is unreachable it must FAIL loudly, not skip.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/xpts-serve.yml`:

```yaml
# #128: nightly v3.1 shadow serving (spec §6). 04:30 UTC — after the 03:00
# bootstrap, 03:30 history, and 04:00 fpl-project (v1) crons, so both models
# project the same night on the same data. Promotion (#130 runbook) flips
# XPTS_SERVE_TABLE to `projections` in ONE line here.
name: xpts-serve

on:
  schedule:
    - cron: '30 4 * * *'
  workflow_dispatch:

concurrency:
  group: xpts-serve

jobs:
  serve:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: model/requirements.txt
      - run: pip install -r model/requirements.txt
      - run: python model/serve_v3.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          XPTS_SERVE_TABLE: projections_shadow
```

- [ ] **Step 2: Write the parity test**

Create `model/tests/test_serve_parity.py`:

```python
"""§5 serve-path skew guard — env-gated (XPTS_PARITY=1). Proves the serve
orchestration reproduces the gate-validated walk_forward_v3's per-target
simulate inputs EXACTLY on 2025/26 GW30 against the local snapshot-restored
DB. Input-parity, not draw-parity: the backtest shares one RNG stream per GW,
so set differences would shift draws spuriously; inputs are deterministic and
set-independent (spec §5)."""
import os

import numpy as np
import pandas as pd
import pytest

RUN = os.environ.get("XPTS_PARITY") == "1"
pytestmark = pytest.mark.skipif(
    not RUN, reason="set XPTS_PARITY=1 to run (needs the local 2025/26 DB; ~5 min)")

AS_OF = 30
SEASON = "2025/26"


@pytest.fixture(scope="module")
def frames():
    from data import load_history, load_team_strengths
    from serve_v3 import load_fixtures
    from data import DEFAULT_DATABASE_URL
    history = load_history(season=SEASON)
    assert len(history) > 20000, "local DB must hold the restored 2025/26 season"
    fixtures = load_fixtures(os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL))
    strengths = load_team_strengths()
    return history, fixtures, strengths


def _capture_backtest_inputs(history, strengths):
    """Run walk_forward_v3 at GW30 with simulate_player_fixture spied, then
    key the captured calls by re-deriving the target order (sorted gw-30 rows
    minus zero-prior players — walk_forward's own iteration semantics)."""
    import backtest_v3
    captured = []
    real = backtest_v3.simulate_player_fixture

    def spy(rng, position, p_play, p60, player, lam_against, m_att, m_sav, n):
        captured.append({"position": position, "p_play": p_play, "p60": p60,
                         "player": player, "lam_against": lam_against,
                         "m_att": m_att, "m_sav": m_sav})
        return real(rng, position, p_play, p60, player, lam_against,
                    m_att, m_sav, n=n)

    backtest_v3.simulate_player_fixture = spy
    try:
        backtest_v3.walk_forward_v3(history, strengths, start_gw=AS_OF,
                                    end_gw=AS_OF, n_sims=8, assist_scale=True)
    finally:
        backtest_v3.simulate_player_fixture = real

    targets = history[history["gw"] == AS_OF].sort_values(
        ["player_id", "fixture_id"])
    prior_counts = history[history["gw"] < AS_OF].groupby("player_id").size()
    keys = [(int(t["player_id"]), int(t["fixture_id"]))
            for _, t in targets.iterrows()
            if prior_counts.get(int(t["player_id"]), 0) > 0]
    assert len(keys) == len(captured), "target-order re-derivation drifted"
    return dict(zip(keys, captured))


def _serve_inputs(history, fixtures):
    from assist_scale import compute_assist_scale
    from match_engine import MatchEngine, build_team_fixtures
    from rates_v3 import position_rate_priors
    from serving import (build_sim_inputs, build_targets, fit_serve_minutes,
                         latest_player_state, select_target_gws,
                         serve_minutes_predictions)
    hist = history[history["gw"] < AS_OF]
    gws = select_target_gws(fixtures, as_of_gw=AS_OF)
    assert gws[0] == AS_OF
    priors = position_rate_priors(hist)
    k = compute_assist_scale(hist)
    engine = MatchEngine(build_team_fixtures(hist))
    models = fit_serve_minutes(hist)
    preds = serve_minutes_predictions(hist, models)
    latest = latest_player_state(hist)
    targets = build_targets(fixtures, latest, [AS_OF])  # compare gw==AS_OF only
    inputs = build_sim_inputs(hist, targets, preds, priors, engine, k,
                              before_gw=AS_OF)
    return {(i["player_id"], i["fixture_id"]): i for i in inputs}


def _tuples_equal(a, b) -> list[str]:
    bad = []
    for f in ("p_play", "p60", "lam_against", "m_att", "m_sav"):
        if a[f] != pytest.approx(b[f], rel=1e-9, abs=1e-12):
            bad.append(f)
    for name in a["player"]["rates"]:
        if a["player"]["rates"][name] != pytest.approx(
                b["player"]["rates"][name], rel=1e-9, abs=1e-12):
            bad.append(f"rates.{name}")
    if a["player"]["p_dc"] != pytest.approx(b["player"]["p_dc"], rel=1e-9, abs=1e-12):
        bad.append("p_dc")
    if not np.allclose(np.asarray(a["player"]["bonus"], float),
                       np.asarray(b["player"]["bonus"], float),
                       rtol=1e-9, atol=1e-12):
        bad.append("bonus")
    return bad


@pytest.fixture(scope="module")
def parity_maps(frames):
    """ref + got computed ONCE for the module — the backtest capture runs a
    full minutes precompute + one v1 fit (minutes of wall-clock)."""
    history, fixtures, strengths = frames
    return (_capture_backtest_inputs(history, strengths),
            _serve_inputs(history, fixtures))


def test_serve_inputs_match_walk_forward(parity_maps):
    ref, got = parity_maps

    both = sorted(set(ref) & set(got))
    only_ref, only_got = set(ref) - set(got), set(got) - set(ref)
    # Set differences must be small and explainable (team-assignment /
    # position drift for players whose latest-prior club or position differs
    # from the GW-30 truth — spec §5 expects ~0–5).
    assert len(both) >= 0.95 * max(len(ref), len(got))
    assert len(only_ref) + len(only_got) <= 15, (
        f"unexplained set difference: only_ref={sorted(only_ref)[:5]} "
        f"only_got={sorted(only_got)[:5]}")

    mismatched, pos_drift = [], []
    for key in both:
        if ref[key]["position"] != got[key]["position"]:
            pos_drift.append(key)          # explainable: FPL reclassification
            continue
        bad = _tuples_equal(ref[key], got[key])
        if bad:
            mismatched.append((key, bad))
    assert len(pos_drift) <= 10, f"position drift too large: {pos_drift[:5]}"
    assert not mismatched, f"input mismatches: {mismatched[:5]}"
    print(f"\n[parity] intersection={len(both)} only_ref={len(only_ref)} "
          f"only_got={len(only_got)} pos_drift={len(pos_drift)}")


def test_sampled_shared_seed_draws_identical(parity_maps):
    """Belt-and-braces (spec §5): identical inputs + the frozen simulator =
    identical draws under a shared per-target seed."""
    from simulate_v3 import simulate_player_fixture
    ref, got = parity_maps
    both = sorted(set(ref) & set(got))
    sample = [k for k in both if ref[k]["position"] == got[k]["position"]][:20]
    assert len(sample) == 20
    for pid, fid in sample:
        a, b = ref[(pid, fid)], got[(pid, fid)]
        da = simulate_player_fixture(np.random.default_rng((99, pid, fid)),
                                     a["position"], a["p_play"], a["p60"],
                                     a["player"], a["lam_against"], a["m_att"],
                                     a["m_sav"], n=500)
        db = simulate_player_fixture(np.random.default_rng((99, pid, fid)),
                                     b["position"], b["p_play"], b["p60"],
                                     b["player"], b["lam_against"], b["m_att"],
                                     b["m_sav"], n=500)
        assert np.array_equal(da["total"], db["total"]), (pid, fid)
```

- [ ] **Step 3: Verify the parity test is skipped by default**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_serve_parity.py -q`
Expected: `2 skipped`

- [ ] **Step 4: Run the parity test live against the local DB**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && XPTS_PARITY=1 .venv/bin/python -m pytest tests/test_serve_parity.py -q -s`
Expected: `2 passed` (several minutes — the walk-forward step runs a full minutes precompute + one v1 fit). The `[parity]` line reports intersection/difference counts. **If this fails: STOP — do not adjust tolerances or production code; report BLOCKED with the failure output** (a genuine input mismatch means the serve orchestration diverges from the gate-validated path).

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add .github/workflows/xpts-serve.yml model/tests/test_serve_parity.py
git commit -m "feat(model): xpts-serve nightly workflow + serve-path parity guard vs walk_forward (#128)"
```

---

### Task 5: `model/eval_prospective.py` + `docs/xpts-prospective.md` (#130)

**Files:**
- Create: `model/eval_prospective.py`
- Create: `docs/xpts-prospective.md`
- Test: `model/tests/test_eval_prospective.py`

**Interfaces:**
- Consumes: `backtest_v31.bootstrap_captaincy` (picks frame with `model ∈ {"v31","v1"}` labels); `serving.season_label_for`; `data.DEFAULT_DATABASE_URL`.
- Produces: the CLI `python eval_prospective.py [--season S] [--doc docs/xpts-prospective.md]`; pure functions named below (the tests import them).

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_eval_prospective.py`:

```python
"""#130 prospective-eval tests: season cutoff, model_version split, joint
frame, MAE pools, ex-ante captaincy (own-pool argmax; missing actual -> 0),
promotion statuses, and the doc writer's marker semantics."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from eval_prospective import (SCOREBOARD_MARKER, captain_picks, evaluated_gws,
                              joint_frame, mae_summary, promotion_status,
                              season_cutoff, split_by_model, write_doc)


def test_season_cutoff_is_july_first_of_start_year():
    assert season_cutoff("2026/27") == datetime(2026, 7, 1, tzinfo=timezone.utc)
    assert season_cutoff("2025/26") == datetime(2025, 7, 1, tzinfo=timezone.utc)


def _rows():
    return pd.DataFrame([
        {"player_id": 1, "gw": 1, "p50": 5.0, "mean": 5.5, "model_version": "v3.1"},
        {"player_id": 1, "gw": 1, "p50": 4.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 2, "gw": 1, "p50": 2.0, "mean": 2.2, "model_version": "v3.1"},
        {"player_id": 2, "gw": 1, "p50": 3.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 1, "gw": 2, "p50": 6.0, "mean": 6.1, "model_version": "v3.1"},
        {"player_id": 1, "gw": 2, "p50": 5.0, "mean": None, "model_version": "v1.0.0"},
        {"player_id": 9, "gw": 1, "p50": 9.0, "mean": 9.0, "model_version": "v2-experimental"},
    ])


def _actuals():
    return pd.DataFrame([
        {"player_id": 1, "gw": 1, "actual": 8.0, "minutes": 90},
        {"player_id": 2, "gw": 1, "actual": 2.0, "minutes": 30},
        {"player_id": 1, "gw": 2, "actual": 3.0, "minutes": 90},
    ])


def test_split_by_model_strict_on_version():
    v31, v1 = split_by_model(_rows())
    assert len(v31) == 3 and (v31["model_version"] == "v3.1").all()
    assert len(v1) == 3 and v1["model_version"].str.startswith("v1").all()
    # the experimental row belongs to neither family
    assert 9 not in set(v31["player_id"]) | set(v1["player_id"])


def test_joint_frame_and_evaluated_gws():
    v31, v1 = split_by_model(_rows())
    j = joint_frame(v31, v1, _actuals())
    assert len(j) == 3  # (1,1), (2,1), (1,2)
    assert evaluated_gws(v31, v1, _actuals()) == [1, 2]


def test_mae_summary_pools():
    v31, v1 = split_by_model(_rows())
    j = joint_frame(v31, v1, _actuals())
    m = mae_summary(j)
    # full pool: v31 errors |5.5-8... no: MAE uses p50 (the shipped point
    # estimate): |5-8|, |2-2|, |6-3| -> 2.0 ; v1: |4-8|, |3-2|, |5-3| -> 7/3
    assert m["full"]["n"] == 3
    assert m["full"]["v31"] == pytest.approx(2.0)
    assert m["full"]["v1"] == pytest.approx(7.0 / 3.0)
    # starters pool: minutes >= 60 -> rows (1,1) and (1,2)
    assert m["starters"]["n"] == 2
    assert m["starters"]["v31"] == pytest.approx((3.0 + 3.0) / 2.0)


def test_captain_picks_own_pool_and_missing_actual_zero():
    v31, v1 = split_by_model(_rows())
    ep = pd.DataFrame([{"player_id": 2, "gw": 1, "ep_next": 4.5}])
    picks = captain_picks(v31, v1, ep, _actuals(), [1, 2])
    p = picks.set_index(["model", "gw"])
    assert p.loc[("v31", 1), "player_id"] == 1      # argmax mean (5.5)
    assert p.loc[("v31", 1), "actual"] == 8.0
    assert p.loc[("v1", 1), "player_id"] == 1       # argmax p50 (4.0)
    assert p.loc[("ep", 1), "player_id"] == 2       # its own pool
    # gw 2: v1 pool has only player 1; ep has no gw-2 rows -> no ep pick
    assert ("ep", 2) not in p.index
    # a projected pick with no actual row scores 0:
    v31_only = pd.DataFrame([{"player_id": 7, "gw": 2, "p50": 9.9, "mean": 9.9,
                              "model_version": "v3.1"}])
    picks2 = captain_picks(v31_only, v31_only.assign(model_version="v1.0.0"),
                           ep.iloc[0:0], _actuals(), [2])
    assert (picks2["actual"] == 0.0).all()


def test_promotion_status_each_branch():
    ok_mae = {"full": {"n": 100, "v31": 2.0, "v1": 2.1}}
    s, r = promotion_status(6, ok_mae, {"v31": 50.0, "v1": 50.0})
    assert s == "PROMOTE-ELIGIBLE"
    s, r = promotion_status(5, ok_mae, {"v31": 50.0, "v1": 50.0})
    assert s == "HOLD" and "5 evaluated" in r
    s, r = promotion_status(6, {"full": {"n": 100, "v31": 2.2, "v1": 2.1}},
                            {"v31": 50.0, "v1": 50.0})
    assert s == "HOLD" and "MAE" in r
    s, r = promotion_status(6, ok_mae, {"v31": 49.0, "v1": 50.0})
    assert s == "HOLD" and "captaincy" in r


def test_write_doc_preserves_runbook_above_marker(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("# Runbook\n\nkeep me\n\n" + SCOREBOARD_MARKER +
                 "\n\nstale scoreboard\n")
    write_doc(str(p), "fresh scoreboard content")
    content = p.read_text()
    assert "keep me" in content and "stale scoreboard" not in content
    assert content.count(SCOREBOARD_MARKER) == 1
    assert content.index("fresh scoreboard") > content.index(SCOREBOARD_MARKER)


def test_write_doc_refuses_missing_marker(tmp_path):
    p = tmp_path / "doc.md"
    p.write_text("# Runbook without marker\n")
    with pytest.raises(ValueError, match="marker"):
        write_doc(str(p), "content")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_eval_prospective.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'eval_prospective'`

- [ ] **Step 3: Write the implementation**

Create `model/eval_prospective.py`:

```python
"""#130 prospective eval + promotion check (spec §7 — the frozen prospective
registration). On-demand and read-only: recomputes the scoreboard from durable
tables (shadow + projections split by model_version, history actuals, the
deadline-frozen snapshot ep_next) and refreshes docs/xpts-prospective.md below
its marker. Promotion condition (strict, user decision 2026-07-07):
>= 6 evaluated GWs AND full-pool MAE lead AND captaincy not behind.

Usage: python eval_prospective.py [--season 2026/27] [--doc docs/xpts-prospective.md]"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import psycopg

from backtest_v31 import bootstrap_captaincy
from data import DEFAULT_DATABASE_URL
from serving import season_label_for

SCOREBOARD_MARKER = "<!-- xpts-prospective-scoreboard -->"
MIN_EVAL_GWS = 6
STARTER_MINUTES = 60


def season_cutoff(season: str) -> datetime:
    """Projection rows count for a season iff computed_at >= July 1 of its
    start year (spec §7 — guards stale rows under reused element ids)."""
    return datetime(int(season.split("/")[0]), 7, 1, tzinfo=timezone.utc)


def split_by_model(rows: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Attribution strictly by model_version, never table identity (spec §7)."""
    v31 = rows[rows["model_version"] == "v3.1"].copy()
    v1 = rows[rows["model_version"].str.startswith("v1")].copy()
    return v31, v1


def load_frames(url: str, season: str) -> dict:
    cutoff = season_cutoff(season)
    with psycopg.connect(url) as conn:
        rows = pd.read_sql(
            "select player_id, gw, p50, mean, model_version from ("
            " select player_id, gw, p50, mean, model_version, computed_at"
            "   from public.projections_shadow"
            " union all"
            " select player_id, gw, p50, null::numeric as mean, model_version,"
            "   computed_at from public.projections"
            ") u where computed_at >= %(c)s", conn, params={"c": cutoff})
        actuals = pd.read_sql(
            "select player_id, gw, sum(total_points) as actual,"
            " sum(minutes) as minutes from public.player_gw_history"
            " where season = %(s)s group by player_id, gw",
            conn, params={"s": season})
        ep = pd.read_sql(
            "select player_id, gw, ep_next from public.player_gw_snapshots"
            " where season = %(s)s and ep_next > 0",  # 0 = unparseable-at-capture
            conn, params={"s": season})
    for df, cols in ((rows, ["p50", "mean"]), (actuals, ["actual", "minutes"]),
                     (ep, ["ep_next"])):
        for c in cols:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return {"rows": rows, "actuals": actuals, "ep": ep}


def joint_frame(v31: pd.DataFrame, v1: pd.DataFrame,
                actuals: pd.DataFrame) -> pd.DataFrame:
    """Full joint pool: both models emitted AND an actual exists (spec §7)."""
    return (v31.rename(columns={"p50": "p50_v31"})
            [["player_id", "gw", "p50_v31", "mean"]]
            .merge(v1.rename(columns={"p50": "p50_v1"})
                   [["player_id", "gw", "p50_v1"]],
                   on=["player_id", "gw"], how="inner")
            .merge(actuals, on=["player_id", "gw"], how="inner"))


def evaluated_gws(v31: pd.DataFrame, v1: pd.DataFrame,
                  actuals: pd.DataFrame) -> list[int]:
    s = set(v31["gw"]) & set(v1["gw"]) & set(actuals["gw"])
    return sorted(int(g) for g in s)


def _mae(pred: pd.Series, actual: pd.Series) -> float:
    return float(np.abs(pred - actual).mean()) if len(pred) else 0.0


def mae_summary(joint: pd.DataFrame) -> dict:
    starters = joint[joint["minutes"] >= STARTER_MINUTES]
    return {
        "full": {"n": int(len(joint)),
                 "v31": _mae(joint["p50_v31"], joint["actual"]),
                 "v1": _mae(joint["p50_v1"], joint["actual"])},
        "starters": {"n": int(len(starters)),
                     "v31": _mae(starters["p50_v31"], starters["actual"]),
                     "v1": _mae(starters["p50_v1"], starters["actual"])},
    }


def ep_summary(ep: pd.DataFrame, actuals: pd.DataFrame) -> dict:
    e = ep.merge(actuals, on=["player_id", "gw"], how="inner")
    return {"n": int(len(e)), "mae": _mae(e["ep_next"], e["actual"])}


def captain_picks(v31: pd.DataFrame, v1: pd.DataFrame, ep: pd.DataFrame,
                  actuals: pd.DataFrame, gws: list[int]) -> pd.DataFrame:
    """Ex-ante argmax per model over ITS OWN projected rows (spec §7 — no
    hindsight pool filtering); a pick with no history row scores 0 (did not
    feature). v3.1 ranks by its registered ranking functional, the mean."""
    act = actuals.set_index(["player_id", "gw"])["actual"]
    pools = {"v31": (v31.dropna(subset=["mean"]), "mean"),
             "v1": (v1, "p50"),
             "ep": (ep, "ep_next")}
    rows = []
    for gw in gws:
        for model, (pool, col) in pools.items():
            g = pool[pool["gw"] == gw]
            if len(g) == 0:
                continue
            pick = g.loc[g[col].idxmax()]
            pid = int(pick["player_id"])
            rows.append({"gw": int(gw), "model": model, "player_id": pid,
                         "pred": float(pick[col]),
                         "actual": float(act.get((pid, int(gw)), 0.0))})
    return pd.DataFrame(rows, columns=["gw", "model", "player_id", "pred",
                                       "actual"])


def promotion_status(n_gws: int, mae: dict, cap: dict) -> tuple[str, str]:
    if n_gws < MIN_EVAL_GWS:
        return "HOLD", f"only {n_gws} evaluated GWs (need >= {MIN_EVAL_GWS})"
    if not mae["full"]["v31"] < mae["full"]["v1"]:
        return "HOLD", (f"MAE not ahead ({mae['full']['v31']:.4f} vs "
                        f"{mae['full']['v1']:.4f})")
    if cap["v31"] < cap["v1"]:
        return "HOLD", (f"captaincy behind ({cap['v31']:.0f} vs "
                        f"{cap['v1']:.0f})")
    return "PROMOTE-ELIGIBLE", "all conditions met"


def render_scoreboard(season: str, gws: list[int], mae: dict, ep: dict,
                      cap: dict, boot: dict | None,
                      status: tuple[str, str]) -> str:
    lines = [
        f"Season **{season}** · evaluated GWs: **{len(gws)}**"
        f" ({', '.join(str(g) for g in gws) if gws else 'none yet'})",
        "",
        "| metric | v3.1 | v1 | ep_next |",
        "|---|---|---|---|",
        (f"| MAE, full joint pool (n = {mae['full']['n']}) "
         f"| {mae['full']['v31']:.4f} | {mae['full']['v1']:.4f} "
         f"| {ep['mae']:.4f} (n = {ep['n']}) |"),
        (f"| MAE, starters ≥ {STARTER_MINUTES}′ (diagnostic, n = "
         f"{mae['starters']['n']}) | {mae['starters']['v31']:.4f} "
         f"| {mae['starters']['v1']:.4f} | — |"),
        (f"| captaincy (cumulative) | {cap.get('v31', 0.0):.0f} "
         f"| {cap.get('v1', 0.0):.0f} | {cap.get('ep', 0.0):.0f} |"),
        "",
    ]
    if boot is not None:
        lines.append(
            f"Bootstrap Σ(v3.1 − v1) captain deltas (context, not a gate): "
            f"q10 {boot['q10']:+.1f} · q50 {boot['q50']:+.1f} · "
            f"q90 {boot['q90']:+.1f} · P(worse) {boot['p_worse']:.3f}\n")
    lines.append(f"**Status: {status[0]}** — {status[1]}")
    return "\n".join(lines)


def write_doc(path: str, scoreboard: str) -> None:
    """Replace everything below the marker; the runbook above it is
    hand-maintained and must survive every refresh."""
    with open(path) as f:
        content = f.read()
    if SCOREBOARD_MARKER not in content:
        raise ValueError(f"scoreboard marker missing from {path}")
    head = content[: content.index(SCOREBOARD_MARKER)].rstrip()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(path, "w") as f:
        f.write(head + "\n\n" + SCOREBOARD_MARKER +
                f"\n\n_Last refreshed: {stamp}_\n\n" + scoreboard + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Prospective eval (#130)")
    ap.add_argument("--season", default=None)
    ap.add_argument("--doc", default=os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "docs", "xpts-prospective.md")))
    args = ap.parse_args(argv)
    url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    season = args.season or season_label_for(datetime.now(timezone.utc))

    frames = load_frames(url, season)
    v31, v1 = split_by_model(frames["rows"])
    gws = evaluated_gws(v31, v1, frames["actuals"])
    joint = joint_frame(v31[v31["gw"].isin(gws)], v1[v1["gw"].isin(gws)],
                        frames["actuals"])
    mae = mae_summary(joint)
    ep = ep_summary(frames["ep"][frames["ep"]["gw"].isin(gws)],
                    frames["actuals"])
    picks = captain_picks(v31, v1, frames["ep"], frames["actuals"], gws)
    cap = (picks.groupby("model")["actual"].sum().to_dict()
           if len(picks) else {})
    boot = None
    mv = picks[picks["model"].isin(["v31", "v1"])] if len(picks) else picks
    if len(mv) and mv["gw"].nunique() >= 2:
        b = bootstrap_captaincy(mv)
        boot = {k: b[k] for k in ("q10", "q50", "q90", "p_worse")}
    status = promotion_status(len(gws), mae,
                              {"v31": cap.get("v31", 0.0),
                               "v1": cap.get("v1", 0.0)})
    board = render_scoreboard(season, gws, mae, ep, cap, boot, status)
    print(board)
    write_doc(args.doc, board)
    print(f"\n[eval-prospective] wrote {args.doc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Create the doc with the registration + runbook + marker**

Create `docs/xpts-prospective.md`:

```markdown
# xPts prospective eval — v3.1 (shadow) vs v1 (serving) vs live ep_next

The #130 scoreboard and promotion runbook. The section below the marker is
regenerated by `model/eval_prospective.py` — everything above it is
hand-maintained. Registration and design:
`docs/superpowers/specs/2026-07-07-xpts-serving-revival-design.md` (§7 is the
frozen prospective registration).

## Pre-registered semantics (frozen 2026-07-07, before the season)

- A GW is **evaluated** when its history rows exist and both models emitted
  projection rows for it (attribution strictly by `model_version`; projection
  rows count only when `computed_at ≥ July 1` of the season's start year).
- **Promotion MAE** = each model's shipped point estimate (v1 `p50`, v3.1
  `p50` = simulated median) over the full joint pool (both emitted + actual
  exists). Starters-only MAE (actual minutes ≥ 60) is a diagnostic, never the
  criterion.
- **Captaincy** = per-GW ex-ante argmax over each model's own projected rows
  (v1 by `p50`, v3.1 by `mean` — its registered ranking functional); a pick
  with no history row scores 0. `ep_next` (deadline-frozen snapshots;
  `ep_next = 0` rows excluded as unparseable-at-capture) is context, and the
  paired bootstrap is context — neither gates promotion.
- **Promotion condition (strict, user decision 2026-07-07):** ≥ 6 evaluated
  GWs AND cumulative full-pool MAE(v3.1) < MAE(v1) AND cumulative
  captaincy(v3.1) ≥ captaincy(v1).

## Promotion runbook

1. Run `cd model && .venv/bin/python eval_prospective.py` (or with
   `DATABASE_URL` pointed at prod). Commit the refreshed scoreboard with the
   run.
2. On **PROMOTE-ELIGIBLE** (and a human decision to proceed), open ONE PR
   that:
   - sets `XPTS_SERVE_TABLE: projections` in `.github/workflows/xpts-serve.yml`
     (the v3.1 writer emits contract columns to `projections`);
   - flips `fpl-project`'s target table constant to `projections_shadow`
     (its upsert payload is unchanged — the depth columns are nullable).
3. Merge → CI deploys `fpl-project`; the next nightly runs swap roles. The
   dethroned v1 keeps running as shadow. Eval attribution is unaffected
   (`model_version` filters, never table identity), and the client contract
   never changes.
4. **Rollback** = revert that PR. Nothing else moves.

### Operator setup (one-time)

1. Create the `DATABASE_URL` GitHub Actions secret — the Supabase
   **session-pooler** URI (GitHub runners are IPv4-only; the direct DB host
   is IPv6-only).
2. After merge, trigger `xpts-serve` once via **workflow_dispatch**. Expected
   off-season result: green run ending `[serve-v31] skipped: no unfinished
   fixtures (off-season)` — that validates checkout, deps, the secret, and
   connectivity end to end.
3. When 2026/27 GW1 data exists, eyeball the first rows:
   `select * from projections_shadow order by gw, p50 desc limit 20;`

<!-- xpts-prospective-scoreboard -->

_No evaluated GWs yet — the scoreboard appears once 2026/27 GWs finish and
both models have emitted projections._
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_eval_prospective.py -q`
Expected: `8 passed`

- [ ] **Step 6: Run the eval live against the local DB (smoke — empty-season path)**

Run:
```bash
cp /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/docs/xpts-prospective.md /tmp/xpts-prospective-smoke.md && \
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
.venv/bin/python eval_prospective.py --season 2026/27 --doc /tmp/xpts-prospective-smoke.md 2>&1 | tail -6
```
Expected: a scoreboard with `evaluated GWs: **0**`, `Status: HOLD` with `only 0 evaluated GWs`, then `[eval-prospective] wrote /tmp/xpts-prospective-smoke.md`. (The copy gives the writer its marker without touching the committed doc; the run validates the whole pipeline — including the `projections_shadow` and `player_gw_snapshots` queries — against real, empty tables.)

- [ ] **Step 7: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/eval_prospective.py model/tests/test_eval_prospective.py docs/xpts-prospective.md
git commit -m "feat(model): prospective eval + promotion runbook — strict bar, model_version attribution (#130)"
```

---

## NOT in this plan (controller-run, after all tasks + review)

1. Full suite: `cd model && .venv/bin/python -m pytest tests/ -q` (expect 188 passed, 2 skipped — 158 baseline + 30 new; the skips are the parity pair without `XPTS_PARITY`; exact count may drift ±2, the requirement is ZERO failures).
2. Re-run the parity guard live: `XPTS_PARITY=1 .venv/bin/python -m pytest tests/test_serve_parity.py -q -s`.
3. A live `--dry-run --as-of-gw 30 --season 2025/26` of the serve CLI against the local DB (eyeball k ≈ 1.44, plausible p50s).
4. PR → merge → the §9 operator steps (secret + workflow_dispatch no-op validation) — user-side.
```
