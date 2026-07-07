# xPts v3 Event Decomposition (#129) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generative Monte Carlo simulator (minutes hurdle × match engine × per-player
event rates → FPL points table) and run its pre-registered walk-forward gate vs v1.

**Architecture:** Four new pure-Python modules in `model/` — `feature_spec_v3.py` (constants) +
`points_rules.py` (the verified points table, scalar + vectorized), `rates_v3.py` (walk-forward
exp-decay per-player rates with position-prior fallbacks), `simulate_v3.py` (the vectorized
N-draw simulator), `backtest_v3.py` (walk-forward + gate + report). The match engine
(`match_engine.py`) and minutes model (`minutes_model.py`) are consumed **unchanged**.

**Tech Stack:** Python 3 (venv at `model/.venv`), pandas/numpy/scipy/statsmodels, pytest.
Spec: `docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md`.

## Global Constraints

- Branch: `feat/xpts-v3-decomposition` (spec commits `8d8e289`/`b660b39` already on it). PR #142
  is merged; `model/data/player_gw_history_2025-26.csv.gz` must exist on the branch.
- **The §2 registration is FROZEN**: PRIMARY = pure v3, point estimate = **simulated mean**;
  SECONDARY = 50/50 Vincentized blend with v1 (`p_k_ens = 0.5·(p_k_v3 + p_k_v1)`, point estimate
  `0.5·(mean_v3 + p50_v1)`); gate per candidate = MAE < in-run v1 AND captaincy ≥ in-run v1 AND
  |coverage(p25,p75) − 0.50| ≤ 0.10; eval population `xmin ≥ 0.5`; walk-forward 2025/26 GW 8→38;
  `N_SIMS = 8000`, `V3_SEED_BASE = 20260706`. No other gate-eligible variants.
- **Frozen modules — do not edit:** `match_engine.py`, `minutes_model.py`, `train.py`,
  `features.py`, `features_v2.py`, `features_v21.py`, `feature_spec*.py` (existing ones),
  `data.py` except the one `_HISTORY_COLUMNS` change in Task 1, `backtest.py`, `backtest_v2.py`,
  `backtest_v21.py` (except the one new test in Task 5), `backtest_aug.py` (except the one guard
  in Task 5).
- **NEVER run `backtest.py` / `backtest_v2.py` / `backtest_v21.py` / `backtest_aug.py` as
  `__main__`** — each report writer truncates `docs/xpts-model.md` from its own marker to EOF and
  would delete every later section.
- Tests: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model &&
  .venv/bin/python -m pytest tests/ -q`. The venv is `model/.venv` (NOT `venv`). `model/` is
  excluded from npm/tsc/expo tooling — do not run repo JS tooling for this plan.
- No serving, Deno, client, or migration changes anywhere in this plan.
- Conventional commits (`feat(model): …`, `test(model): …`, `docs: …`).
- Use absolute paths in every shell command (the persistent shell's cwd drifts).

---

### Task 1: Constants + points rules + snapshot regression test + data plumbing

**Files:**
- Create: `model/feature_spec_v3.py`
- Create: `model/points_rules.py`
- Create: `model/tests/test_points_rules.py`
- Modify: `model/data.py` (extend `_HISTORY_COLUMNS`)
- Modify: `model/tests/conftest.py` (add missing columns to `synthetic_history`)

**Interfaces:**
- Consumes: `model/data/player_gw_history_2025-26.csv.gz` (committed snapshot, has all columns).
- Produces: every constant listed below (later tasks import them verbatim);
  `recompute_total_points(df: pd.DataFrame) -> pd.Series` (int);
  `score_draws(position: str, ev: dict[str, np.ndarray]) -> np.ndarray` (int64 array) where `ev`
  holds equal-length arrays: `played, full, goals, assists, gc_on, cs, saves, pen_saved,
  pen_missed, yellow, red, own_goals, dc_hit, bonus`.

- [ ] **Step 1: Write `model/feature_spec_v3.py`**

```python
"""Single source of truth for the xPts v3 simulator contract (#129).

Per-player rate constants, simulator constants, and FPL's points table.
The points values are empirically verified against the full 2025/26 season
(0 mismatches on 29,747 rows — PR #142); the GKP goal value is the one
unexercised cell (no GKP scored in 2025/26; 10 is the rule-book value).
Spec: docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md.
"""

MODEL_VERSION_V3 = "v3"
MODEL_VERSION_V3_ENS = "v3-ens"

# Per-player exp-decay rates (spec §3b): last RATE_WINDOW *played* prior rows.
RATE_WINDOW = 6
RATE_ALPHA = 0.85
MIN_DECAYED_MINUTES = 60.0  # below this, fall back to the position prior
BONUS_PSEUDO = 2.0          # pseudo-observations of the position bonus dist

# Simulator (spec §3d).
N_SIMS = 8000
V3_SEED_BASE = 20260706
M_PART = 30.0               # representative minutes, 1-59' bucket
M_FULL = 85.0               # representative minutes, 60+' bucket
LAMBDA_CAP = 3.0            # cap on final goal-scale component lambdas
SAVES_LAMBDA_CAP = 8.0      # keepers average ~3 saves/match; 3.0 would bind

# Points table (spec §3e) — verified against 2025/26.
GOAL_POINTS = {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4}
CS_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
ASSIST_POINTS = 3
APPEARANCE_POINT = 1        # any minutes
FULL_APPEARANCE_POINT = 1   # additional at 60+
GC_PER_2_POINTS = -1        # GKP/DEF only
SAVES_PER_3_POINTS = 1
PEN_SAVE_POINTS = 5
PEN_MISS_POINTS = -2
YELLOW_POINTS = -1
RED_POINTS = -3
OWN_GOAL_POINTS = -2
DC_POINTS = 2
DC_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12}  # GKP not DC-eligible
```

- [ ] **Step 2: Write the failing tests — `model/tests/test_points_rules.py`**

```python
"""Points-table tests: hand-built rows per component branch, score_draws on
tiny arrays, and the full-snapshot regression (the committed 2025/26 CSV —
the table can never silently rot)."""
import os

import numpy as np
import pandas as pd
import pytest

from points_rules import recompute_total_points, score_draws

SNAPSHOT = os.path.join(os.path.dirname(__file__), "..", "data",
                        "player_gw_history_2025-26.csv.gz")


def row(**over) -> dict:
    base = {
        "position": "MID", "minutes": 90, "goals_scored": 0, "assists": 0,
        "clean_sheets": 0, "goals_conceded": 0, "bonus": 0, "saves": 0,
        "penalties_saved": 0, "penalties_missed": 0, "yellow_cards": 0,
        "red_cards": 0, "own_goals": 0, "defensive_contribution": 0,
    }
    base.update(over)
    return base


def recompute_one(**over) -> int:
    return int(recompute_total_points(pd.DataFrame([row(**over)])).iloc[0])


def test_appearance_only():
    assert recompute_one(minutes=90) == 2
    assert recompute_one(minutes=45) == 1
    assert recompute_one(minutes=0) == 0


def test_goal_values_by_position():
    assert recompute_one(position="FWD", goals_scored=2) == 2 + 8
    assert recompute_one(position="MID", goals_scored=1) == 2 + 5
    assert recompute_one(position="DEF", goals_scored=1) == 2 + 6
    assert recompute_one(position="GKP", goals_scored=1) == 2 + 10


def test_clean_sheet_needs_60_and_position_value():
    assert recompute_one(position="DEF", clean_sheets=1) == 2 + 4
    assert recompute_one(position="MID", clean_sheets=1) == 2 + 1
    assert recompute_one(position="FWD", clean_sheets=1) == 2 + 0
    assert recompute_one(position="DEF", clean_sheets=1, minutes=59) == 1  # no CS < 60'


