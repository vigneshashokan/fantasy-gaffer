# xPts v2 Plan 2: Match Engine + v2 Training + Backtest Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2.0 match engine (dynamic venue-split team ratings + Poisson fixture model) in the Python `model/` toolchain, train the v2 quantile-regression artifact on its features, and run the walk-forward backtest gate that decides whether shadow serving (#128) proceeds.

**Architecture:** Team-level match xG is aggregated from our own `player_gw_history`; exp-decay venue-split ratings (shrunk toward league averages by sample size) feed an independent-Poisson fixture model producing `team_lambda_for` / `team_lambda_against` / `p_clean_sheet`. These become three new features in a v2 per-position quantile regression that also drops `form_expected_goal_involvements` (xGI collinearity) and the static `opp_strength_*` (superseded). Everything is offline Python — no deploy surface. Issue: #125; spec §2 of `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md`.

**Tech Stack:** Python 3 (`model/.venv`), pandas / numpy / statsmodels (QuantReg) / scipy, pytest. DB access (train/backtest only) via `psycopg` to local Supabase (`DATABASE_URL`).

## Global Constraints

- `model/` is a **separate Python toolchain** — excluded from repo tsc/jest. Run tests with `cd model && source .venv/bin/activate && PYTHONPATH=. pytest -q`.
- **`feature_spec.py` (v1) is FROZEN** — never modify it; v2 constants live in a new `feature_spec_v2.py`. `train.py` changes must keep the v1 path byte-identical (existing tests guard this).
- **`FEATURE_COLUMNS_V2` order is a serving contract** — #128's Deno mirror reproduces it; never reorder after the artifact ships.
- **No leakage:** every rating/baseline/feature for a GW-`t` prediction uses only `gw < t` rows.
- The gate (spec §2): v2 beats v1 on walk-forward MAE **and** is not worse on cumulative captaincy **and** coverage within 0.50 ± 0.10. Fail → documented finding, do NOT proceed to #128.
- Training rows stay **per-fixture** (DGWs sum at (player, gw) aggregation, exactly like v1).
- DB-dependent tasks (8–9) need the local Supabase stack with 2025/26 `player_gw_history` populated (`supabase start`; verify with the row-count check in Task 8). Pure-function tasks (1–7) need no DB.
- Work on branch `feat/xpts-v2-engine` (cut from `feat/xpts-v2-match-engine`).

---

### Task 1: `feature_spec_v2.py` + column-contract guard test

**Files:**
- Create: `model/feature_spec_v2.py`
- Test: `model/tests/test_feature_spec_v2.py`

**Interfaces:**
- Produces (imported by every later task): `MODEL_VERSION_V2 = "v2.0.0"`, `FORM_STATS_V2` (8 stats, xGI dropped), `FEATURE_COLUMNS_V2` (14 columns, fixed order), `RATING_WINDOW`, `RATING_ALPHA`, `PRIOR_WEIGHT`, `LEAGUE_XG_PRIOR`, plus re-exported `FORM_WINDOW`/`DECAY_ALPHA`/`VALUE_SCALE` values (v2 declares its own constants so the file is self-contained for the Deno mirror).

- [ ] **Step 1: Create the branch**

```bash
git checkout feat/xpts-v2-match-engine && git pull
git checkout -b feat/xpts-v2-engine
```

- [ ] **Step 2: Write the failing test**

Create `model/tests/test_feature_spec_v2.py`:

```python
from feature_spec_v2 import (
    DECAY_ALPHA_V2,
    FEATURE_COLUMNS_V2,
    FORM_STATS_V2,
    FORM_WINDOW_V2,
    LEAGUE_XG_PRIOR,
    MODEL_VERSION_V2,
    PRIOR_WEIGHT,
    QUANTILES_V2,
    RATING_ALPHA,
    RATING_WINDOW,
    VALUE_SCALE_V2,
)


def test_model_version():
    assert MODEL_VERSION_V2 == "v2.0.0"


def test_form_stats_drop_xgi_only():
    # v1 FORM_STATS minus expected_goal_involvements, order preserved.
    assert FORM_STATS_V2 == [
        "expected_goals", "expected_assists", "threat", "creativity",
        "influence", "bps", "defensive_contribution", "total_points",
    ]


def test_feature_columns_exact_order():
    # SERVING CONTRACT (#128 mirrors this order) — change breaks the artifact.
    assert FEATURE_COLUMNS_V2 == [
        "form_expected_goals", "form_expected_assists", "form_threat",
        "form_creativity", "form_influence", "form_bps",
        "form_defensive_contribution", "form_total_points",
        "xmin", "was_home", "value_scaled",
        "team_lambda_for", "team_lambda_against", "p_clean_sheet",
    ]
    assert len(FEATURE_COLUMNS_V2) == 14


def test_no_static_strengths_or_xgi():
    assert "opp_strength_def" not in FEATURE_COLUMNS_V2
    assert "opp_strength_att" not in FEATURE_COLUMNS_V2
    assert "form_expected_goal_involvements" not in FEATURE_COLUMNS_V2


def test_hyperparams_sane():
    assert RATING_WINDOW >= 1
    assert 0.0 < RATING_ALPHA <= 1.0
    assert PRIOR_WEIGHT > 0
    assert 0.5 < LEAGUE_XG_PRIOR < 3.0
    assert FORM_WINDOW_V2 == 6 and DECAY_ALPHA_V2 == 0.85  # unchanged from v1
    assert QUANTILES_V2 == [0.25, 0.50, 0.75] and VALUE_SCALE_V2 == 10.0
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_feature_spec_v2.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'feature_spec_v2'`.

- [ ] **Step 4: Write the implementation**

Create `model/feature_spec_v2.py`:

```python
"""Single source of truth for the xPts v2.0 feature contract.

Training (model/) and serving (#128, Deno feature-spec-v2.ts) MUST build
features from these exact constants. v1's feature_spec.py is FROZEN — v2
declares its own constants (same values where unchanged) so this file alone
defines the v2 contract.
"""

MODEL_VERSION_V2 = "v2.0.0"

# Player-form machinery — unchanged from v1.
FORM_WINDOW_V2 = 6
DECAY_ALPHA_V2 = 0.85
QUANTILES_V2 = [0.25, 0.50, 0.75]
POSITIONS_V2 = ["GKP", "DEF", "MID", "FWD"]
VALUE_SCALE_V2 = 10.0

# v1 FORM_STATS minus expected_goal_involvements (xGI ≈ xG + xA collinearity
# fix — spec §1 decisions log).
FORM_STATS_V2 = [
    "expected_goals",
    "expected_assists",
    "threat",
    "creativity",
    "influence",
    "bps",
    "defensive_contribution",
    "total_points",
]

# Match-engine rating hyperparams. Initial values; Task 9's grid selection
# freezes the final ones (walk-forward MAE) and re-records them here.
RATING_WINDOW = 10   # venue-specific matches per rating stream
RATING_ALPHA = 0.9   # exp-decay base across those matches (most-recent-first)
PRIOR_WEIGHT = 4     # shrinkage: rating = (k*raw + m*L) / (k + m), m = this

# League-average team-xG per team-fixture, frozen from the 2025/26 mean in
# Task 8 (the zero-data fallback for league baselines at season start).
LEAGUE_XG_PRIOR = 1.35

FEATURE_COLUMNS_V2 = (
    [f"form_{s}" for s in FORM_STATS_V2]
    + ["xmin", "was_home", "value_scaled"]
    + ["team_lambda_for", "team_lambda_against", "p_clean_sheet"]
)
```