def test_gc_saves_pens_cards_og():
    assert recompute_one(position="GKP", goals_conceded=3) == 2 - 1
    assert recompute_one(position="MID", goals_conceded=3) == 2  # MID: no GC penalty
    assert recompute_one(position="GKP", saves=7) == 2 + 2
    assert recompute_one(position="GKP", penalties_saved=1) == 2 + 5
    assert recompute_one(position="FWD", penalties_missed=1) == 2 - 2
    assert recompute_one(yellow_cards=1, red_cards=1) == 2 - 4
    assert recompute_one(own_goals=1) == 2 - 2


def test_dc_thresholds():
    assert recompute_one(position="DEF", defensive_contribution=10) == 2 + 2
    assert recompute_one(position="DEF", defensive_contribution=9) == 2
    assert recompute_one(position="MID", defensive_contribution=12) == 2 + 2
    assert recompute_one(position="MID", defensive_contribution=11) == 2
    assert recompute_one(position="GKP", defensive_contribution=99) == 2  # not eligible


def test_score_draws_hand_case():
    ev = {
        "played": np.array([True, True, False]),
        "full": np.array([True, False, False]),
        "goals": np.array([1, 0, 0]),
        "assists": np.array([0, 1, 0]),
        "gc_on": np.array([0, 2, 0]),
        "cs": np.array([1, 0, 0]),
        "saves": np.array([0, 0, 0]),
        "pen_saved": np.array([0, 0, 0]),
        "pen_missed": np.array([0, 0, 0]),
        "yellow": np.array([0, 1, 0]),
        "red": np.array([0, 0, 0]),
        "own_goals": np.array([0, 0, 0]),
        "dc_hit": np.array([1, 0, 0]),
        "bonus": np.array([3, 0, 0]),
    }
    out = score_draws("MID", ev)
    # draw0: 2 app + 5 goal + 1 cs + 2 dc + 3 bonus = 13
    # draw1: 1 app + 3 assist - 1 yellow = 3 (MID: no GC penalty)
    # draw2: absent = 0
    assert out.tolist() == [13, 3, 0]


def test_score_draws_gkp_def_gc_penalty():
    ev = {k: np.zeros(1, dtype=int) for k in
          ("goals", "assists", "cs", "saves", "pen_saved", "pen_missed",
           "yellow", "red", "own_goals", "dc_hit", "bonus")}
    ev["played"] = np.array([True])
    ev["full"] = np.array([True])
    ev["gc_on"] = np.array([4])
    assert score_draws("DEF", ev).tolist() == [0]   # 2 app - 2 gc
    assert score_draws("FWD", ev).tolist() == [2]   # no GC penalty


def test_full_snapshot_zero_mismatches():
    df = pd.read_csv(SNAPSHOT)
    recomputed = recompute_total_points(df)
    mismatches = int((recomputed != df["total_points"]).sum())
    assert mismatches == 0, f"{mismatches} rows disagree with the points table"
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_points_rules.py -q`
Expected: FAIL / collection error with `ModuleNotFoundError: No module named 'points_rules'`

- [ ] **Step 4: Write `model/points_rules.py`**

```python
"""FPL points conversion (#129, spec §3e): a row path for recomputing
actual history rows (the snapshot regression test) and a vectorized path
for scoring simulated draws. Both read the same feature_spec_v3 constants,
so the table cannot drift between them."""
from __future__ import annotations

import numpy as np
import pandas as pd

from feature_spec_v3 import (APPEARANCE_POINT, ASSIST_POINTS, CS_POINTS,
                             DC_POINTS, DC_THRESHOLD, FULL_APPEARANCE_POINT,
                             GC_PER_2_POINTS, GOAL_POINTS, OWN_GOAL_POINTS,
                             PEN_MISS_POINTS, PEN_SAVE_POINTS, RED_POINTS,
                             SAVES_PER_3_POINTS, YELLOW_POINTS)