- [ ] **Step 5: Run it to verify it passes**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_feature_spec_v2.py -q
```

Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add model/feature_spec_v2.py model/tests/test_feature_spec_v2.py
git commit -m "feat(model): v2 feature spec — xGI dropped, match features, rating hyperparams (#125)"
```

---

### Task 2: Team-fixture aggregation (`build_team_fixtures`)

**Files:**
- Create: `model/match_engine.py`
- Test: `model/tests/test_match_engine.py`

**Interfaces:**
- Consumes: the `player_gw_history` DataFrame shape from `data.load_history` (columns incl. `player_id, fixture_id, gw, team_id, opponent_team, was_home, expected_goals, goals_scored`).
- Produces: `build_team_fixtures(history: pd.DataFrame) -> pd.DataFrame` with one row per `(fixture_id, team_id)` and columns `[fixture_id, team_id, opponent_team, gw, was_home, xg_for, xg_against, goals_for, goals_against]`.

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_match_engine.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'match_engine'`.

- [ ] **Step 3: Write the implementation**

Create `model/match_engine.py`:

```python
"""xPts v2.0 match engine: team-fixture aggregation, venue-split exp-decay
ratings with shrinkage, and the independent-Poisson fixture model.

Pure computation on DataFrames — no I/O. Spec:
docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md §2.
The Deno mirror (#128, lib/features-v2.ts) must reproduce this to 1e-6.
"""
from __future__ import annotations

import math

import pandas as pd

from feature_spec_v2 import LEAGUE_XG_PRIOR, PRIOR_WEIGHT, RATING_ALPHA, RATING_WINDOW
from features import exp_decay_mean


def build_team_fixtures(history: pd.DataFrame) -> pd.DataFrame:
    """One row per (fixture_id, team_id): the team's match-level attack and
    defence samples. xg_for = Σ own players' expected_goals; xg_against = the
    opponent's xg_for. goals_* are player-goal sums (≈ team goals, excl. own
    goals — fine for the CS diagnostic)."""
    side = (
        history.groupby(["fixture_id", "team_id"], as_index=False)
        .agg(
            opponent_team=("opponent_team", "first"),
            gw=("gw", "first"),
            was_home=("was_home", "first"),
            xg_for=("expected_goals", "sum"),
            goals_for=("goals_scored", "sum"),
        )
    )
    opp = side[["fixture_id", "team_id", "xg_for", "goals_for"]].rename(
        columns={"team_id": "opponent_team", "xg_for": "xg_against", "goals_for": "goals_against"},
    )
    return side.merge(opp, on=["fixture_id", "opponent_team"], how="left").fillna(
        {"xg_against": 0.0, "goals_against": 0}
    )
```

- [ ] **Step 4: Run to verify pass**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add model/match_engine.py model/tests/test_match_engine.py
git commit -m "feat(model): team-fixture xG aggregation from player_gw_history (#125)"
```

---

### Task 3: Ratings + league baselines (shrinkage, no leakage)

**Files:**
- Modify: `model/match_engine.py` (append)
- Modify: `model/tests/test_match_engine.py` (append)

**Interfaces:**
- Produces: `class MatchEngine` —
  - `MatchEngine(team_fixtures: pd.DataFrame, *, window=RATING_WINDOW, alpha=RATING_ALPHA, prior_weight=PRIOR_WEIGHT, league_prior=LEAGUE_XG_PRIOR)`
  - `.league_baseline(venue: str, before_gw: int) -> float` (`venue` ∈ `{"home","away"}`)
  - `.rating(team_id: int, venue: str, kind: str, before_gw: int) -> float` (`kind` ∈ `{"att","def"}`)

- [ ] **Step 1: Append the failing tests**

Append to `model/tests/test_match_engine.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: FAIL — `ImportError: cannot import name 'MatchEngine'`.

- [ ] **Step 3: Append the implementation**

Append to `model/match_engine.py`:

```python
class MatchEngine:
    """Venue-split exp-decay team ratings with sample-size shrinkage, and the
    independent-Poisson fixture model on top. All queries take `before_gw` and
    only see matches with gw < before_gw (walk-forward safe by construction)."""

    def __init__(self, team_fixtures: pd.DataFrame, *,
                 window: int = RATING_WINDOW, alpha: float = RATING_ALPHA,
                 prior_weight: float = PRIOR_WEIGHT,
                 league_prior: float = LEAGUE_XG_PRIOR) -> None:
        self.tf = team_fixtures.sort_values(["gw", "fixture_id"])
        self.window = window
        self.alpha = alpha
        self.prior_weight = prior_weight
        self.league_prior = league_prior

    def _venue_rows(self, venue: str, before_gw: int) -> pd.DataFrame:
        is_home = venue == "home"
        return self.tf[(self.tf.was_home == is_home) & (self.tf.gw < before_gw)]

    def league_baseline(self, venue: str, before_gw: int) -> float:
        rows = self._venue_rows(venue, before_gw)
        n = len(rows)
        if n == 0:
            return float(self.league_prior)
        raw = float(rows["xg_for"].mean())
        m = self.prior_weight
        return (n * raw + m * self.league_prior) / (n + m)

    def rating(self, team_id: int, venue: str, kind: str, before_gw: int) -> float:
        rows = self._venue_rows(venue, before_gw)
        rows = rows[rows.team_id == team_id].sort_values(
            ["gw", "fixture_id"], ascending=False
        ).head(self.window)
        col = "xg_for" if kind == "att" else "xg_against"
        # def_home / att_away both live in "away-goals" units and vice versa:
        # a team's home defence concedes what opponents score away. The league
        # baseline for a stream is the mean of the goals-units it's measured in.
        baseline_venue = venue if kind == "att" else ("away" if venue == "home" else "home")
        L = self.league_baseline(baseline_venue, before_gw)
        k = len(rows)
        if k == 0:
            return L
        raw = exp_decay_mean(rows[col].tolist(), alpha=self.alpha)
        m = self.prior_weight
        return (k * raw + m * L) / (k + m)
```

- [ ] **Step 4: Run to verify pass**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: PASS — 10 tests. (Note `test_rating_shrinks_toward_league_baseline` computes `L` via the same method — it verifies the shrinkage *form*, not a hand-derived constant.)

- [ ] **Step 5: Commit**

```bash
git add model/match_engine.py model/tests/test_match_engine.py
git commit -m "feat(model): venue-split decayed team ratings with shrinkage (#125)"
```

---

### Task 4: Poisson fixture model (`lambdas`, `p_clean_sheet`)

**Files:**
- Modify: `model/match_engine.py` (append methods to `MatchEngine`)
- Modify: `model/tests/test_match_engine.py` (append)

**Interfaces:**
- Produces:
  - `.lambdas(team_id: int, opponent_team: int, was_home: bool, before_gw: int) -> tuple[float, float]` — `(lambda_for, lambda_against)`
  - `.p_clean_sheet(lambda_against: float) -> float` (staticmethod, `exp(-λ)`)

- [ ] **Step 1: Append the failing tests**

Append to `model/tests/test_match_engine.py`:

```python
import math


def _uniform_tf(xg):
    """Every team identical: each played one home + one away match with the
    same xg for/against -> every rating equals the league baseline."""
    rows, fixture = [], 0
    for gw, (h, a) in enumerate([(1, 2), (3, 4), (2, 1), (4, 3)], start=1):
        fixture += 1
        rows.append(_tf(h, a, gw, fixture, True, xg, xg))
        rows.append(_tf(a, h, gw, fixture, False, xg, xg))
    return pd.DataFrame(rows)


def test_league_average_teams_reproduce_league_baseline():
    # SANITY INVARIANT (spec §2): both-average teams -> lambda == L_venue.
    # xg must equal the prior: shrinkage blends raw ratings toward L, so the
    # invariant is exact only when raw == prior == L.
    eng = MatchEngine(_uniform_tf(xg=LEAGUE_XG_PRIOR), window=6, alpha=1.0, prior_weight=4)
    lam_for, lam_against = eng.lambdas(1, 2, was_home=True, before_gw=5)
    assert lam_for == pytest.approx(eng.league_baseline("home", before_gw=5))
    assert lam_against == pytest.approx(eng.league_baseline("away", before_gw=5))


def test_lambdas_multiplicative_form_home():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=0)
    lam_for, lam_against = eng.lambdas(1, 3, was_home=True, before_gw=4)
    L_home = eng.league_baseline("home", before_gw=4)
    L_away = eng.league_baseline("away", before_gw=4)
    att = eng.rating(1, "home", "att", before_gw=4)
    dfn = eng.rating(3, "away", "def", before_gw=4)
    assert lam_for == pytest.approx(att * dfn / L_home)
    att_o = eng.rating(3, "away", "att", before_gw=4)
    dfn_t = eng.rating(1, "home", "def", before_gw=4)
    assert lam_against == pytest.approx(att_o * dfn_t / L_away)


def test_lambdas_away_is_the_mirror():
    eng = MatchEngine(TF, window=6, alpha=1.0, prior_weight=0)
    f_home = eng.lambdas(1, 3, was_home=True, before_gw=4)
    f_away = eng.lambdas(3, 1, was_home=False, before_gw=4)
    assert f_home[0] == pytest.approx(f_away[1])
    assert f_home[1] == pytest.approx(f_away[0])


def test_p_clean_sheet_is_poisson_zero():
    assert MatchEngine.p_clean_sheet(0.0) == pytest.approx(1.0)
    assert MatchEngine.p_clean_sheet(1.2) == pytest.approx(math.exp(-1.2))
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: FAIL — `AttributeError: ... no attribute 'lambdas'`.

- [ ] **Step 3: Append the implementation** (inside `class MatchEngine`)

```python
    def lambdas(self, team_id: int, opponent_team: int, was_home: bool,
                before_gw: int) -> tuple[float, float]:
        """(lambda_for, lambda_against) for team_id in this fixture. Spec §2:
        home: λ_for = att_home(T)·def_away(O)/L_home ; λ_against = def_home(T)·att_away(O)/L_away
        away is the exact mirror."""
        tv = "home" if was_home else "away"
        ov = "away" if was_home else "home"
        L_t = self.league_baseline(tv, before_gw)
        L_o = self.league_baseline(ov, before_gw)
        lam_for = self.rating(team_id, tv, "att", before_gw) \
            * self.rating(opponent_team, ov, "def", before_gw) / L_t
        lam_against = self.rating(opponent_team, ov, "att", before_gw) \
            * self.rating(team_id, tv, "def", before_gw) / L_o
        return (lam_for, lam_against)

    @staticmethod
    def p_clean_sheet(lambda_against: float) -> float:
        return math.exp(-lambda_against)
```

- [ ] **Step 4: Run to verify pass**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_match_engine.py -q
```

Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
git add model/match_engine.py model/tests/test_match_engine.py
git commit -m "feat(model): independent-Poisson fixture model + clean-sheet probability (#125)"
```

---

### Task 5: v2 feature rows + samples (`features_v2.py`)

**Files:**
- Create: `model/features_v2.py`
- Test: `model/tests/test_features_v2.py`

**Interfaces:**
- Consumes: `MatchEngine` (Tasks 3–4), `exp_decay_mean` from `features.py`, v2 spec constants.
- Produces:
  - `build_feature_row_v2(prior_rows: pd.DataFrame, target_row: pd.Series, engine: MatchEngine) -> dict` — keys = `FEATURE_COLUMNS_V2`
  - `build_samples_v2(history: pd.DataFrame, engine: MatchEngine) -> pd.DataFrame` — columns `FEATURE_COLUMNS_V2 + [player_id, gw, position, target, actual_minutes]` (mirrors v1's `build_samples`)

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_features_v2.py`:

```python
import pandas as pd
import pytest

from feature_spec_v2 import FEATURE_COLUMNS_V2
from features_v2 import build_feature_row_v2, build_samples_v2
from match_engine import MatchEngine, build_team_fixtures


def _hrow(player_id, gw, fixture, team, opp, home, position="MID", minutes=90,
          starts=1, points=5, xg=0.4, value=75):
    return {
        "player_id": player_id, "gw": gw, "fixture_id": fixture,
        "team_id": team, "opponent_team": opp, "was_home": home,
        "position": position, "minutes": minutes, "starts": starts,
        "total_points": points, "expected_goals": xg, "expected_assists": 0.1,
        "expected_goal_involvements": xg + 0.1, "expected_goals_conceded": 1.0,
        "threat": 20.0, "creativity": 10.0, "influence": 15.0, "bps": 20,
        "defensive_contribution": 2, "goals_scored": 0, "value": value,
    }


# GW1+2 history for player 101 (team 1); GW3 is the prediction target.
HISTORY = pd.DataFrame([
    _hrow(101, 1, 10, 1, 2, True, points=8, xg=0.6),
    _hrow(201, 1, 10, 2, 1, False, xg=0.2),
    _hrow(101, 2, 20, 1, 3, False, points=2, xg=0.1),
    _hrow(301, 2, 20, 3, 1, True, xg=0.9),
    _hrow(101, 3, 30, 1, 4, True, points=6, xg=0.5),
    _hrow(401, 3, 30, 4, 1, False, xg=0.3),
])
ENGINE = MatchEngine(build_team_fixtures(HISTORY))


def test_row_has_exactly_the_v2_columns():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    assert set(feat.keys()) == set(FEATURE_COLUMNS_V2)


def test_match_features_come_from_engine_at_target_gw():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    lam_for, lam_against = ENGINE.lambdas(1, 4, was_home=True, before_gw=3)
    assert feat["team_lambda_for"] == pytest.approx(lam_for)
    assert feat["team_lambda_against"] == pytest.approx(lam_against)
    assert feat["p_clean_sheet"] == pytest.approx(MatchEngine.p_clean_sheet(lam_against))


def test_no_xgi_and_no_static_strength_keys():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    assert "form_expected_goal_involvements" not in feat
    assert "opp_strength_def" not in feat


def test_form_and_scalar_features_match_v1_semantics():
    prior = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw < 3)]
    target = HISTORY[(HISTORY.player_id == 101) & (HISTORY.gw == 3)].iloc[0]
    feat = build_feature_row_v2(prior, target, ENGINE)
    # recent-first points [2 (GW2), 8 (GW1)], alpha .85 -> (2 + .85*8)/1.85
    assert feat["form_total_points"] == pytest.approx((2 + 0.85 * 8) / 1.85)
    assert feat["xmin"] == 1.0
    assert feat["was_home"] == 1.0
    assert feat["value_scaled"] == pytest.approx(7.5)