def recompute_total_points(df: pd.DataFrame) -> pd.Series:
    """total_points from a history row's component columns. Mirrors the
    PR #142 validation SQL (0 mismatches on all of 2025/26)."""
    pos = df["position"]
    played = df["minutes"] >= 1
    full = df["minutes"] >= 60
    pts = played.astype(int) * APPEARANCE_POINT + full.astype(int) * FULL_APPEARANCE_POINT
    pts = pts + df["goals_scored"] * pos.map(GOAL_POINTS)
    pts = pts + df["assists"] * ASSIST_POINTS
    pts = pts + np.where(full & (df["clean_sheets"] > 0), pos.map(CS_POINTS), 0)
    is_gkp_def = pos.isin(["GKP", "DEF"])
    pts = pts + np.where(is_gkp_def, (df["goals_conceded"] // 2) * GC_PER_2_POINTS, 0)
    pts = pts + (df["saves"] // 3) * SAVES_PER_3_POINTS
    pts = pts + df["penalties_saved"] * PEN_SAVE_POINTS
    pts = pts + df["penalties_missed"] * PEN_MISS_POINTS
    pts = pts + df["yellow_cards"] * YELLOW_POINTS + df["red_cards"] * RED_POINTS
    pts = pts + df["own_goals"] * OWN_GOAL_POINTS
    thresh = pos.map(DC_THRESHOLD)
    dc_hit = thresh.notna() & (df["defensive_contribution"] >= thresh.fillna(10 ** 9))
    pts = pts + dc_hit.astype(int) * DC_POINTS
    pts = pts + df["bonus"]
    return pts.astype(int)


def score_draws(position: str, ev: dict) -> np.ndarray:
    """Score simulated draws (equal-length arrays; see Task 1 interface).
    Absent draws score exactly 0: every event array is 0 there and the
    appearance terms are gated on played/full."""
    played = ev["played"].astype(np.int64)
    full = ev["full"].astype(np.int64)
    pts = played * APPEARANCE_POINT + full * FULL_APPEARANCE_POINT
    pts = pts + ev["goals"] * GOAL_POINTS[position]
    pts = pts + ev["assists"] * ASSIST_POINTS
    pts = pts + ev["cs"] * CS_POINTS[position]
    if position in ("GKP", "DEF"):
        pts = pts + (ev["gc_on"] // 2) * GC_PER_2_POINTS
    pts = pts + (ev["saves"] // 3) * SAVES_PER_3_POINTS
    pts = pts + ev["pen_saved"] * PEN_SAVE_POINTS + ev["pen_missed"] * PEN_MISS_POINTS
    pts = pts + ev["yellow"] * YELLOW_POINTS + ev["red"] * RED_POINTS
    pts = pts + ev["own_goals"] * OWN_GOAL_POINTS
    pts = pts + ev["dc_hit"] * DC_POINTS
    pts = pts + ev["bonus"]
    return pts.astype(np.int64)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_points_rules.py -q`
Expected: PASS (9 tests; the snapshot test reads ~30k rows, takes ~1–2 s)

- [ ] **Step 6: Extend `model/data.py` `_HISTORY_COLUMNS`**

In `model/data.py`, change the `_HISTORY_COLUMNS` list to end:

```python
_HISTORY_COLUMNS = [
    "player_id", "fixture_id", "gw", "position", "team_id", "opponent_team",
    "was_home", "minutes", "starts", "goals_scored", "assists", "clean_sheets",
    "goals_conceded", "bonus", "bps", "total_points", "expected_goals",
    "expected_assists", "expected_goal_involvements", "expected_goals_conceded",
    "ict_index", "influence", "creativity", "threat", "defensive_contribution",
    "value", "saves", "penalties_saved", "penalties_missed", "yellow_cards",
    "red_cards", "own_goals",
]
```

(No coercion changes — the six new columns are smallint → int64.)

- [ ] **Step 7: Extend `model/tests/conftest.py` `synthetic_history`**

The fixture lacks columns v3 consumes. Inside the `rows.append({...})` dict, after the
`"defensive_contribution"` entry, add (values chosen to exercise variety without RNG; additive —
existing v2/v21 tests select only the columns they need):

```python
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
```

Also update the fixture docstring's first line to mention it now carries the full v3 column set.

- [ ] **Step 8: Run the whole suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: PASS (existing suites unaffected — the conftest additions are additive)

- [ ] **Step 9: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/feature_spec_v3.py model/points_rules.py model/tests/test_points_rules.py model/data.py model/tests/conftest.py
git commit -m "feat(model): v3 points rules + spec constants, verified against the 2025/26 snapshot (#129)"
```

---

### Task 2: Per-player walk-forward rates (`rates_v3.py`)

**Files:**
- Create: `model/rates_v3.py`
- Test: `model/tests/test_rates_v3.py`

**Interfaces:**
- Consumes: `feature_spec_v3` constants (Task 1); history DataFrames with the full column set.
- Produces:
  `position_rate_priors(past: pd.DataFrame) -> dict[str, dict]` — per-position
  `{"rates": {name: float}, "p_dc": float, "bonus": np.ndarray(4)}` pooled fallbacks from all
  played `gw < t` rows;
  `build_player_rates(prior_rows: pd.DataFrame, position: str, priors: dict) -> dict` — same
  shape, per player. Rate names: `xg90, xa90, saves90, yc90, rc90, og90, pm90, ps90`.

- [ ] **Step 1: Write the failing tests — `model/tests/test_rates_v3.py`**

```python
"""rates_v3 tests: hand-computed decay math, both fallback paths, DC window
semantics, GKP DC ineligibility, and bonus smoothing."""
import numpy as np
import pandas as pd
import pytest

from feature_spec_v3 import RATE_ALPHA
from rates_v3 import build_player_rates, position_rate_priors


def hrow(gw, minutes, *, xg=0.0, saves=0, bonus=0, dc=0, pos="MID", pid=1):
    return {"player_id": pid, "gw": gw, "fixture_id": gw * 10, "position": pos,
            "minutes": minutes, "expected_goals": xg, "expected_assists": 0.0,
            "saves": saves, "yellow_cards": 0, "red_cards": 0, "own_goals": 0,
            "penalties_missed": 0, "penalties_saved": 0, "bonus": bonus,
            "defensive_contribution": dc}


def frame(rows):
    return pd.DataFrame(rows)


def test_xg90_hand_computed_two_rows():
    # Most recent (gw 2): 90', xG 0.9 (w=1); older (gw 1): 45', xG 0.2 (w=alpha).
    prior = frame([hrow(1, 45, xg=0.2), hrow(2, 90, xg=0.9)])
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "MID", priors)
    w = np.array([1.0, RATE_ALPHA])
    expected = 90.0 * (1.0 * 0.9 + RATE_ALPHA * 0.2) / (1.0 * 90 + RATE_ALPHA * 45)
    assert out["rates"]["xg90"] == pytest.approx(expected)


def test_played_rows_only_zero_minute_rows_excluded():
    prior = frame([hrow(1, 90, xg=0.9), hrow(2, 0, xg=0.0)])
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "MID", priors)
    # The 0-minute row must not consume a window slot or affect the rate.
    assert out["rates"]["xg90"] == pytest.approx(90.0 * 0.9 / 90.0)


def test_low_minutes_falls_back_to_position_prior():
    # One 20' cameo (< MIN_DECAYED_MINUTES) -> position prior, not 0.45*90/20.
    pool = frame([hrow(g, 90, xg=0.30, pid=9) for g in range(1, 6)])
    prior = frame([hrow(1, 20, xg=0.45)])
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "MID", priors)
    assert out["rates"]["xg90"] == pytest.approx(priors["MID"]["rates"]["xg90"])
    assert out["rates"]["xg90"] < 1.0  # sanity: prior is pooled, not the cameo rate


def test_unknown_position_prior_gives_zero_rates():
    prior = frame([hrow(1, 20, xg=0.45)])
    out = build_player_rates(prior, "FWD", position_rate_priors(prior.iloc[0:0]))
    assert out["rates"]["xg90"] == 0.0
    assert out["p_dc"] == 0.0
    assert out["bonus"][0] == pytest.approx(1.0)


def test_p_dc_window_is_over_qualifying_rows_and_gkp_zero():
    # 60+' rows: gws 1..8 for a DEF, threshold hits on all -> p_dc ~ 1.
    rows = [hrow(g, 90, dc=12, pos="DEF") for g in range(1, 9)]
    prior = frame(rows)
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "DEF", priors)
    assert out["p_dc"] == pytest.approx(1.0)
    gk = build_player_rates(frame([hrow(g, 90, dc=99, pos="GKP") for g in range(1, 7)]),
                            "GKP", priors)
    assert gk["p_dc"] == 0.0


def test_p_dc_no_qualifying_rows_uses_position_prior():
    pool = frame([hrow(g, 90, dc=12, pos="DEF", pid=9) for g in range(1, 6)])
    prior = frame([hrow(1, 30, dc=0, pos="DEF")])  # played but never 60+
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "DEF", priors)
    assert out["p_dc"] == pytest.approx(priors["DEF"]["p_dc"])


def test_bonus_distribution_smoothed_and_normalized():
    # Position pool must be MIXED (bonus 0s from another player) or the
    # smoothing prior is itself degenerate and bonus[0] stays 0.
    pool = frame([hrow(g, 90, bonus=0, pid=9) for g in range(1, 7)])
    prior = frame([hrow(g, 90, bonus=3) for g in range(1, 7)])
    priors = position_rate_priors(pd.concat([pool, prior], ignore_index=True))
    out = build_player_rates(prior, "MID", priors)
    assert out["bonus"].sum() == pytest.approx(1.0)
    assert out["bonus"][3] > 0.5          # dominated by the observed 3s
    assert out["bonus"][0] > 0.0          # but smoothed, never degenerate


def test_position_rate_priors_pooled_math():
    past = frame([hrow(1, 90, xg=0.5, pid=1), hrow(1, 45, xg=0.25, pid=2)])
    priors = position_rate_priors(past)
    assert priors["MID"]["rates"]["xg90"] == pytest.approx(90.0 * 0.75 / 135.0)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_rates_v3.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'rates_v3'`

- [ ] **Step 3: Write `model/rates_v3.py`**

```python
"""Walk-forward per-player event rates for the v3 simulator (#129, spec §3b).
Pure; no I/O. Every quantity is computed from prior (gw < t) rows only —
callers are responsible for passing pre-filtered frames."""
from __future__ import annotations

import numpy as np
import pandas as pd

from feature_spec_v3 import (BONUS_PSEUDO, DC_THRESHOLD, MIN_DECAYED_MINUTES,
                             RATE_ALPHA, RATE_WINDOW)

# rate name -> history column holding the per-fixture event count/value
RATE_COLUMNS = {
    "xg90": "expected_goals",
    "xa90": "expected_assists",
    "saves90": "saves",
    "yc90": "yellow_cards",
    "rc90": "red_cards",
    "og90": "own_goals",
    "pm90": "penalties_missed",
    "ps90": "penalties_saved",
}

_EMPTY_PRIOR = {"rates": {name: 0.0 for name in RATE_COLUMNS},
                "p_dc": 0.0, "bonus": np.array([1.0, 0.0, 0.0, 0.0])}


def _dc_hits(rows: pd.DataFrame) -> pd.Series:
    thresh = rows["position"].map(DC_THRESHOLD)
    return thresh.notna() & (rows["defensive_contribution"] >= thresh.fillna(10 ** 9))


def position_rate_priors(past: pd.DataFrame) -> dict:
    """Pooled per-position fallbacks from all played gw<t rows: unweighted
    rate90s (90·Σx/Σminutes), p_dc among 60+' rows, bonus distribution."""
    priors: dict[str, dict] = {}
    played = past[past["minutes"] >= 1]
    for pos, g in played.groupby("position"):
        mins = float(g["minutes"].sum())
        rates = {name: (90.0 * float(g[col].sum()) / mins if mins > 0 else 0.0)
                 for name, col in RATE_COLUMNS.items()}
        qual = g[g["minutes"] >= 60]
        p_dc = 0.0 if pos == "GKP" else (
            float(_dc_hits(qual).mean()) if len(qual) else 0.0)
        counts = np.array([float((g["bonus"] == k).sum()) for k in range(4)])
        bonus = counts / counts.sum() if counts.sum() > 0 else np.array([1.0, 0, 0, 0])
        priors[pos] = {"rates": rates, "p_dc": p_dc, "bonus": bonus}
    return priors


def build_player_rates(prior_rows: pd.DataFrame, position: str, priors: dict) -> dict:
    """Rates from the player's last RATE_WINDOW *played* prior rows, falling
    back to the position prior when decayed minutes < MIN_DECAYED_MINUTES."""
    pos_prior = priors.get(position, _EMPTY_PRIOR)
    played = (prior_rows[prior_rows["minutes"] >= 1]
              .sort_values(["gw", "fixture_id"], ascending=False)
              .head(RATE_WINDOW))
    w = RATE_ALPHA ** np.arange(len(played))
    denom = float(np.dot(w, played["minutes"].to_numpy(dtype=float))) if len(played) else 0.0
    if denom < MIN_DECAYED_MINUTES:
        rates = dict(pos_prior["rates"])
    else:
        rates = {name: 90.0 * float(np.dot(w, played[col].to_numpy(dtype=float))) / denom
                 for name, col in RATE_COLUMNS.items()}

    if position == "GKP":
        p_dc = 0.0
    else:
        qual = (prior_rows[prior_rows["minutes"] >= 60]
                .sort_values(["gw", "fixture_id"], ascending=False)
                .head(RATE_WINDOW))
        if len(qual):
            wq = RATE_ALPHA ** np.arange(len(qual))
            p_dc = float(np.dot(wq / wq.sum(), _dc_hits(qual).to_numpy(dtype=float)))
        else:
            p_dc = pos_prior["p_dc"]

    counts = np.zeros(4)
    if len(played):
        b = played["bonus"].to_numpy()
        for k in range(4):
            counts[k] = float(w[b == k].sum())
    smoothed = counts + BONUS_PSEUDO * np.asarray(pos_prior["bonus"], dtype=float)
    bonus = smoothed / smoothed.sum()
    return {"rates": rates, "p_dc": p_dc, "bonus": bonus}
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_rates_v3.py -q`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/rates_v3.py model/tests/test_rates_v3.py
git commit -m "feat(model): v3 walk-forward player rates with position-prior fallbacks (#129)"
```

---

### Task 3: The simulator (`simulate_v3.py`)

**Files:**
- Create: `model/simulate_v3.py`
- Test: `model/tests/test_simulate_v3.py`

**Interfaces:**
- Consumes: `feature_spec_v3` constants; `points_rules.score_draws`; `rates_v3` output dicts.
- Produces:
  `simulate_player_fixture(rng: np.random.Generator, position: str, p_play: float, p60: float,
  player: dict, lam_against: float, m_att: float, m_sav: float, n: int = N_SIMS) -> dict`
  returning `{"total", "goals", "assists", "cs"}` int arrays of length n (`player` =
  `build_player_rates` output);
  `summarize_draws(arrs: dict, position: str) -> dict` with keys
  `mean_v3, p25_v3, p50_v3, p75_v3, p_goal, p_assist, p_cs_pts, p_haul` (floats).
  DGW callers sum the four arrays elementwise across fixtures, then call `summarize_draws` once.

- [ ] **Step 1: Write the failing tests — `model/tests/test_simulate_v3.py`**

```python
"""Simulator tests: determinism, quantile coherence, minutes gating,
analytic-mean parity (MID), the saves cap (GKP), and FWD p_cs_pts = 0."""
import math

import numpy as np
import pytest
from scipy.stats import poisson

from feature_spec_v3 import M_FULL, SAVES_LAMBDA_CAP
from simulate_v3 import simulate_player_fixture, summarize_draws


def player(**over):
    rates = {"xg90": 0.0, "xa90": 0.0, "saves90": 0.0, "yc90": 0.0, "rc90": 0.0,
             "og90": 0.0, "pm90": 0.0, "ps90": 0.0}
    rates.update({k: v for k, v in over.items() if k in rates})
    return {"rates": rates,
            "p_dc": over.get("p_dc", 0.0),
            "bonus": np.asarray(over.get("bonus", [1.0, 0.0, 0.0, 0.0]))}


def sim(seed=1, position="MID", p_play=1.0, p60=1.0, lam_against=1.0,
        m_att=1.0, m_sav=1.0, n=20000, **over):
    rng = np.random.default_rng(seed)
    return simulate_player_fixture(rng, position, p_play, p60, player(**over),
                                   lam_against, m_att, m_sav, n=n)


def test_same_seed_is_deterministic():
    a = sim(seed=7, xg90=0.6, yc90=0.2, p_dc=0.3, bonus=[0.7, 0.2, 0.05, 0.05])
    b = sim(seed=7, xg90=0.6, yc90=0.2, p_dc=0.3, bonus=[0.7, 0.2, 0.05, 0.05])
    assert np.array_equal(a["total"], b["total"])


def test_absent_player_scores_exactly_zero():
    out = sim(p_play=0.0, p60=0.0, xg90=2.0, lam_against=2.0)
    assert out["total"].max() == 0 and out["total"].min() == 0
    s = summarize_draws(out, "MID")
    assert s["mean_v3"] == 0.0 and s["p_goal"] == 0.0


def test_quantiles_are_monotone():
    out = sim(xg90=0.5, xa90=0.3, p_play=0.9, p60=0.7,
              bonus=[0.7, 0.2, 0.05, 0.05])
    s = summarize_draws(out, "MID")
    assert s["p25_v3"] <= s["p50_v3"] <= s["p75_v3"]


def test_analytic_mean_parity_mid():
    xg90, xa90, yc90, p_dc = 0.9, 0.4, 0.2, 0.3
    m_att, lam_against = 1.2, 1.0
    bonus = [0.7, 0.2, 0.05, 0.05]
    out = sim(xg90=xg90, xa90=xa90, yc90=yc90, p_dc=p_dc, m_att=m_att,
              lam_against=lam_against, bonus=bonus, n=200000)
    f = M_FULL / 90.0
    expected = (2.0                                   # appearance (always full)
                + xg90 * m_att * f * 5                # goals
                + xa90 * m_att * f * 3                # assists
                + math.exp(-lam_against * f) * 1      # MID clean sheet
                - min(yc90 * f, 1.0)                  # yellow
                + p_dc * 2                            # DC
                + np.dot(bonus, [0, 1, 2, 3]))        # bonus mean
    sd = out["total"].std()
    assert out["total"].mean() == pytest.approx(expected, abs=4 * sd / math.sqrt(200000))


def test_gkp_saves_not_clipped_at_goal_cap():
    # saves lambda = 3.2 * 1.5 * 85/90 = 4.53 — above LAMBDA_CAP, below SAVES_LAMBDA_CAP.
    lam = 3.2 * 1.5 * (M_FULL / 90.0)
    assert lam < SAVES_LAMBDA_CAP
    out = sim(position="GKP", saves90=3.2, m_sav=1.5, lam_against=0.0, n=200000)
    # lam_against=0 -> gc_on=0 every draw -> a certain clean sheet (+4 GKP).
    # E[total] = 2 appearance + 4 CS + E[floor(S/3)] with S ~ Poisson(lam).
    e_floor = sum((k // 3) * poisson.pmf(k, lam) for k in range(60))
    sd = out["total"].std()
    assert out["total"].mean() == pytest.approx(2.0 + 4.0 + e_floor,
                                                abs=4 * sd / math.sqrt(200000))


def test_fwd_p_cs_pts_is_zero():
    out = sim(position="FWD", lam_against=0.2, p_play=1.0, p60=1.0)
    s = summarize_draws(out, "FWD")
    assert s["p_cs_pts"] == 0.0


def test_partial_bucket_never_earns_cs():
    out = sim(p_play=1.0, p60=0.0, lam_against=0.0)  # always partial, never concedes
    assert out["cs"].max() == 0
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_simulate_v3.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'simulate_v3'`

- [ ] **Step 3: Write `model/simulate_v3.py`**

```python
"""The v3 generative simulator (#129, spec §3d–§3f). Pure; no I/O.

One call simulates one player-fixture into N event/total draw arrays. DGW
callers sum the returned arrays elementwise across the player's fixtures
BEFORE calling summarize_draws — quantiles of a sum, never a sum of
quantiles."""
from __future__ import annotations

import numpy as np

from feature_spec_v3 import (CS_POINTS, LAMBDA_CAP, M_FULL, M_PART, N_SIMS,
                             SAVES_LAMBDA_CAP)
from points_rules import score_draws


def simulate_player_fixture(rng: np.random.Generator, position: str,
                            p_play: float, p60: float, player: dict,
                            lam_against: float, m_att: float, m_sav: float,
                            n: int = N_SIMS) -> dict:
    """player = build_player_rates output ({"rates", "p_dc", "bonus"}).
    Returns {"total", "goals", "assists", "cs"} int arrays of length n."""
    r = player["rates"]
    u = rng.random(n)
    played = u >= (1.0 - p_play)   # P = p_play
    full = u >= (1.0 - p60)        # P = p60; full ⊆ played since p60 <= p_play
    mins = np.where(full, M_FULL, np.where(played, M_PART, 0.0))
    f = mins / 90.0

    def lam(rate: float, mult: float, cap: float = LAMBDA_CAP) -> np.ndarray:
        # spec §3b: clip the FINAL per-fixture lambda (post-adjustment, post-scaling)
        return np.clip(rate * mult * f, 0.0, cap)

    goals = rng.poisson(lam(r["xg90"], m_att))
    assists = rng.poisson(lam(r["xa90"], m_att))
    gc_on = rng.poisson(np.clip(lam_against * f, 0.0, LAMBDA_CAP))
    saves = rng.poisson(lam(r["saves90"], m_sav, cap=SAVES_LAMBDA_CAP))
    pen_saved = rng.poisson(lam(r["ps90"], m_sav))
    pen_missed = rng.poisson(lam(r["pm90"], 1.0))
    yellow = (rng.random(n) < np.minimum(r["yc90"] * f, 1.0)).astype(np.int64)
    red = (rng.random(n) < np.minimum(r["rc90"] * f, 1.0)).astype(np.int64)
    own_goals = rng.poisson(lam(r["og90"], 1.0))
    dc_hit = (full & (rng.random(n) < player["p_dc"])).astype(np.int64)
    bonus = np.where(played, rng.choice(4, size=n, p=np.asarray(player["bonus"])), 0)
    cs = (full & (gc_on == 0)).astype(np.int64)

    ev = {"played": played, "full": full, "goals": goals, "assists": assists,
          "gc_on": gc_on, "cs": cs, "saves": saves, "pen_saved": pen_saved,
          "pen_missed": pen_missed, "yellow": yellow, "red": red,
          "own_goals": own_goals, "dc_hit": dc_hit, "bonus": bonus}
    return {"total": score_draws(position, ev), "goals": goals,
            "assists": assists, "cs": cs}


def summarize_draws(arrs: dict, position: str) -> dict:
    """Point estimate + contract quantiles + intermediate probabilities from
    (possibly DGW-summed) draw arrays."""
    total = arrs["total"]
    q25, q50, q75 = np.quantile(total, [0.25, 0.50, 0.75], method="linear")
    return {
        "mean_v3": float(total.mean()),
        "p25_v3": float(q25), "p50_v3": float(q50), "p75_v3": float(q75),
        "p_goal": float((arrs["goals"] >= 1).mean()),
        "p_assist": float((arrs["assists"] >= 1).mean()),
        "p_cs_pts": float((arrs["cs"] >= 1).mean()) if CS_POINTS[position] > 0 else 0.0,
        "p_haul": float((total >= 10).mean()),
    }
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_simulate_v3.py -q`
Expected: PASS (7 tests; the two 200k-draw parity tests take a few seconds)

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/simulate_v3.py model/tests/test_simulate_v3.py
git commit -m "feat(model): v3 generative simulator — minutes-gated draws, coherent quantiles (#129)"
```

---

### Task 4: Walk-forward, gate, and report (`backtest_v3.py`)

**Files:**
- Create: `model/backtest_v3.py`
- Test: `model/tests/test_backtest_v3.py`

**Interfaces:**
- Consumes: everything above; `MatchEngine`/`build_team_fixtures` (`match_engine.py`);
  `precompute_minutes_predictions` (`minutes_model.py`); `fit_models`/`predict` (`train.py`);
  `build_feature_row`/`build_samples` (`features.py`); `baseline_form`; `hot3_points`
  (`backtest_v2.py`); `mae`/`captaincy_points`/`interval_coverage`/`within_position_spearman`
  (`metrics.py`); `MINUTES_CUTOFF` (`feature_spec_v21.py`).
- Produces: `walk_forward_v3(history, team_strengths, start_gw=8, end_gw=38, n_sims=N_SIMS) ->
  tuple[pd.DataFrame, pd.DataFrame]` (results, minutes_rows);
  `evaluate_v3(results: pd.DataFrame, min_xmin: float = 0.5) -> dict`;
  `write_report_v3(metrics: dict, path: str) -> None` (marker `<!-- xpts-v3-results -->`);
  `run_gate(history, team_strengths, report_path, dump_path=None, start_gw=8, end_gw=38) -> dict`.

- [ ] **Step 1: Write the failing tests — `model/tests/test_backtest_v3.py`**

```python
"""backtest_v3 tests on the shared synthetic fixtures: walk-forward shapes
(incl. per-row and aggregate quantile coherence and a DGW row), determinism,
target-GW isolation (no leakage), gate pass/fail for BOTH candidates,
empty-frame guard, report-marker semantics, and dump-before-evaluate."""
import os

import numpy as np
import pandas as pd
import pytest

from backtest_v3 import (REPORT_MARKER_V3, evaluate_v3, run_gate,
                         walk_forward_v3, write_report_v3)

FAST = dict(start_gw=25, end_gw=28, n_sims=300)


def test_walk_forward_shapes_and_quantile_coherence(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    need = {"player_id", "gw", "position", "actual", "xmin", "hot3", "base_form",
            "p25_v1", "p50_v1", "p75_v1",
            "mean_v3", "p25_v3", "p50_v3", "p75_v3",
            "p_goal", "p_assist", "p_cs_pts", "p_haul",
            "point_ens", "p25_ens", "p50_ens", "p75_ens"}
    assert need <= set(results.columns)
    assert len(results) > 0 and len(minutes_rows) > 0
    # Simulation quantiles are coherent per row BY CONSTRUCTION (same draws).
    assert (results["p25_v3"] <= results["p50_v3"]).all()
    assert (results["p50_v3"] <= results["p75_v3"]).all()
    # Aggregate ordering (non-flaky) as the cross-column sanity check.
    assert results["p25_v3"].mean() < results["p75_v3"].mean()
    assert results["mean_v3"].notna().all()


def test_walk_forward_is_deterministic(synthetic_history, synthetic_strengths):
    a, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    b, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    pd.testing.assert_frame_equal(a, b)


def test_dgw_collapses_to_one_row(synthetic_history, synthetic_strengths):
    hist = synthetic_history.copy()
    extra = hist[(hist["player_id"] == 1) & (hist["gw"] == 27)].copy()
    assert len(extra) == 1
    extra["fixture_id"] = 9999
    extra["was_home"] = not bool(extra["was_home"].iloc[0])
    hist = pd.concat([hist, extra], ignore_index=True)
    results, _ = walk_forward_v3(hist, synthetic_strengths, **FAST)
    row = results[(results["player_id"] == 1) & (results["gw"] == 27)]
    assert len(row) == 1  # two fixtures -> one aggregated (player, gw) row
    single, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    srow = single[(single["player_id"] == 1) & (single["gw"] == 27)]
    # A double gameweek must project more than the single fixture alone.
    assert row["mean_v3"].iloc[0] > srow["mean_v3"].iloc[0]


def test_target_gw_stats_do_not_leak_into_predictions(synthetic_history, synthetic_strengths):
    base, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    poisoned = synthetic_history.copy()
    mask = (poisoned["player_id"] == 1) & (poisoned["gw"] == 28)
    poisoned.loc[mask, "expected_goals"] = 99.0  # target-GW stat, not a prior
    out, _ = walk_forward_v3(poisoned, synthetic_strengths, **FAST)
    a = base[(base["player_id"] == 1) & (base["gw"] == 28)]["mean_v3"].iloc[0]
    b = out[(out["player_id"] == 1) & (out["gw"] == 28)]["mean_v3"].iloc[0]
    assert a == pytest.approx(b)


def _gate_frame(v3_beats: bool, cap_flip: bool, cov_inside: bool) -> pd.DataFrame:
    """Hand-built results frame: 8 rows x 2 gws, one clear captain per gw.
    cov_inside=True puts HALF the rows inside [p25, p75] (coverage 0.5 —
    all-inside would be coverage 1.0, which FAILS the ±0.10 band)."""
    rows = []
    for gw in (1, 2):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            err_v3 = 0.5 if v3_beats else 3.0
            inside = (i < 2) if cov_inside else False
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                "base_form": 2.0,
                # v1 always picks player 1 (actual 10).
                "p50_v1": 8.0 if i == 0 else 1.0,
                "p25_v1": 6.0 if i == 0 else 0.5,
                "p75_v1": 10.0 if i == 0 else 1.5,
                # v3 picks player 1 unless cap_flip: then player 2 (actual 2;
                # 9.6 beats player 1's 10-0.5=9.5 strictly — a tie would let
                # idxmax keep the first row and the flip would never happen).
                "mean_v3": (actual - err_v3) if not (cap_flip and i == 1) else 9.6,
                "p25_v3": actual - 1.0 if inside else actual + 1.0,
                "p50_v3": actual if inside else actual + 1.5,
                "p75_v3": actual + 1.0 if inside else actual + 2.0,
                "p_goal": 0.3, "p_assist": 0.2, "p_cs_pts": 0.1, "p_haul": 0.05,
            })
    df = pd.DataFrame(rows)
    df["point_ens"] = 0.5 * (df["mean_v3"] + df["p50_v1"])
    for k in (25, 50, 75):
        df[f"p{k}_ens"] = 0.5 * (df[f"p{k}_v3"] + df[f"p{k}_v1"])
    return df


def test_evaluate_primary_pass_and_fail_paths():
    good = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))
    assert good["beats_v1_mae_v3"] and good["captaincy_ok_v3"] and good["coverage_ok_v3"]
    assert good["passes_gate_primary"]
    flipped = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=True, cov_inside=True))
    assert not flipped["captaincy_ok_v3"]
    assert not flipped["passes_gate_primary"]
    worse = evaluate_v3(_gate_frame(v3_beats=False, cap_flip=False, cov_inside=True))
    assert not worse["beats_v1_mae_v3"]


def test_evaluate_reports_secondary_independently():
    m = evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))
    for key in ("ens_mae", "ens_captaincy", "coverage_ens", "passes_gate_secondary"):
        assert key in m
    assert m["gkp"]["n"] == 0  # synthetic gate frame has no GKP rows


def test_evaluate_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_v3(pd.DataFrame())


def _metrics() -> dict:
    return evaluate_v3(_gate_frame(v3_beats=True, cap_flip=False, cov_inside=True))


def test_report_appends_after_existing_sections(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("# Header\n\n<!-- xpts-v138-results -->\n\nold v138 section\n")
    write_report_v3(_metrics(), str(p))
    content = p.read_text()
    assert "old v138 section" in content
    assert content.index(REPORT_MARKER_V3) > content.index("old v138 section")


def test_report_truncates_own_marker_only(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("keep me\n\n" + REPORT_MARKER_V3 + "\n\nstale v3 section\n")
    write_report_v3(_metrics(), str(p))
    content = p.read_text()
    assert "keep me" in content and "stale v3 section" not in content
    assert content.count(REPORT_MARKER_V3) == 1


def test_report_refuses_duplicate_marker(tmp_path):
    p = tmp_path / "report.md"
    p.write_text(REPORT_MARKER_V3 + "\n\n" + REPORT_MARKER_V3 + "\n")
    with pytest.raises(ValueError, match="duplicate"):
        write_report_v3(_metrics(), str(p))


def test_run_gate_dumps_both_frames_before_evaluating(tmp_path, synthetic_history,
                                                      synthetic_strengths):
    report = tmp_path / "report.md"
    report.write_text("# xPts model\n")
    dump = tmp_path / "results.csv"
    metrics = run_gate(synthetic_history, synthetic_strengths, str(report),
                       dump_path=str(dump), start_gw=25, end_gw=28)
    assert os.path.exists(dump)
    assert os.path.exists(tmp_path / "results.minutes.csv")
    assert isinstance(metrics["passes_gate_primary"], bool)
    assert REPORT_MARKER_V3 in report.read_text()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v3.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'backtest_v3'`

- [ ] **Step 3: Write `model/backtest_v3.py`**

Note: `run_gate` passes `n_sims` through from `walk_forward_v3`'s default (the frozen
`N_SIMS = 8000`) — tests shrink it via `walk_forward_v3` directly; the gate run never overrides
it. The test `run_gate` call above runs with N_SIMS=8000 on the tiny synthetic frame (~24
player-GWs) — a few seconds, acceptable.

```python
"""Walk-forward backtest + pre-registered gate for xPts v3 (#129): the
generative simulator (PRIMARY) and the 50/50 Vincentized v1 blend
(SECONDARY) vs the in-run v1 benchmark. Spec (frozen registration §2):
docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md."""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

from backtest_v2 import hot3_points
from baselines import baseline_form
from feature_spec_v21 import MINUTES_CUTOFF
from feature_spec_v3 import MODEL_VERSION_V3, N_SIMS, V3_SEED_BASE
from features import build_feature_row, build_samples
from match_engine import MatchEngine, build_team_fixtures
from metrics import (captaincy_points, interval_coverage, mae,
                     within_position_spearman)
from minutes_model import precompute_minutes_predictions
from rates_v3 import build_player_rates, position_rate_priors
from simulate_v3 import simulate_player_fixture, summarize_draws
from train import fit_models, predict

REPORT_MARKER_V3 = "<!-- xpts-v3-results -->"

_SIM_KEYS = ("total", "goals", "assists", "cs")


def walk_forward_v3(history: pd.DataFrame, team_strengths: dict,
                    start_gw: int = 8, end_gw: int = 38,
                    n_sims: int = N_SIMS) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (results, minutes_rows). results has one row per (player, gw):
    v1 columns aggregated by summing per-fixture quantile predictions (v1's
    existing DGW behavior), v3 columns from elementwise-summed draw arrays
    (quantiles of the sum), ensemble columns from both."""
    preds = precompute_minutes_predictions(history)
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in preds.iterrows()}
    engine = MatchEngine(build_team_fixtures(history))
    out_rows: list[dict] = []
    minutes_rows: list[dict] = []
    sim_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        if len(s_v1) == 0:
            continue
        art_v1 = fit_models(s_v1)
        priors = position_rate_priors(past)
        rng = np.random.default_rng(V3_SEED_BASE + t)
        acc: dict[int, dict] = {}
        targets = history[history["gw"] == t].sort_values(["player_id", "fixture_id"])
        for _, target in targets.iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            key = (pid, t)
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            pos = target["position"]
            team = int(target["team_id"])
            opp = int(target["opponent_team"])
            was_home = bool(target["was_home"])
            lam_for, lam_against = engine.lambdas(team, opp, was_home, before_gw=t)
            venue = "home" if was_home else "away"
            att = engine.rating(team, venue, "att", before_gw=t)
            m_att = lam_for / att if att > 0 else 1.0
            ov = "away" if was_home else "home"
            l_ov = engine.league_baseline(ov, before_gw=t)
            m_sav = lam_against / l_ov if l_ov > 0 else 1.0
            player = build_player_rates(prior, pos, priors)
            sim = simulate_player_fixture(rng, pos, p_play, p60, player,
                                          lam_against, m_att, m_sav, n=n_sims)
            if pid in acc:
                for k in _SIM_KEYS:
                    acc[pid][k] = acc[pid][k] + sim[k]
            else:
                acc[pid] = {k: sim[k] for k in _SIM_KEYS}
                acc[pid]["position"] = pos
            f1 = build_feature_row(prior, target, team_strengths)
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p25_v1": predict(art_v1, f1, pos, 0.25),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p75_v1": predict(art_v1, f1, pos, 0.75),
                "base_form": baseline_form(prior),
                "xmin": f1["xmin"],
                "hot3": hot3_points(history, pid, t),
            })
            minutes_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "p_play": p_play, "p60": p60, "xmin": f1["xmin"],
                "played": 1.0 if target["minutes"] >= 1 else 0.0,
                "sixty": 1.0 if target["minutes"] >= MINUTES_CUTOFF else 0.0,
            })
        for pid, arrs in acc.items():
            row = {"player_id": pid, "gw": t}
            row.update(summarize_draws(arrs, arrs["position"]))
            sim_rows.append(row)
    df = pd.DataFrame(out_rows)
    mdf = pd.DataFrame(minutes_rows)
    if df.empty:
        return df, mdf
    agg = {"actual": "sum", "p25_v1": "sum", "p50_v1": "sum", "p75_v1": "sum",
           "base_form": "sum", "position": "first", "xmin": "first",
           "hot3": "first"}
    results = df.groupby(["player_id", "gw"], as_index=False).agg(agg)
    results = results.merge(pd.DataFrame(sim_rows), on=["player_id", "gw"],
                            how="inner", validate="one_to_one")
    results["point_ens"] = 0.5 * (results["mean_v3"] + results["p50_v1"])
    for k in (25, 50, 75):
        results[f"p{k}_ens"] = 0.5 * (results[f"p{k}_v3"] + results[f"p{k}_v1"])
    return results, mdf


def evaluate_v3(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    if len(results) == 0:
        raise ValueError("evaluate_v3: results frame is empty — no walk-forward rows")
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    v3_mae = mae(df["mean_v3"], df["actual"])
    ens_mae = mae(df["point_ens"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    v3_cap = captaincy_points(df, "mean_v3")
    ens_cap = captaincy_points(df, "point_ens")
    cov_v3 = interval_coverage(df, "p25_v3", "p75_v3")
    cov_ens = interval_coverage(df, "p25_ens", "p75_ens")

    beats_v3 = v3_mae < v1_mae
    cap_ok_v3 = v3_cap >= v1_cap
    cov_ok_v3 = abs(cov_v3 - 0.5) <= 0.10
    beats_ens = ens_mae < v1_mae
    cap_ok_ens = ens_cap >= v1_cap
    cov_ok_ens = abs(cov_ens - 0.5) <= 0.10

    gkp = df[df["position"] == "GKP"]
    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v3_mae": v3_mae, "ens_mae": ens_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v3_captaincy": v3_cap, "ens_captaincy": ens_cap,
        "v3_spearman": within_position_spearman(df, "mean_v3"),
        "ens_spearman": within_position_spearman(df, "point_ens"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage_v3": cov_v3, "coverage_ens": cov_ens,
        "beats_v1_mae_v3": bool(beats_v3), "captaincy_ok_v3": bool(cap_ok_v3),
        "coverage_ok_v3": bool(cov_ok_v3),
        "beats_v1_mae_ens": bool(beats_ens), "captaincy_ok_ens": bool(cap_ok_ens),
        "coverage_ok_ens": bool(cov_ok_ens),
        "passes_gate_primary": bool(beats_v3 and cap_ok_v3 and cov_ok_v3),
        "passes_gate_secondary": bool(beats_ens and cap_ok_ens and cov_ok_ens),
        "gkp": {
            "n": int(len(gkp)),
            "v1_mae": mae(gkp["p50_v1"], gkp["actual"]) if len(gkp) else 0.0,
            "v3_mae": mae(gkp["mean_v3"], gkp["actual"]) if len(gkp) else 0.0,
        },
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v3_mae": mae(results["mean_v3"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v3_signed_error": float((hot["mean_v3"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def write_report_v3(metrics: dict, path: str) -> None:
    if metrics["passes_gate_primary"]:
        verdict = ("✅ PASS (primary — pure v3) — revive #128/#130 for this "
                   "candidate (prospective validation before any promotion)")
    elif metrics["passes_gate_secondary"]:
        verdict = ("✅ PASS (secondary — v3+v1 ensemble) — revive #128/#130 for "
                   "this candidate (prospective validation before any promotion)")
    else:
        verdict = "❌ FAIL — documented finding; #128 stays parked"
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER_V3}

# xPts model — v3 results (event decomposition, #129)

**Model version:** `{MODEL_VERSION_V3}` · pre-registered gate vs v1 on the same
walk-forward (2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5;
n = {metrics['n_eval']}). PRIMARY = the generative simulator (point estimate =
simulated mean); SECONDARY = 50/50 Vincentized blend with v1. N_SIMS = 8000,
seed-pinned per GW. Spec:
`docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md`.
In-run comparison only (live team strengths drift at the 4th decimal).

## MAE (lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) PRIMARY — v3 simulator | {metrics['v3_mae']:.4f} |
| (c) SECONDARY — 50/50 v3+v1 blend | {metrics['ens_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: v3 {metrics['v3_captaincy']:.0f} · ensemble {metrics['ens_captaincy']:.0f}
· v1 {metrics['v1_captaincy']:.0f}.
Spearman: v3 {metrics['v3_spearman']:.3f} · ensemble {metrics['ens_spearman']:.3f}
· v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: v3 {metrics['coverage_v3']:.3f} · ensemble
{metrics['coverage_ens']:.3f} (target 0.50 ± 0.10).
GKP-only MAE (n = {metrics['gkp']['n']}): v3 {metrics['gkp']['v3_mae']:.4f}
vs v1 {metrics['gkp']['v1_mae']:.4f}.
Uncapped population (n = {metrics['uncapped']['n']}): v3 MAE
{metrics['uncapped']['v3_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): v3 {hs['v3_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

| condition | PRIMARY (v3) | SECONDARY (ensemble) |
|-----------|--------------|----------------------|
| beats v1 on MAE | **{metrics['beats_v1_mae_v3']}** | **{metrics['beats_v1_mae_ens']}** |
| captaincy ≥ v1 | **{metrics['captaincy_ok_v3']}** | **{metrics['captaincy_ok_ens']}** |
| coverage within ±0.10 of 0.50 | **{metrics['coverage_ok_v3']}** | **{metrics['coverage_ok_ens']}** |

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER_V3) > 1:
        raise ValueError("duplicate xpts-v3 marker in report — refusing to write")
    if REPORT_MARKER_V3 in content:
        content = content[: content.index(REPORT_MARKER_V3)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


def run_gate(history: pd.DataFrame, team_strengths: dict, report_path: str,
             dump_path: str | None = None,
             start_gw: int = 8, end_gw: int = 38) -> dict:
    """Walk-forward -> (optional) frame dumps -> evaluate -> report. Dumps
    happen BEFORE evaluation so the diagnostics read the exact frames that
    produced the verdict."""
    results, minutes_rows = walk_forward_v3(history, team_strengths,
                                            start_gw=start_gw, end_gw=end_gw)
    if dump_path is not None:
        results.to_csv(dump_path, index=False)
        root, ext = os.path.splitext(dump_path)
        minutes_rows.to_csv(f"{root}.minutes{ext}", index=False)
    metrics = evaluate_v3(results)
    write_report_v3(metrics, report_path)
    return metrics


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    report = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                           "docs", "xpts-model.md"))
    dump = sys.argv[1] if len(sys.argv) > 1 else None
    m = run_gate(load_history(), load_team_strengths(), report, dump)
    print(f"[backtest-v3] n={m['n_eval']} v1={m['v1_mae']:.4f} "
          f"v3={m['v3_mae']:.4f} ens={m['ens_mae']:.4f} "
          f"cap v3 {m['v3_captaincy']:.0f} / ens {m['ens_captaincy']:.0f} "
          f"vs v1 {m['v1_captaincy']:.0f} "
          f"cov v3={m['coverage_v3']:.3f} ens={m['coverage_ens']:.3f} "
          f"PRIMARY={m['passes_gate_primary']} "
          f"SECONDARY={m['passes_gate_secondary']}")
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v3.py -q`
Expected: PASS (11 tests; the synthetic walk-forwards refit v1 per step — allow ~1–2 min)

- [ ] **Step 5: Run the whole suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/backtest_v3.py model/tests/test_backtest_v3.py
git commit -m "feat(model): v3 walk-forward gate — primary simulator + ensemble secondary vs v1 (#129)"
```

---

### Task 5: Triaged minors from #140

**Files:**
- Modify: `model/tests/test_backtest_v21.py` (one new test at end of file)
- Modify: `model/backtest_aug.py` (empty-frame guard at top of `evaluate_aug`)
- Test: `model/tests/test_backtest_aug.py` (one new test at end of file)

**Interfaces:** none new — behavior-neutral except the new guard's error path.

- [ ] **Step 1: Add the aggregate quantile-ordering test to `model/tests/test_backtest_v21.py`** (append at end of file)

```python
def test_walk_forward_aggregate_quantile_ordering(synthetic_history, synthetic_strengths):
    # Per-row p25<=p75 is flaky by design under raw QuantReg crossing; the
    # aggregate ordering is the non-flaky guard for a 0.25/0.75 arg swap
    # (triaged minor from #140).
    results, _ = walk_forward_v21(synthetic_history, synthetic_strengths,
                                  start_gw=25, end_gw=28)
    assert results["p25_aug"].mean() < results["p75_aug"].mean()
```

(If the file does not already import `walk_forward_v21`, extend its existing import from
`backtest_v21`.)

- [ ] **Step 2: Add the guard to `model/backtest_aug.py`** — first lines of `evaluate_aug`:

```python
def evaluate_aug(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    if len(results) == 0:
        raise ValueError("evaluate_aug: results frame is empty — no walk-forward rows")
    df = results[results["xmin"] >= min_xmin].copy()
```

- [ ] **Step 3: Add the guard's test to `model/tests/test_backtest_aug.py`** (append at end of file)

```python
def test_evaluate_aug_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_aug(pd.DataFrame())
```

(Extend the file's existing imports with `pytest` / `pandas as pd` / `evaluate_aug` only if not
already imported.)

- [ ] **Step 4: Run the two touched suites**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py tests/test_backtest_aug.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/tests/test_backtest_v21.py model/backtest_aug.py model/tests/test_backtest_aug.py
git commit -m "test(model): #140 triaged minors — aggregate quantile-order guard + evaluate_aug empty-frame guard"
```

---

### Task 6: The gate run + diagnostics (CONTROLLER-RUN — not a subagent dispatch)

This task is a runbook the session controller executes directly (it needs the local DB, the
detached-ops protocol, and judgment over the diagnostics).

- [ ] **Step 1: Preconditions**
  - `git log --oneline -1` on `feat/xpts-v3-decomposition`; Tasks 1–5 committed; full suite green.
  - Local stack up: `docker exec supabase_db_fantasy-gaffer psql -U postgres -tc "select count(*) from player_gw_history where season='2025/26' and saves > 0"` → expect a positive count (the six columns are populated).
  - Bootstrap context check (context only — the gate reads the frozen local DB):
    `curl -s https://fantasy.premierleague.com/api/bootstrap-static/ | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['events'][0]['deadline_time'], len(d['events']))"`

- [ ] **Step 2: Launch the gate run (detached, sentinel, absolute paths)**

```bash
mkdir -p /tmp/xpts-v3
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
nohup sh -c '.venv/bin/python backtest_v3.py /tmp/xpts-v3/results.csv; echo "EXITED rc=$?"' \
  > /tmp/xpts-v3/run.log 2>&1 &
```

Verify alive ~30 s after launch (`ps` on the PID; the script prints nothing until the final
summary — process-alive is the health signal, not log output). Expected runtime ≈ 40–60 min
(31 v1 refits dominate; the simulator adds single-digit minutes).

- [ ] **Step 3: On `EXITED rc=0` — read the verdict**
  - `tail -3 /tmp/xpts-v3/run.log` → the `[backtest-v3]` summary line.
  - `docs/xpts-model.md` now has the `<!-- xpts-v3-results -->` section.

- [ ] **Step 4: Pre-committed diagnostics (regardless of verdict; read the DUMPED frames only)**
  - Captain-flip: adapt `/tmp/xpts-v138/captain_diag_aug.py` → `/tmp/xpts-v3/captain_diag_v3.py`
    comparing `p50_v1` picks vs `mean_v3` picks from `/tmp/xpts-v3/results.csv` +
    `results.minutes.csv` (flip count, per-flip deltas, GKP-captain / `p60 < 0.5` pathology
    check — v3 should make these structurally impossible; verify the claim).
  - Calibration (scratch script): decile-bucket `p_cs_pts` vs realized CS-points rate and
    `p_goal` vs realized goal rate, from `results.csv` joined to actuals; simulated
    mean-goals-per-GW vs actual (drift check).
  - GKP-only MAE is already in the report (from `evaluate_v3`).
  - Write the findings as a **hand-written subsection** inside the v3 report section
    (`## Captain-flip & calibration diagnostics`, marked re-add-if-regenerated), placed before
    the `## Gate` heading.

- [ ] **Step 5: Commit the report + prep bookkeeping**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add docs/xpts-model.md
git commit -m "docs(model): xPts v3 gate run — results, gate verdict, captain-flip + calibration diagnostics (#129)"
```

Then: final whole-branch review → PR → on merge: #129 finding comment, #107 index update,
#126 re-scope comment (spec §10), CLAUDE.md record (separate docs PR, as before).

---

## Self-review notes (already applied)

- Spec §3b/§3d/§3e/§3f, §4, §7, §8 all have implementing tasks; §9/§10 are design-only by spec.
- `run_gate` on synthetic data in tests uses the frozen N_SIMS — verified acceptable runtime
  (tiny frame). All other tests shrink `n_sims` via `walk_forward_v3`.
- Type/name consistency: `mean_v3/p25_v3/p50_v3/p75_v3/point_ens/p{k}_ens` are identical across
  Tasks 3, 4, and the tests; `player` dict shape (`rates/p_dc/bonus`) identical across Tasks 2–4.
- The v1 asymmetry (summed quantiles on DGW) is deliberate spec behavior, not a bug for
  reviewers to "fix".