def test_build_samples_v2_skips_first_appearance_and_labels_target():
    samples = build_samples_v2(HISTORY, ENGINE)
    p101 = samples[samples.player_id == 101]
    assert list(p101.gw) == [2, 3]  # GW1 skipped (no prior rows)
    assert float(p101[p101.gw == 3].target.iloc[0]) == 6.0
    assert set(FEATURE_COLUMNS_V2).issubset(samples.columns)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_features_v2.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'features_v2'`.

- [ ] **Step 3: Write the implementation**

Create `model/features_v2.py`:

```python
"""v2.0 feature engineering: v1's player-form machinery (minus xGI) plus the
match-engine features. Pure; no I/O. Mirrored by #128's features-v2.ts."""
from __future__ import annotations

import pandas as pd

from feature_spec_v2 import (
    DECAY_ALPHA_V2,
    FEATURE_COLUMNS_V2,
    FORM_STATS_V2,
    FORM_WINDOW_V2,
    VALUE_SCALE_V2,
)
from features import exp_decay_mean
from match_engine import MatchEngine


def build_feature_row_v2(prior_rows: pd.DataFrame, target_row: pd.Series,
                         engine: MatchEngine) -> dict:
    prior = prior_rows.sort_values(["gw", "fixture_id"], ascending=False).head(FORM_WINDOW_V2)

    feat: dict[str, float] = {}
    for stat in FORM_STATS_V2:
        feat[f"form_{stat}"] = exp_decay_mean(prior[stat].tolist(), alpha=DECAY_ALPHA_V2)

    feat["xmin"] = float(prior["starts"].mean()) if len(prior) else 0.0
    feat["was_home"] = 1.0 if bool(target_row["was_home"]) else 0.0
    feat["value_scaled"] = float(target_row["value"]) / VALUE_SCALE_V2

    lam_for, lam_against = engine.lambdas(
        int(target_row["team_id"]), int(target_row["opponent_team"]),
        bool(target_row["was_home"]), before_gw=int(target_row["gw"]),
    )
    feat["team_lambda_for"] = lam_for
    feat["team_lambda_against"] = lam_against
    feat["p_clean_sheet"] = MatchEngine.p_clean_sheet(lam_against)
    return feat


def build_samples_v2(history: pd.DataFrame, engine: MatchEngine) -> pd.DataFrame:
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue  # need at least one prior gameweek for form features
            feat = build_feature_row_v2(prior, target, engine)
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "target": float(target["total_points"]),
                "actual_minutes": int(target["minutes"]),
            })
            rows.append(feat)
    cols = FEATURE_COLUMNS_V2 + ["player_id", "gw", "position", "target", "actual_minutes"]
    return pd.DataFrame(rows, columns=cols)
```

- [ ] **Step 4: Run to verify pass**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_features_v2.py -q
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add model/features_v2.py model/tests/test_features_v2.py
git commit -m "feat(model): v2 feature rows — form (xGI-free) + match-engine features (#125)"
```

---

### Task 6: Parameterize `fit_models` + v2 training path → `xpts-v2.json`

**Files:**
- Modify: `model/train.py`
- Test: `model/tests/test_train_v2.py` (create)

**Interfaces:**
- Consumes: `build_samples_v2`, `MatchEngine`, v2 spec constants.
- Produces:
  - `fit_models(samples, *, feature_columns=None, model_version=None, decay_alpha=None, form_window=None, scaling=None, extra=None) -> dict` — all-default call = v1 behavior byte-identical.
  - `train_v2(history: pd.DataFrame) -> dict` — the v2 artifact, with a `"rating"` metadata key `{window, alpha, prior_weight, league_xg_prior}` (#128's Deno port reads hyperparams from the artifact, not from code).
  - Running `python train.py --v2` writes `model/artifacts/xpts-v2.json`.

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_train_v2.py`:

```python
import numpy as np
import pandas as pd
import pytest

from feature_spec_v2 import (
    FEATURE_COLUMNS_V2,
    LEAGUE_XG_PRIOR,
    MODEL_VERSION_V2,
    PRIOR_WEIGHT,
    RATING_ALPHA,
    RATING_WINDOW,
)
from train import fit_models, predict, train_v2


def _synthetic_samples(n=400, seed=7):
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(rng.uniform(0, 1, size=(n, len(FEATURE_COLUMNS_V2))),
                      columns=FEATURE_COLUMNS_V2)
    df["position"] = ["MID", "FWD"] * (n // 2)
    df["target"] = 2.0 + 3.0 * df["team_lambda_for"] + rng.normal(0, 0.1, n)
    return df


def test_fit_models_v2_artifact_shape_and_metadata():
    art = fit_models(
        _synthetic_samples(),
        feature_columns=FEATURE_COLUMNS_V2,
        model_version=MODEL_VERSION_V2,
        decay_alpha=0.85, form_window=6,
        scaling={"value_scale": 10.0, "strength_scale": None},
        extra={"rating": {"window": RATING_WINDOW, "alpha": RATING_ALPHA,
                          "prior_weight": PRIOR_WEIGHT,
                          "league_xg_prior": LEAGUE_XG_PRIOR}},
    )
    assert art["model_version"] == "v2.0.0"
    assert art["feature_columns"] == FEATURE_COLUMNS_V2
    assert art["rating"]["window"] == RATING_WINDOW
    assert set(art["coefficients"].keys()) == {"MID", "FWD"}
    assert set(art["coefficients"]["MID"].keys()) == {"0.25", "0.5", "0.75"}
    # every column has a coefficient entry
    assert set(art["coefficients"]["MID"]["0.5"].keys()) == {"const", *FEATURE_COLUMNS_V2}


def test_fit_models_default_call_is_still_v1():
    # v1 regression guard: no kwargs -> v1 metadata exactly as before.
    from feature_spec import FEATURE_COLUMNS, MODEL_VERSION
    df = _synthetic_samples()
    fill_rng = np.random.default_rng(11)  # noise, not constants: constant
    for c in FEATURE_COLUMNS:             # columns make QuantReg singular
        if c not in df.columns:
            df[c] = fill_rng.uniform(0, 1, len(df))
    art = fit_models(df)
    assert art["model_version"] == MODEL_VERSION
    assert art["feature_columns"] == FEATURE_COLUMNS
    assert "rating" not in art


def test_predict_recovers_planted_signal():
    art = fit_models(_synthetic_samples(), feature_columns=FEATURE_COLUMNS_V2,
                     model_version=MODEL_VERSION_V2, decay_alpha=0.85,
                     form_window=6, scaling={}, extra=None)
    row = {c: 0.5 for c in FEATURE_COLUMNS_V2}
    lo = predict(art, {**row, "team_lambda_for": 0.1}, "MID", 0.5)
    hi = predict(art, {**row, "team_lambda_for": 0.9}, "MID", 0.5)
    assert hi - lo == pytest.approx(3.0 * 0.8, abs=0.3)  # planted slope ≈ 3
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_train_v2.py -q
```

Expected: FAIL — `TypeError: fit_models() got an unexpected keyword argument 'feature_columns'` (and `ImportError` for `train_v2`).

- [ ] **Step 3: Modify `model/train.py`**

Replace the `fit_models` function with:

```python
def fit_models(samples: pd.DataFrame, *, feature_columns: list | None = None,
               model_version: str | None = None, decay_alpha: float | None = None,
               form_window: int | None = None, scaling: dict | None = None,
               extra: dict | None = None) -> dict:
    # Defaults = the frozen v1 contract; v2 passes its own spec explicitly.
    feature_columns = feature_columns if feature_columns is not None else FEATURE_COLUMNS
    model_version = model_version if model_version is not None else MODEL_VERSION
    decay_alpha = decay_alpha if decay_alpha is not None else DECAY_ALPHA
    form_window = form_window if form_window is not None else FORM_WINDOW
    scaling = scaling if scaling is not None else {
        "value_scale": VALUE_SCALE, "strength_scale": STRENGTH_SCALE,
    }

    coefficients: dict[str, dict] = {}
    for pos in POSITIONS:
        pos_df = samples[samples["position"] == pos]
        if len(pos_df) <= len(feature_columns) + 1:
            continue  # too few rows to fit; serving falls back to ep_next
        X = sm.add_constant(pos_df[feature_columns], has_constant="add")
        y = pos_df["target"]
        coefficients[pos] = {}
        for q in QUANTILES:
            res = sm.QuantReg(y, X).fit(q=q)
            params = res.params
            entry = {"const": float(params.get("const", 0.0))}
            for c in feature_columns:
                entry[c] = float(params.get(c, 0.0))
            coefficients[pos][_qkey(q)] = entry
    artifact = {
        "model_version": model_version,
        "feature_columns": feature_columns,
        "decay_alpha": decay_alpha,
        "form_window": form_window,
        "scaling": scaling,
        "coefficients": coefficients,
    }
    if extra:
        artifact.update(extra)
    return artifact
```

Append after `save_artifact`:

```python
def train_v2(history: pd.DataFrame) -> dict:
    """Fit the v2.0 artifact: match-engine features + xGI-free form."""
    from feature_spec_v2 import (
        DECAY_ALPHA_V2, FEATURE_COLUMNS_V2, FORM_WINDOW_V2, LEAGUE_XG_PRIOR,
        MODEL_VERSION_V2, PRIOR_WEIGHT, RATING_ALPHA, RATING_WINDOW, VALUE_SCALE_V2,
    )
    from features_v2 import build_samples_v2
    from match_engine import MatchEngine, build_team_fixtures

    engine = MatchEngine(build_team_fixtures(history))
    samples = build_samples_v2(history, engine)
    return fit_models(
        samples,
        feature_columns=FEATURE_COLUMNS_V2,
        model_version=MODEL_VERSION_V2,
        decay_alpha=DECAY_ALPHA_V2,
        form_window=FORM_WINDOW_V2,
        scaling={"value_scale": VALUE_SCALE_V2},
        extra={"rating": {"window": RATING_WINDOW, "alpha": RATING_ALPHA,
                          "prior_weight": PRIOR_WEIGHT,
                          "league_xg_prior": LEAGUE_XG_PRIOR}},
    )
```

Replace the `__main__` block with:

```python
if __name__ == "__main__":
    import sys

    from data import load_history, load_team_strengths
    from features import build_samples

    history = load_history()
    if "--v2" in sys.argv:
        artifact = train_v2(history)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v2.json")
        save_artifact(artifact, out)
        print(f"[train] v2: {len(artifact['coefficients'])} position models -> {out}")
    else:
        strengths = load_team_strengths()
        samples = build_samples(history, strengths)
        artifact = fit_models(samples)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v1.json")
        save_artifact(artifact, out)
        print(f"[train] {len(samples)} samples, "
              f"{len(artifact['coefficients'])} position models -> {out}")
```

- [ ] **Step 4: Run the FULL model suite (v1 regression guard included)**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest -q
```

Expected: PASS — all suites, including the pre-existing `test_train.py` (which proves the v1 path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add model/train.py model/tests/test_train_v2.py
git commit -m "feat(model): parameterize fit_models + v2 training path (#125)"
```

---

### Task 7: `backtest_v2.py` — walk-forward with ablation, evaluation, hot-streak diagnostic

**Files:**
- Create: `model/backtest_v2.py`
- Test: `model/tests/test_backtest_v2.py`

**Interfaces:**
- Consumes: everything above, plus v1's `build_samples`/`build_feature_row` (ablation variant a) and `baseline_form`.
- Produces:
  - `walk_forward_v2(history, team_strengths, start_gw=8, end_gw=38) -> pd.DataFrame` — per (player, gw): `actual, p50_v1, p50_v1m, p25, p50, p75, base_form, xmin, position, hot3`
  - `evaluate_v2(results, min_xmin=0.5) -> dict` — MAEs/captaincy/coverage/spearman for all variants + gate booleans + `hot_streak` sub-dict
  - `engine_metrics(team_fixtures, start_gw=8, ...) -> dict` — CS Brier + per-match xG MAE, dynamic vs static baseline
  - `write_report_v2(metrics, engine_m, path)` — replaces/appends the `<!-- xpts-v2-results -->` section of `docs/xpts-model.md`

- [ ] **Step 1: Write the failing tests** (pure parts only — the real run is Task 8)

Create `model/tests/test_backtest_v2.py`:

```python
import pandas as pd
import pytest

from backtest_v2 import evaluate_v2, hot3_points, engine_metrics
from match_engine import MatchEngine


def test_hot3_points_sums_last_three_prior_gws_only():
    h = pd.DataFrame([
        {"player_id": 1, "gw": g, "fixture_id": g, "total_points": p}
        for g, p in [(1, 10), (2, 2), (3, 3), (4, 4), (5, 5)]
    ])
    assert hot3_points(h, player_id=1, gw=5) == 2 + 3 + 4   # gws 2..4
    assert hot3_points(h, player_id=1, gw=2) == 10          # only gw1 exists
    assert hot3_points(h, player_id=9, gw=5) == 0           # unknown player


def _results():
    rows = []
    for i in range(40):
        actual = float(i % 10)
        rows.append({
            "player_id": i, "gw": 8 + (i % 4), "position": "MID",
            "actual": actual,
            "p50_v1": actual + 1.0,          # v1 off by 1
            "p50_v1m": actual + 0.7,
            "p50": actual + 0.5,             # v2 off by 0.5 -> beats v1
            "p25": actual - 1.0, "p75": actual + 1.0,
            "base_form": actual + 2.0,
            "xmin": 1.0,
            "hot3": 30.0 if i < 4 else 5.0,  # 4 hot players (top decile)
        })
    return pd.DataFrame(rows)


def test_evaluate_v2_gate_and_ablation():
    m = evaluate_v2(_results())
    assert m["v2_mae"] == pytest.approx(0.5)
    assert m["v1_mae"] == pytest.approx(1.0)
    assert m["v1m_mae"] == pytest.approx(0.7)
    assert m["beats_v1_mae"] is True
    assert m["coverage"] == pytest.approx(1.0)  # ±1 interval always contains
    assert m["coverage_ok"] is False            # 1.0 is NOT within 0.5±0.1
    assert m["passes_gate"] is False            # coverage fails -> gate fails


def test_evaluate_v2_hot_streak_signed_error():
    m = evaluate_v2(_results())
    # hot slice = the 4 rows with hot3=30; v2 signed error = +0.5 on each
    assert m["hot_streak"]["n"] == 4
    assert m["hot_streak"]["v2_signed_error"] == pytest.approx(0.5)
    assert m["hot_streak"]["base_form_signed_error"] == pytest.approx(2.0)


def _tf_row(team, opp, gw, fixture, home, xg_for, xg_against, gf, ga):
    return {"fixture_id": fixture, "team_id": team, "opponent_team": opp,
            "gw": gw, "was_home": home, "xg_for": xg_for, "xg_against": xg_against,
            "goals_for": gf, "goals_against": ga}


def test_engine_metrics_scores_prediction_vs_actuals():
    # 8 prior GWs of identical matches, then GW9 to score.
    rows = []
    for gw in range(1, 9):
        rows.append(_tf_row(1, 2, gw, gw * 10, True, 1.4, 1.4, 1, 1))
        rows.append(_tf_row(2, 1, gw, gw * 10, False, 1.4, 1.4, 1, 1))
    rows.append(_tf_row(1, 2, 9, 90, True, 2.0, 0.0, 2, 0))   # team 1 CS
    rows.append(_tf_row(2, 1, 9, 90, False, 0.0, 2.0, 0, 2))
    tf = pd.DataFrame(rows)
    static = {1: {"strength_attack_home": 1200, "strength_attack_away": 1100,
                  "strength_defence_home": 1200, "strength_defence_away": 1100},
              2: {"strength_attack_home": 1000, "strength_attack_away": 1000,
                  "strength_defence_home": 1000, "strength_defence_away": 1000}}
    m = engine_metrics(tf, static, start_gw=9)
    assert m["n_team_fixtures"] == 2
    assert 0.0 <= m["cs_brier"] <= 1.0
    assert m["xg_mae"] >= 0.0
    assert "cs_brier_static" in m and "xg_mae_static" in m
```

- [ ] **Step 2: Run to verify failure**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_backtest_v2.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'backtest_v2'`.

- [ ] **Step 3: Write the implementation**

Create `model/backtest_v2.py`:

```python
"""Walk-forward backtest for xPts v2.0 (#125): ablation (v1 / v1+match / v2),
the gate, standalone match-engine metrics, and the hot-streak diagnostic.
Writes/replaces a v2 section in docs/xpts-model.md."""
from __future__ import annotations

import math
import os

import pandas as pd

from baselines import baseline_form
from feature_spec import FEATURE_COLUMNS, MODEL_VERSION
from feature_spec_v2 import FEATURE_COLUMNS_V2, MODEL_VERSION_V2
from features import build_feature_row, build_samples
from features_v2 import build_feature_row_v2, build_samples_v2
from match_engine import MatchEngine, build_team_fixtures
from metrics import captaincy_points, interval_coverage, mae, within_position_spearman
from train import fit_models, predict, train_v2

# Ablation variant (b): v1's columns + the three match features.
FEATURE_COLUMNS_V1M = FEATURE_COLUMNS + [
    "team_lambda_for", "team_lambda_against", "p_clean_sheet",
]

REPORT_MARKER = "<!-- xpts-v2-results -->"


def hot3_points(history: pd.DataFrame, player_id: int, gw: int) -> float:
    """Sum of the player's actual points over gws [gw-3, gw-1]."""
    rows = history[(history["player_id"] == player_id)
                   & (history["gw"] >= gw - 3) & (history["gw"] < gw)]
    return float(rows["total_points"].sum()) if len(rows) else 0.0


def walk_forward_v2(history: pd.DataFrame, team_strengths: dict,
                    start_gw: int = 8, end_gw: int = 38,
                    rating_params: dict | None = None) -> pd.DataFrame:
    """rating_params: optional MatchEngine overrides ({window, alpha,
    prior_weight}) — the grid runner's hook; defaults = the frozen spec."""
    tf = build_team_fixtures(history)
    engine = MatchEngine(tf, **(rating_params or {}))  # before_gw threading -> leakage-safe
    out_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        s_v2 = build_samples_v2(past, engine)
        if len(s_v1) == 0 or len(s_v2) == 0:
            continue
        # variant (b): v2 samples carry the match features; merge in v1's
        # static-strength columns so one frame serves both v1m fits.
        # KNOWN APPROXIMATION: neither samples frame carries fixture_id, so a
        # DGW's two per-fixture rows get variant-b statics from the first v1
        # row. Affects only the diagnostic ablation variant on DGW rows.
        s_v1m = s_v2.merge(
            s_v1[["player_id", "gw", "opp_strength_def", "opp_strength_att",
                  "form_expected_goal_involvements"]].drop_duplicates(["player_id", "gw"]),
            on=["player_id", "gw"], how="inner",
        )
        art_v1 = fit_models(s_v1)
        art_v1m = fit_models(s_v1m, feature_columns=FEATURE_COLUMNS_V1M,
                             model_version="v1m", decay_alpha=None,
                             form_window=None, scaling={}, extra=None)
        art_v2 = fit_models(s_v2, feature_columns=FEATURE_COLUMNS_V2,
                            model_version=MODEL_VERSION_V2, decay_alpha=None,
                            form_window=None, scaling={}, extra=None)

        for _, target in history[history["gw"] == t].iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            pos = target["position"]
            f1 = build_feature_row(prior, target, team_strengths)
            f2 = build_feature_row_v2(prior, target, engine)
            f1m = {**f2, "opp_strength_def": f1["opp_strength_def"],
                   "opp_strength_att": f1["opp_strength_att"],
                   "form_expected_goal_involvements": f1["form_expected_goal_involvements"]}
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p50_v1m": predict(art_v1m, f1m, pos, 0.50),
                "p25": predict(art_v2, f2, pos, 0.25),
                "p50": predict(art_v2, f2, pos, 0.50),
                "p75": predict(art_v2, f2, pos, 0.75),
                "base_form": baseline_form(prior),
                "xmin": f2["xmin"],
                "hot3": hot3_points(history, pid, t),
            })
    df = pd.DataFrame(out_rows)
    if df.empty:
        return df
    agg = {"actual": "sum", "p50_v1": "sum", "p50_v1m": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
    return df.groupby(["player_id", "gw"], as_index=False).agg(agg)


def evaluate_v2(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae, v1m_mae, v2_mae = (mae(df[c], df["actual"]) for c in ("p50_v1", "p50_v1m", "p50"))
    v1_cap = captaincy_points(df, "p50_v1")
    v2_cap = captaincy_points(df, "p50")
    coverage = interval_coverage(df, "p25", "p75")
    beats_mae = v2_mae < v1_mae
    cap_ok = v2_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]
    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v1m_mae": v1m_mae, "v2_mae": v2_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v2_captaincy": v2_cap,
        "v2_spearman": within_position_spearman(df, "p50"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "hot_streak": {
            "n": int(len(hot)),
            "v2_signed_error": float((hot["p50"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def _static_lambda(team: int, opp: int, was_home: bool, static: dict, L: float) -> float:
    """Static-strengths baseline in the same multiplicative form: attack index
    of the team at its venue x inverse defence index of the opponent."""
    t, o = static.get(team), static.get(opp)
    if not t or not o:
        return L
    s_att = t["strength_attack_home" if was_home else "strength_attack_away"]
    s_def = o["strength_defence_away" if was_home else "strength_defence_home"]
    mean_att = sum(
        v["strength_attack_home" if was_home else "strength_attack_away"]
        for v in static.values()
    ) / len(static)
    mean_def = sum(
        v["strength_defence_away" if was_home else "strength_defence_home"]
        for v in static.values()
    ) / len(static)
    return L * (s_att / mean_att) * (mean_def / s_def)


def engine_metrics(team_fixtures: pd.DataFrame, static: dict,
                   start_gw: int = 8) -> dict:
    """Standalone engine quality: predicted lambda vs actual match xG (MAE) and
    p_clean_sheet vs actual CS (Brier), dynamic vs the static baseline."""
    engine = MatchEngine(team_fixtures)
    rows = team_fixtures[team_fixtures["gw"] >= start_gw]
    xg_err, xg_err_s, briers, briers_s = [], [], [], []
    for _, r in rows.iterrows():
        lam_for, lam_against = engine.lambdas(
            int(r["team_id"]), int(r["opponent_team"]), bool(r["was_home"]),
            before_gw=int(r["gw"]),
        )
        # League means per venue: the team's goals live in its venue's units,
        # the opponent's (what the team concedes) in the opposite venue's.
        L_t = engine.league_baseline("home" if r["was_home"] else "away", int(r["gw"]))
        L_o = engine.league_baseline("away" if r["was_home"] else "home", int(r["gw"]))
        lam_s_against = _static_lambda(int(r["opponent_team"]), int(r["team_id"]),
                                       not bool(r["was_home"]), static, L_o)
        cs_actual = 1.0 if r["goals_against"] == 0 else 0.0
        xg_err.append(abs(lam_for - float(r["xg_for"])))
        xg_err_s.append(abs(
            _static_lambda(int(r["team_id"]), int(r["opponent_team"]),
                           bool(r["was_home"]), static, L_t) - float(r["xg_for"])))
        briers.append((math.exp(-lam_against) - cs_actual) ** 2)
        briers_s.append((math.exp(-lam_s_against) - cs_actual) ** 2)
    n = len(xg_err)
    return {
        "n_team_fixtures": n,
        "xg_mae": sum(xg_err) / n if n else 0.0,
        "xg_mae_static": sum(xg_err_s) / n if n else 0.0,
        "cs_brier": sum(briers) / n if n else 0.0,
        "cs_brier_static": sum(briers_s) / n if n else 0.0,
    }


def write_report_v2(metrics: dict, engine_m: dict, path: str) -> None:
    verdict = "✅ PASS — proceed to shadow serving (#128)" if metrics["passes_gate"] \
        else "❌ FAIL — documented finding; do NOT wire shadow serving"
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER}

# xPts model — v2.0 results (match engine)

**Model version:** `{MODEL_VERSION_V2}` · gate vs v1 (`{MODEL_VERSION}`) on the same
walk-forward (2025/26, GW 8→38, eval among xmin ≥ 0.5; n = {metrics['n_eval']}).
Spec: `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md`.

## Ablation (MAE, lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.3f} |
| (b) v1 + match features | {metrics['v1m_mae']:.3f} |
| (c) full v2 (xGI + static strengths dropped) | {metrics['v2_mae']:.3f} |
| exp-decay form baseline | {metrics['base_form_mae']:.3f} |

Captaincy: v2 {metrics['v2_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: v2 {metrics['v2_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).

## Match-engine standalone ({engine_m['n_team_fixtures']} team-fixtures)

| metric | dynamic ratings | static strengths |
|--------|-----------------|------------------|
| per-match xG MAE | {engine_m['xg_mae']:.3f} | {engine_m['xg_mae_static']:.3f} |
| clean-sheet Brier | {engine_m['cs_brier']:.3f} | {engine_m['cs_brier_static']:.3f} |

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): v2 {hs['v2_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.
Positive = over-prediction of hot players; the xG-form design should keep v2's
value near the form baseline's or better (regression to the mean).

## Gate

- v2 beats v1 on MAE: **{metrics['beats_v1_mae']}**
- v2 captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if REPORT_MARKER in content:
        content = content[: content.index(REPORT_MARKER)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    history = load_history()
    strengths = load_team_strengths()
    results = walk_forward_v2(history, strengths)
    metrics = evaluate_v2(results)
    static = {k: v for k, v in strengths.items()}
    engine_m = engine_metrics(build_team_fixtures(history), static)
    out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "docs", "xpts-model.md"))
    write_report_v2(metrics, engine_m, out)
    print(f"[backtest-v2] n={metrics['n_eval']} v1={metrics['v1_mae']:.3f} "
          f"v1m={metrics['v1m_mae']:.3f} v2={metrics['v2_mae']:.3f} "
          f"cap {metrics['v2_captaincy']:.0f} vs {metrics['v1_captaincy']:.0f} "
          f"cov={metrics['coverage']:.3f} PASS={metrics['passes_gate']}")
```

- [ ] **Step 4: Run to verify pass**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_backtest_v2.py -q
```

Expected: PASS — 4 tests. Then the full suite: `PYTHONPATH=. pytest -q` — all green.

- [ ] **Step 5: Commit**

```bash
git add model/backtest_v2.py model/tests/test_backtest_v2.py
git commit -m "feat(model): v2 walk-forward backtest — ablation, engine metrics, hot-streak, gate (#125)"
```

---

### Task 8: Freeze `LEAGUE_XG_PRIOR` + first real backtest run (DB required)

**Files:**
- Modify: `model/feature_spec_v2.py` (freeze the constant)
- Modify: `docs/xpts-model.md` (v2 section appended by the run)

- [ ] **Step 1: Verify the local stack + data**

```bash
supabase start   # if not already up
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select count(*) from public.player_gw_history where season = '2025/26';"
```

Expected: a count in the ~20–26k range. If 0, stop — the 2025/26 backfill must be restored first (see `model/README.md` / Plan-1-era backfill script); this task cannot proceed without it.

- [ ] **Step 2: Compute and freeze the league prior**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select round(avg(xg), 4) from (
     select fixture_id, team_id, sum(expected_goals) as xg
     from public.player_gw_history where season = '2025/26'
     group by fixture_id, team_id) t;"
```

Take the printed value (expected ≈ 1.2–1.6) and set it in `model/feature_spec_v2.py`:

```python
LEAGUE_XG_PRIOR = <printed value>  # frozen from the 2025/26 mean (Task 8)
```

Run the spec test to confirm the sanity bound still holds:

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_feature_spec_v2.py -q
```

- [ ] **Step 3: Run the backtest (initial hyperparams)**

```bash
cd model && source .venv/bin/activate && python backtest_v2.py
```

Expected: a `[backtest-v2] ...` summary line and a new v2 section in `docs/xpts-model.md`. Note the v2 MAE — Task 9 must beat or match it. Runtime: tens of minutes (31 GWs × 3 variants × 12 QuantReg fits).

- [ ] **Step 4: Commit**

```bash
git add model/feature_spec_v2.py docs/xpts-model.md
git commit -m "feat(model): freeze LEAGUE_XG_PRIOR + first v2 backtest run (#125)"
```

---

### Task 9: Hyperparameter grid → freeze → final artifact + backtest

**Files:**
- Create: `model/grid_v2.py`
- Modify: `model/feature_spec_v2.py` (freeze chosen values)
- Modify: `docs/xpts-model.md` (final run), Create: `model/artifacts/xpts-v2.json`

- [ ] **Step 1: Write the grid runner**

Create `model/grid_v2.py`:

```python
"""Small documented grid over the rating hyperparams (spec §2), selected by
walk-forward MAE of the full v2 variant. Run once; freeze the winner into
feature_spec_v2.py. GRID=quick runs a single config as a smoke test.

NOTE: hyperparams are passed via walk_forward_v2(rating_params=...) — never by
patching module constants (MatchEngine's defaults bind at definition time, so
patching feature_spec_v2/match_engine attributes would silently do nothing)."""
from __future__ import annotations

import itertools
import os

from backtest_v2 import evaluate_v2, walk_forward_v2
from data import load_history, load_team_strengths

GRID = {
    "window": [6, 10, 19],
    "alpha": [0.8, 0.9, 1.0],
    "prior_weight": [2, 4],
}


def main() -> None:
    history = load_history()
    strengths = load_team_strengths()
    combos = [{"window": 10, "alpha": 0.9, "prior_weight": 4}] \
        if os.environ.get("GRID") == "quick" else [
            dict(zip(GRID, vals)) for vals in itertools.product(*GRID.values())
        ]
    results = []
    for combo in combos:
        m = evaluate_v2(walk_forward_v2(history, strengths, rating_params=combo))
        results.append((combo, m["v2_mae"], m["v2_captaincy"]))
        print(f"[grid] {combo} -> MAE {m['v2_mae']:.4f} cap {m['v2_captaincy']:.0f}")
    best = min(results, key=lambda r: r[1])
    print(f"[grid] BEST: {best[0]} MAE {best[1]:.4f} cap {best[2]:.0f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test the runner, then run the full grid**

```bash
cd model && source .venv/bin/activate
GRID=quick python grid_v2.py        # one config, sanity
python grid_v2.py                    # full 18 configs — LONG (hours); run detached
```

Expected: 18 `[grid] ...` lines + a `BEST:` line.

- [ ] **Step 3: Freeze the winner + retrain + final backtest**

Set the winning `RATING_WINDOW` / `RATING_ALPHA` / `PRIOR_WEIGHT` in `model/feature_spec_v2.py` (update the comment to say "frozen by Task 9 grid"), then:

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest -q   # specs/tests still green
python train.py --v2                                              # -> artifacts/xpts-v2.json
python backtest_v2.py                                             # final report with frozen params
```

Expected: artifact written; report regenerated; note the **gate verdict** in the output.

- [ ] **Step 4: Commit**

```bash
git add model/grid_v2.py model/feature_spec_v2.py model/artifacts/xpts-v2.json docs/xpts-model.md
git commit -m "feat(model): grid-selected rating hyperparams + v2 artifact + gate verdict (#125)"
```

---

### Task 10: Parity fixture v2 section + final verification + PR

**Files:**
- Modify: `model/emit_parity_fixture.py`
- Modify: `model/artifacts/parity-fixture.json` (regenerated)

**Interfaces:**
- Produces: `parity-fixture.json` gains a top-level `"v2"` key — `{model_version, cases: [{team_fixtures, prior_rows, target, expected_features, expected: {p25,p50,p75}}]}` — while the v1 `cases` stay byte-compatible (the existing Deno test keeps passing). #128's Deno tests will assert this chain to 1e-6.

- [ ] **Step 1: Extend the emitter**

In `model/emit_parity_fixture.py`, add after the imports:

```python
from feature_spec_v2 import FEATURE_COLUMNS_V2, MODEL_VERSION_V2
from features_v2 import build_feature_row_v2
from match_engine import MatchEngine, build_team_fixtures

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
```

In `main()`, change the output dict line from:

```python
    out = {"model_version": MODEL_VERSION, "cases": cases}
```
to:
```python
    out = {"model_version": MODEL_VERSION, "cases": cases, "v2": build_v2_cases()}
```

(Note: `_prior(pos)` DataFrames lack `expected_goal_involvements`? They include it — v1 needs it. `build_feature_row_v2` simply ignores it: `FORM_STATS_V2` never reads that column. No change needed.)

- [ ] **Step 2: Regenerate and eyeball**

```bash
cd model && source .venv/bin/activate && python emit_parity_fixture.py
python - <<'EOF'
import json
fx = json.load(open("artifacts/parity-fixture.json"))
assert "cases" in fx and len(fx["cases"]) == 4          # v1 untouched
assert "v2" in fx and len(fx["v2"]["cases"]) == 4
assert "team_history" in fx["v2"]
print("v2 parity block OK:", [c["position"] for c in fx["v2"]["cases"]])
EOF
```

Expected: `v2 parity block OK: ['GKP', 'DEF', 'MID', 'FWD']`.

- [ ] **Step 3: Full suite + the v1-Deno cross-check**

```bash
cd model && source .venv/bin/activate && PYTHONPATH=. pytest -q
cd ../supabase/functions/fpl-project && deno test
```

Expected: pytest all green; the existing Deno parity test **still passes** against the regenerated fixture (proving the v1 block is byte-compatible). Do NOT copy `xpts-v2.json` into the function dir yet — that's #128's first task.

- [ ] **Step 4: Commit, push, PR**

```bash
git add model/emit_parity_fixture.py model/artifacts/parity-fixture.json
git commit -m "feat(model): v2 parity-fixture block — ratings chain golden cases (#125)"
git push -u origin feat/xpts-v2-engine
gh pr create --title "feat(model): xPts v2.0 match engine + training + backtest gate (#125)" --body "$(cat <<'EOF'
## Summary
- Dynamic venue-split team ratings (exp-decay + shrinkage) + independent-Poisson fixture model, aggregated from our own player_gw_history
- v2 quantile regression on match features; drops xGI (collinearity) + static strengths (superseded)
- Walk-forward gate vs v1 with ablation, standalone engine metrics, hot-streak diagnostic — verdict in docs/xpts-model.md
- xpts-v2.json artifact (self-describing: rating hyperparams embedded) + v2 parity-fixture block for #128's Deno port
- Python model/ toolchain only — no deploy, no client changes, v1 path byte-identical (guarded by existing tests)

Part 2 of #107. Spec: docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md §2.
Gate verdict decides whether #128 (shadow serving) proceeds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (spec §2 coverage)

- Team-xG aggregation from own history → Task 2 ✓
- Venue-split decayed ratings + shrinkage + promoted-team k=0 → Task 3 ✓
- League baselines season-to-date, shrunk to `LEAGUE_XG_PRIOR` (frozen from 2025/26) → Tasks 3, 8 ✓
- Poisson λs, `p_clean_sheet`, league-average invariant test → Task 4 ✓
- v2 feature set (xGI dropped, static strengths dropped, order = serving contract) → Tasks 1, 5 ✓
- Two artifacts / parallel specs, v1 frozen, self-describing v2 artifact → Tasks 1, 6 ✓
- Hyperparam grid by walk-forward MAE, frozen values → Task 9 ✓
- Gate + ablation (a/b/c) + standalone engine metrics + hot-streak diagnostic (§2 (c)) → Task 7–9 ✓
- Extended parity fixture (raw rows → ratings → λs → features → scores) → Task 10 ✓
- Retrain-recopy invariant: NOT exercised here (copying into the function dir is #128 Task 1) — noted in Task 10 ✓
- No-leakage constraint: `before_gw` threading + `test_rating_uses_only_prior_gws_no_leakage` ✓
