# xPts v2.1 Minutes Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `xmin` starts-share heuristic with a per-position hurdle minutes model (`p_play`, `p60`) and gate the resulting v2.1 candidate on the standing walk-forward backtest (issue #127).

**Architecture:** A pure-Python module (`minutes_model.py`) fits two L1-regularized binary logits per position (P(play), P(60+|play)) on 8 minutes/starts-derived features, with a leakage-safe strictly-prior precompute. Its outputs replace `xmin` in the v1 feature set (`FEATURE_COLUMNS_V21`); a new walk-forward backtest (`backtest_v21.py`) runs the pre-registered candidate against the v1 benchmark and an augment diagnostic, then writes a report section. Spec: `docs/superpowers/specs/2026-07-05-xpts-v21-minutes-model-design.md`.

**Tech Stack:** Python 3.12 (`model/.venv`), pandas, statsmodels (NO sklearn — do not add dependencies), pytest. Local Supabase Postgres for full-data tasks only.

## Global Constraints

- `model/feature_spec.py` (v1) is FROZEN and `feature_spec_v2.py`/`features_v2.py`/`match_engine.py`/`backtest_v2.py` (v2.0) must not be modified. v2.1 declares its own contract in `feature_spec_v21.py`.
- `MODEL_VERSION_V21 = "v2.1.0"` · `MINUTES_CUTOFF = 60` · `MINUTES_WINDOW_LONG = 6` · `MINUTES_WINDOW_SHORT = 3` · `MINUTES_L1_ALPHA = 0.1` (a stability device — never grid over it).
- `MINUTES_FEATURE_COLUMNS` order and `FEATURE_COLUMNS_V21` order are serving contracts once frozen: `FEATURE_COLUMNS_V21` = v1's `FEATURE_COLUMNS` with `xmin` removed, then `p_play`, `p60` appended.
- The all-defaults `fit_models(samples)` / `python train.py` path must remain byte-identical to v1 (existing guard tests in `tests/test_train.py` must stay green).
- Eval population filter = heuristic `xmin ≥ 0.5` (the OLD starts-share value), identical to the v1/v2.0 runs, even though the candidate does not use `xmin` as a feature.
- Pre-registered gate candidate = the replace variant (`FEATURE_COLUMNS_V21`). The augment variant (v1 columns + `p_play` + `p60`) is diagnostic-only and never gate-eligible.
- The v2.1 artifact is committed but NOT wired into serving — nothing in this plan touches `supabase/` or `src/`.
- `write_report_v21` truncates `docs/xpts-model.md` only at its OWN marker `<!-- xpts-v21-results -->`; the v1 and v2 sections above it must be preserved byte-identically. Never regenerate the v2 section.
- All probabilities clipped to `[1e-6, 1 − 1e-6]`. Intercept-only fallbacks serialize in the same shape as fitted models (const = logit(clipped rate), all feature coefficients 0.0).
- Test commands run from the model dir with its venv: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/<file> -v`. Detached full-data commands use ABSOLUTE paths only (persistent-shell cwd gotcha).
- Branch: `feat/xpts-v21-minutes` (already exists; spec + this plan are its first commits).

---

### Task 1: v2.1 feature contract (`feature_spec_v21.py`)

**Files:**
- Create: `model/feature_spec_v21.py`
- Test: `model/tests/test_feature_spec_v21.py`

**Interfaces:**
- Consumes: `FEATURE_COLUMNS` from the frozen `feature_spec.py`.
- Produces (later tasks import these exact names): `MODEL_VERSION_V21: str`, `MINUTES_CUTOFF: int`, `MINUTES_WINDOW_LONG: int`, `MINUTES_WINDOW_SHORT: int`, `MINUTES_L1_ALPHA: float`, `MINUTES_FEATURE_COLUMNS: list[str]`, `FEATURE_COLUMNS_V21: list[str]`.

- [ ] **Step 1: Write the failing test**

`model/tests/test_feature_spec_v21.py`:

```python
"""The v2.1 contract: constants + column composition/order."""
from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import (
    FEATURE_COLUMNS_V21,
    MINUTES_CUTOFF,
    MINUTES_FEATURE_COLUMNS,
    MINUTES_L1_ALPHA,
    MINUTES_WINDOW_LONG,
    MINUTES_WINDOW_SHORT,
    MODEL_VERSION_V21,
)


def test_constants():
    assert MODEL_VERSION_V21 == "v2.1.0"
    assert MINUTES_CUTOFF == 60
    assert (MINUTES_WINDOW_LONG, MINUTES_WINDOW_SHORT) == (6, 3)
    assert MINUTES_L1_ALPHA == 0.1


def test_minutes_feature_columns_order_is_the_contract():
    assert MINUTES_FEATURE_COLUMNS == [
        "start_share_6", "start_share_3", "mins_share_6", "p60_share_6",
        "started_last", "mins_last", "zeros_last_3", "n_prior",
    ]


def test_v21_columns_replace_xmin_with_minutes_outputs():
    assert "xmin" not in FEATURE_COLUMNS_V21
    assert FEATURE_COLUMNS_V21[-2:] == ["p_play", "p60"]
    assert FEATURE_COLUMNS_V21[:-2] == [c for c in FEATURE_COLUMNS if c != "xmin"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_feature_spec_v21.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'feature_spec_v21'`

- [ ] **Step 3: Write the implementation**

`model/feature_spec_v21.py`:

```python
"""Single source of truth for the xPts v2.1 (minutes lever, #127) contract.

v1's feature_spec.py is FROZEN and v2.0's feature_spec_v2.py records the
failed match-engine candidate; v2.1 declares its own constants. The minutes
model replaces the xmin heuristic with hurdle-logit outputs (p_play, p60).
"""

from feature_spec import FEATURE_COLUMNS

MODEL_VERSION_V21 = "v2.1.0"

# Hurdle-model class structure: 0 mins / 1-59 / 60+ (the FPL payoff cliff:
# second appearance point + clean-sheet eligibility at 60).
MINUTES_CUTOFF = 60

# Plain (undecayed) share windows over prior GW rows, most-recent-first —
# consistent with the xmin heuristic these features replace.
MINUTES_WINDOW_LONG = 6
MINUTES_WINDOW_SHORT = 3

# L1 penalty for the minutes logits — a stability device for near-perfect
# separation (GKP starters play 90 or nothing), NOT a tuned hyperparameter
# (#125 lesson: no grids).
MINUTES_L1_ALPHA = 0.1

# Order = serving contract once frozen (a future Deno port must match).
MINUTES_FEATURE_COLUMNS = [
    "start_share_6",
    "start_share_3",
    "mins_share_6",
    "p60_share_6",
    "started_last",
    "mins_last",
    "zeros_last_3",
    "n_prior",
]

# v1's columns with the xmin heuristic REPLACED by the two minutes-model
# outputs. Everything else (form incl. xGI, static strengths, was_home,
# value) stays — a one-lever diff against the champion for clean attribution.
FEATURE_COLUMNS_V21 = [c for c in FEATURE_COLUMNS if c != "xmin"] + ["p_play", "p60"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_feature_spec_v21.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add model/feature_spec_v21.py model/tests/test_feature_spec_v21.py
git commit -m "feat(model): v2.1 feature contract — minutes features + FEATURE_COLUMNS_V21 (#127)"
```

---

### Task 2: Minutes features + training samples (`minutes_model.py`, part 1)

**Files:**
- Create: `model/minutes_model.py`
- Test: `model/tests/test_minutes_model.py`

**Interfaces:**
- Consumes: Task 1's constants.
- Produces: `build_minutes_feature_row(prior_rows: pd.DataFrame) -> dict` (keys == `MINUTES_FEATURE_COLUMNS`; `prior_rows` must be non-empty — first appearances are skipped upstream); `build_minutes_samples(history: pd.DataFrame) -> pd.DataFrame` (columns = `MINUTES_FEATURE_COLUMNS + ["player_id", "gw", "position", "played", "sixty"]`, one row per player-fixture with ≥1 prior GW row; labels `played` = minutes ≥ 1, `sixty` = minutes ≥ `MINUTES_CUTOFF`, both floats 0.0/1.0).

- [ ] **Step 1: Write the failing tests**

`model/tests/test_minutes_model.py`:

```python
"""Minutes feature construction + sample building."""
import pandas as pd
import pytest

from minutes_model import build_minutes_feature_row, build_minutes_samples


def _prior(specs):
    # specs: list of (gw, fixture_id, starts, minutes)
    return pd.DataFrame([{"gw": g, "fixture_id": f, "starts": s, "minutes": m}
                         for g, f, s, m in specs])


def test_windows_and_shares():
    prior = _prior([(1, 10, 1, 90), (2, 20, 1, 90), (3, 30, 0, 20), (4, 40, 1, 90),
                    (5, 50, 0, 0), (6, 60, 1, 65), (7, 70, 0, 10)])
    feat = build_minutes_feature_row(prior)
    # long window = the 6 most recent rows (gws 2..7); short = gws 5..7
    assert feat["start_share_6"] == pytest.approx(3 / 6)
    assert feat["start_share_3"] == pytest.approx(1 / 3)
    assert feat["mins_share_6"] == pytest.approx((10 + 65 + 0 + 90 + 20 + 90) / 6 / 90)
    assert feat["p60_share_6"] == pytest.approx(3 / 6)
    assert feat["started_last"] == 0.0
    assert feat["mins_last"] == pytest.approx(10 / 90)
    assert feat["zeros_last_3"] == 1.0
    assert feat["n_prior"] == 1.0


def test_n_prior_clamp_short_history():
    feat = build_minutes_feature_row(_prior([(1, 10, 1, 90), (2, 20, 0, 0)]))
    assert feat["n_prior"] == pytest.approx(2 / 6)
    assert feat["zeros_last_3"] == 1.0
    assert feat["start_share_3"] == pytest.approx(1 / 2)


def _history():
    rows = []
    for pid, specs in {
        1: [(1, 10, 1, 90), (2, 20, 1, 90), (3, 30, 0, 0)],
        2: [(2, 21, 1, 62), (3, 31, 1, 90), (3, 32, 0, 20)],  # DGW at gw 3
    }.items():
        for g, f, s, m in specs:
            rows.append({"player_id": pid, "gw": g, "fixture_id": f, "starts": s,
                         "minutes": m, "position": "MID"})
    return pd.DataFrame(rows)


def test_samples_skip_first_appearance_and_label():
    s = build_minutes_samples(_history())
    # player 1: gws 2,3 eligible; player 2: both gw-3 rows (gw 2 is his first)
    assert len(s) == 4
    p1_gw3 = s[(s["player_id"] == 1) & (s["gw"] == 3)].iloc[0]
    assert p1_gw3["played"] == 0.0 and p1_gw3["sixty"] == 0.0
    p1_gw2 = s[(s["player_id"] == 1) & (s["gw"] == 2)].iloc[0]
    assert p1_gw2["played"] == 1.0 and p1_gw2["sixty"] == 1.0


def test_dgw_rows_share_features_but_carry_own_labels():
    s = build_minutes_samples(_history())
    dgw = s[(s["player_id"] == 2) & (s["gw"] == 3)]
    assert len(dgw) == 2
    for c in ["start_share_6", "mins_share_6", "n_prior"]:
        assert dgw[c].nunique() == 1          # same prior rows -> same features
    assert sorted(dgw["sixty"]) == [0.0, 1.0]  # per-fixture labels differ
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'minutes_model'`

- [ ] **Step 3: Write the implementation**

`model/minutes_model.py`:

```python
"""Minutes/rotation hurdle model for xPts v2.1 (#127). Pure; no I/O.

Two binary logits per position — play = P(minutes >= 1), p60_given_play =
P(minutes >= 60 | played) — on 8 minutes/starts-derived features. Downstream
features: p_play and p60 = p_play * p60_given_play. Fitting/prediction and
the leakage-safe per-GW precompute complete the module in later tasks.
"""
from __future__ import annotations

import pandas as pd

from feature_spec_v21 import (
    MINUTES_CUTOFF,
    MINUTES_FEATURE_COLUMNS,
    MINUTES_WINDOW_LONG,
    MINUTES_WINDOW_SHORT,
)


def build_minutes_feature_row(prior_rows: pd.DataFrame) -> dict:
    """The 8 minutes features from a player's prior GW rows (any order).
    prior_rows must be non-empty — first appearances are skipped upstream."""
    prior = prior_rows.sort_values(["gw", "fixture_id"], ascending=False)
    long = prior.head(MINUTES_WINDOW_LONG)
    short = prior.head(MINUTES_WINDOW_SHORT)
    last = prior.iloc[0]
    return {
        "start_share_6": float(long["starts"].mean()),
        "start_share_3": float(short["starts"].mean()),
        "mins_share_6": float((long["minutes"] / 90.0).mean()),
        "p60_share_6": float((long["minutes"] >= MINUTES_CUTOFF).mean()),
        "started_last": float(last["starts"]),
        "mins_last": float(last["minutes"]) / 90.0,
        "zeros_last_3": float((short["minutes"] == 0).sum()),
        "n_prior": min(len(prior), MINUTES_WINDOW_LONG) / MINUTES_WINDOW_LONG,
    }


def build_minutes_samples(history: pd.DataFrame) -> pd.DataFrame:
    """One sample per player-fixture row with >= 1 prior GW row. Labels:
    played (minutes >= 1) and sixty (minutes >= MINUTES_CUTOFF)."""
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue
            feat = build_minutes_feature_row(prior)
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "played": 1.0 if target["minutes"] >= 1 else 0.0,
                "sixty": 1.0 if target["minutes"] >= MINUTES_CUTOFF else 0.0,
            })
            rows.append(feat)
    cols = MINUTES_FEATURE_COLUMNS + ["player_id", "gw", "position", "played", "sixty"]
    return pd.DataFrame(rows, columns=cols)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add model/minutes_model.py model/tests/test_minutes_model.py
git commit -m "feat(model): minutes feature construction + training samples (#127)"
```

---

### Task 3: Hurdle fitting + prediction (`minutes_model.py`, part 2)

**Files:**
- Modify: `model/minutes_model.py` (append)
- Test: `model/tests/test_minutes_model.py` (append)

**Interfaces:**
- Consumes: Task 2's `build_minutes_samples` output shape; `POSITIONS` from the frozen `feature_spec.py`.
- Produces: `fit_minutes_models(samples: pd.DataFrame) -> dict` (keys = the 4 positions; each `{"play": entry, "p60_given_play": entry}` where entry = `{"const": float, "<each MINUTES_FEATURE_COLUMNS name>": float}`); `predict_minutes(minutes_models: dict, feature_row: dict, position: str) -> tuple[float, float]` returning `(p_play, p60)`, both clipped to `[1e-6, 1 − 1e-6]`.

- [ ] **Step 1: Write the failing tests**

Append to `model/tests/test_minutes_model.py`:

```python
import math

from feature_spec_v21 import MINUTES_FEATURE_COLUMNS
from minutes_model import fit_minutes_models, predict_minutes


def test_intercept_only_fallback_single_class():
    rows = []
    for i in range(30):
        feat = {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}
        feat.update({"player_id": i, "gw": 2, "position": "GKP",
                     "played": 1.0, "sixty": 1.0})
        rows.append(feat)
    models = fit_minutes_models(pd.DataFrame(rows))
    play = models["GKP"]["play"]
    assert all(play[c] == 0.0 for c in MINUTES_FEATURE_COLUMNS)
    p_play, p60 = predict_minutes(models, {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}, "GKP")
    assert p_play > 0.999 and p60 > 0.999


def test_empty_position_gets_default_fallback():
    # No DEF rows at all -> intercept-only at rate 0.5, never a crash.
    rows = [{**{c: 0.5 for c in MINUTES_FEATURE_COLUMNS},
             "player_id": 1, "gw": 2, "position": "MID", "played": 1.0, "sixty": 0.0}]
    models = fit_minutes_models(pd.DataFrame(rows))
    p_play, _ = predict_minutes(models, {c: 0.5 for c in MINUTES_FEATURE_COLUMNS}, "DEF")
    assert p_play == pytest.approx(0.5, abs=1e-3)


def test_hurdle_math_and_bounds():
    entry = {"const": 0.0}
    entry.update({c: 0.0 for c in MINUTES_FEATURE_COLUMNS})
    models = {"MID": {"play": {**entry, "const": 1.0},
                      "p60_given_play": {**entry, "const": -1.0}}}
    row = {c: 0.0 for c in MINUTES_FEATURE_COLUMNS}
    p_play, p60 = predict_minutes(models, row, "MID")
    assert p_play == pytest.approx(1 / (1 + math.exp(-1.0)))
    assert p60 == pytest.approx(p_play * (1 / (1 + math.exp(1.0))))
    assert 0.0 < p60 < p_play < 1.0


def test_learned_signal_orders_probabilities():
    rows = []
    for i in range(60):
        starter = i % 2 == 0
        base = 0.9 if starter else 0.1
        feat = {"start_share_6": base, "start_share_3": base, "mins_share_6": base,
                "p60_share_6": base, "started_last": 1.0 if starter else 0.0,
                "mins_last": base, "zeros_last_3": 0.0 if starter else 2.0,
                "n_prior": 1.0}
        played = 1.0 if (starter or i % 8 == 1) else 0.0
        sixty = 1.0 if (starter and i % 10 != 2) else 0.0
        feat.update({"player_id": i, "gw": 5, "position": "MID",
                     "played": played, "sixty": sixty})
        rows.append(feat)
    models = fit_minutes_models(pd.DataFrame(rows))
    hi = {"start_share_6": 0.9, "start_share_3": 0.9, "mins_share_6": 0.9,
          "p60_share_6": 0.9, "started_last": 1.0, "mins_last": 0.9,
          "zeros_last_3": 0.0, "n_prior": 1.0}
    lo = {**hi, "start_share_6": 0.1, "start_share_3": 0.1, "mins_share_6": 0.1,
          "p60_share_6": 0.1, "started_last": 0.0, "mins_last": 0.1, "zeros_last_3": 2.0}
    assert predict_minutes(models, hi, "MID")[1] > predict_minutes(models, lo, "MID")[1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: the 4 new tests FAIL with `ImportError: cannot import name 'fit_minutes_models'`; the 4 Task-2 tests still PASS.

- [ ] **Step 3: Write the implementation**

Append to `model/minutes_model.py` (and add `import math`, `import numpy as np`, `import statsmodels.api as sm`, `from feature_spec import POSITIONS`, `from feature_spec_v21 import MINUTES_L1_ALPHA` to the imports):

```python
_P_MIN, _P_MAX = 1e-6, 1.0 - 1e-6


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def _clip(p: float) -> float:
    return min(max(p, _P_MIN), _P_MAX)


def _intercept_only(rate: float) -> dict:
    """Uniform artifact shape: const = logit(clipped rate), all coefs 0."""
    r = _clip(rate)
    entry = {"const": math.log(r / (1.0 - r))}
    entry.update({c: 0.0 for c in MINUTES_FEATURE_COLUMNS})
    return entry


def _fit_logit(df: pd.DataFrame, label: str) -> dict:
    """One L1-regularized logit -> {const, <feature>: coef}. Falls back to
    intercept-only when the subset is too small or single-class (never
    crashes the walk-forward — spec §2)."""
    y = df[label]
    if len(df) <= len(MINUTES_FEATURE_COLUMNS) + 1 or y.nunique() < 2:
        return _intercept_only(float(y.mean()) if len(df) else 0.5)
    X = sm.add_constant(df[MINUTES_FEATURE_COLUMNS], has_constant="add")
    alpha = np.full(X.shape[1], MINUTES_L1_ALPHA)
    alpha[list(X.columns).index("const")] = 0.0  # never penalize the intercept
    res = sm.Logit(y, X).fit_regularized(method="l1", alpha=alpha, disp=0,
                                         maxiter=1000)
    params = res.params
    entry = {"const": float(params.get("const", 0.0))}
    for c in MINUTES_FEATURE_COLUMNS:
        entry[c] = float(params.get(c, 0.0))
    return entry


def fit_minutes_models(samples: pd.DataFrame) -> dict:
    """Per-position hurdle pair: play on all rows, p60_given_play on the
    played subset."""
    models: dict[str, dict] = {}
    for pos in POSITIONS:
        pos_df = samples[samples["position"] == pos]
        played_df = pos_df[pos_df["played"] == 1.0]
        models[pos] = {
            "play": _fit_logit(pos_df, "played"),
            "p60_given_play": _fit_logit(played_df, "sixty"),
        }
    return models


def predict_minutes(minutes_models: dict, feature_row: dict,
                    position: str) -> tuple[float, float]:
    """(p_play, p60) via the hurdle: p60 = p_play * P(60+ | played)."""
    m = minutes_models.get(position)
    if m is None:
        return (0.5, 0.25)

    def _p(entry: dict) -> float:
        z = entry["const"]
        for c in MINUTES_FEATURE_COLUMNS:
            z += entry[c] * float(feature_row[c])
        return _clip(_sigmoid(z))

    p_play = _p(m["play"])
    p60 = _clip(p_play * _p(m["p60_given_play"]))
    return (p_play, p60)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add model/minutes_model.py model/tests/test_minutes_model.py
git commit -m "feat(model): hurdle-logit fitting + prediction with fallbacks (#127)"
```

---

### Task 4: Leakage-safe precompute (`minutes_model.py`, part 3)

**Files:**
- Modify: `model/minutes_model.py` (append)
- Test: `model/tests/test_minutes_model.py` (append)

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `precompute_minutes_predictions(history: pd.DataFrame) -> pd.DataFrame` with columns exactly `["player_id", "gw", "p_play", "p60"]`, one row per (player, gw) that has ≥1 prior GW row. THE invariant: a row's prediction is computed from a model fit on `gw < s` and features from `gw < s` only — never from data at `gw >= s`.

- [ ] **Step 1: Write the failing tests**

Append to `model/tests/test_minutes_model.py`:

```python
from minutes_model import precompute_minutes_predictions


def _history_two_players(gws=8):
    rows = []
    for pid in (1, 2):
        for gw in range(1, gws + 1):
            m = 90 if (gw + pid) % 4 else 0
            rows.append({"player_id": pid, "gw": gw, "fixture_id": gw * 10 + pid,
                         "position": "MID", "starts": 1 if m else 0, "minutes": m})
    return pd.DataFrame(rows)


def test_precompute_columns_and_dgw_dedup():
    h = _history_two_players()
    dgw = pd.DataFrame([{"player_id": 1, "gw": 8, "fixture_id": 999,
                         "position": "MID", "starts": 1, "minutes": 45}])
    preds = precompute_minutes_predictions(pd.concat([h, dgw], ignore_index=True))
    assert list(preds.columns) == ["player_id", "gw", "p_play", "p60"]
    assert len(preds[(preds["player_id"] == 1) & (preds["gw"] == 8)]) == 1
    assert preds["p_play"].between(0, 1).all() and preds["p60"].between(0, 1).all()


def test_leakage_guard_future_rows_do_not_change_past_predictions():
    h = _history_two_players()
    preds_a = precompute_minutes_predictions(h)
    mutated = h.copy()
    mutated.loc[mutated["gw"] >= 5, "minutes"] = 0
    mutated.loc[mutated["gw"] >= 5, "starts"] = 0
    preds_b = precompute_minutes_predictions(mutated)
    a = preds_a[preds_a["gw"] <= 5].reset_index(drop=True)
    b = preds_b[preds_b["gw"] <= 5].reset_index(drop=True)
    pd.testing.assert_frame_equal(a, b)


def test_earliest_gw_uses_fallback_rates():
    preds = precompute_minutes_predictions(_history_two_players(gws=3))
    first = preds[preds["gw"] == 2]
    assert len(first) == 2
    assert first["p_play"].between(0, 1).all()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: 3 new tests FAIL with `ImportError`; 8 prior tests PASS.

- [ ] **Step 3: Write the implementation**

Append to `model/minutes_model.py`:

```python
def _fallback_rates(history_before: pd.DataFrame) -> tuple[float, float]:
    """Empirical (play rate, 60+|played rate) from raw prior rows; (0.5, 0.5)
    when empty. Used for GWs whose prior data yields zero training samples."""
    if len(history_before) == 0:
        return (0.5, 0.5)
    played = history_before["minutes"] >= 1
    p_play = float(played.mean())
    p60g = (float((history_before.loc[played, "minutes"] >= MINUTES_CUTOFF).mean())
            if played.any() else 0.5)
    return (p_play, p60g)


def _rate_models(p_play_rate: float, p60g_rate: float) -> dict:
    return {pos: {"play": _intercept_only(p_play_rate),
                  "p60_given_play": _intercept_only(p60g_rate)}
            for pos in POSITIONS}


def precompute_minutes_predictions(history: pd.DataFrame) -> pd.DataFrame:
    """Leakage-safe per-row (p_play, p60): for each GW s ascending, fit the
    hurdle logits on samples with gw < s and predict every (player, gw=s)
    with >= 1 prior GW row. A row's prediction never depends on data at
    gw >= s — using one model per walk-forward step t to featurize its
    TRAINING rows at s < t would leak row s's own minutes into its own
    points-model feature (spec §2)."""
    samples = build_minutes_samples(history)
    out: list[dict] = []
    for s in sorted(history["gw"].unique()):
        train = samples[samples["gw"] < s]
        if len(train):
            models = fit_minutes_models(train)
        else:
            models = _rate_models(*_fallback_rates(history[history["gw"] < s]))
        # DGW: both same-GW rows share identical features -> predict once.
        gw_rows = samples[samples["gw"] == s].drop_duplicates(["player_id"])
        for _, row in gw_rows.iterrows():
            p_play, p60 = predict_minutes(models, row, row["position"])
            out.append({"player_id": int(row["player_id"]), "gw": int(s),
                        "p_play": p_play, "p60": p60})
    return pd.DataFrame(out, columns=["player_id", "gw", "p_play", "p60"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_minutes_model.py -v`
Expected: 11 PASS

- [ ] **Step 5: Commit**

```bash
git add model/minutes_model.py model/tests/test_minutes_model.py
git commit -m "feat(model): leakage-safe strictly-prior minutes precompute (#127)"
```

---

### Task 5: v2.1 feature rows + samples (`features_v21.py`) and shared test fixtures

**Files:**
- Create: `model/features_v21.py`
- Create: `model/tests/conftest.py`
- Test: `model/tests/test_features_v21.py`

**Interfaces:**
- Consumes: v1's `build_feature_row(prior_rows, target_row, team_strengths) -> dict` (from `features.py`); Task 1's `FEATURE_COLUMNS_V21`; Task 4's precompute frame.
- Produces: `build_feature_row_v21(prior_rows: pd.DataFrame, target_row: pd.Series, team_strengths: dict, minutes_pred: dict) -> dict` (`minutes_pred` = `{"p_play": float, "p60": float}`; the returned dict ALSO carries `xmin` — kept as filter/diagnostic, not a model feature); `build_samples_v21(history, team_strengths, minutes_preds: pd.DataFrame) -> pd.DataFrame` (columns = `FEATURE_COLUMNS_V21 + ["xmin", "player_id", "gw", "position", "target"]`; raises `KeyError` on a missing prediction for an eligible row). Also produces the pytest fixtures `synthetic_history` and `synthetic_strengths` used by Tasks 6–7.

- [ ] **Step 1: Write the shared fixtures**

`model/tests/conftest.py`:

```python
"""Shared deterministic fixtures for v2.1 tests: 8 players (2 per position)
x 30 GWs with rotation patterns and within-position stat variation. No RNG."""
import pandas as pd
import pytest


@pytest.fixture
def synthetic_history() -> pd.DataFrame:
    rows = []
    positions = ["GKP", "DEF", "MID", "FWD"]
    for pid in range(1, 9):
        pos = positions[(pid - 1) % 4]
        rotated = pid in (3, 7)
        for gw in range(1, 31):
            benched = rotated and gw % 5 == 0
            minutes = 0 if benched else (90 if (gw + pid) % 3 else 62)
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
            })
    return pd.DataFrame(rows)


@pytest.fixture
def synthetic_strengths() -> dict:
    return {i: {"strength_attack_home": 1200 + i * 10,
                "strength_attack_away": 1250 + i * 10,
                "strength_defence_home": 1100 + i * 10,
                "strength_defence_away": 1150 + i * 10} for i in range(1, 5)}
```

- [ ] **Step 2: Write the failing tests**

`model/tests/test_features_v21.py`:

```python
"""v2.1 feature rows: v1 machinery + minutes outputs; xmin kept as diagnostic."""
import pandas as pd
import pytest

from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import FEATURE_COLUMNS_V21
from features import build_feature_row
from features_v21 import build_feature_row_v21, build_samples_v21
from minutes_model import precompute_minutes_predictions

STRENGTHS = {5: {"strength_defence_home": 1200, "strength_defence_away": 1300,
                 "strength_attack_home": 1100, "strength_attack_away": 1000}}


def _prior_stats_rows():
    return pd.DataFrame([
        {"gw": 1, "fixture_id": 10, "starts": 1, "minutes": 90, "total_points": 5,
         "expected_goals": 0.2, "expected_assists": 0.1,
         "expected_goal_involvements": 0.3, "threat": 30.0, "creativity": 20.0,
         "influence": 25.0, "bps": 20, "defensive_contribution": 2, "value": 60},
        {"gw": 2, "fixture_id": 20, "starts": 0, "minutes": 20, "total_points": 1,
         "expected_goals": 0.05, "expected_assists": 0.02,
         "expected_goal_involvements": 0.07, "threat": 8.0, "creativity": 5.0,
         "influence": 6.0, "bps": 5, "defensive_contribution": 1, "value": 60},
    ])


def test_row_matches_v1_on_shared_columns_and_adds_minutes_outputs():
    prior = _prior_stats_rows()
    target = pd.Series({"was_home": True, "opponent_team": 5, "value": 60})
    v1 = build_feature_row(prior, target, STRENGTHS)
    v21 = build_feature_row_v21(prior, target, STRENGTHS,
                                {"p_play": 0.8, "p60": 0.6})
    for c in FEATURE_COLUMNS:          # includes xmin — kept as diagnostic
        assert v21[c] == v1[c]
    assert v21["p_play"] == 0.8 and v21["p60"] == 0.6


def test_build_samples_v21_joins_and_raises_on_missing(synthetic_history,
                                                       synthetic_strengths):
    small = synthetic_history[synthetic_history["gw"] <= 5]
    preds = precompute_minutes_predictions(small)
    s = build_samples_v21(small, synthetic_strengths, preds)
    assert "xmin" in s.columns and "xmin" not in FEATURE_COLUMNS_V21
    assert {"p_play", "p60"} <= set(s.columns)
    assert len(s) == 8 * 4             # 8 players x gws 2..5
    with pytest.raises(KeyError):
        build_samples_v21(small, synthetic_strengths, preds[preds["gw"] != 3])


def test_dgw_rows_join_the_single_shared_prediction(synthetic_history,
                                                    synthetic_strengths):
    small = synthetic_history[synthetic_history["gw"] <= 5].copy()
    extra = small[(small["player_id"] == 1) & (small["gw"] == 5)].copy()
    extra["fixture_id"] = 9999          # second fixture, same GW (DGW)
    dgw_history = pd.concat([small, extra], ignore_index=True)
    preds = precompute_minutes_predictions(dgw_history)
    s = build_samples_v21(dgw_history, synthetic_strengths, preds)
    dgw = s[(s["player_id"] == 1) & (s["gw"] == 5)]
    assert len(dgw) == 2                          # one sample per fixture
    assert dgw["p_play"].nunique() == 1           # both join the one prediction
    assert dgw["p60"].nunique() == 1
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_features_v21.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'features_v21'`

- [ ] **Step 4: Write the implementation**

`model/features_v21.py`:

```python
"""v2.1 feature rows: v1's machinery with xmin replaced by the minutes-model
outputs. The heuristic xmin is still computed and carried on every row — it
is the eval-population filter and a diagnostic, NOT a model feature."""
from __future__ import annotations

import pandas as pd

from feature_spec_v21 import FEATURE_COLUMNS_V21
from features import build_feature_row


def build_feature_row_v21(prior_rows: pd.DataFrame, target_row: pd.Series,
                          team_strengths: dict[int, dict],
                          minutes_pred: dict) -> dict:
    """minutes_pred: {'p_play': float, 'p60': float} from the precompute.
    The dict keeps v1's xmin key (diagnostic) alongside the v21 columns."""
    feat = build_feature_row(prior_rows, target_row, team_strengths)
    feat["p_play"] = float(minutes_pred["p_play"])
    feat["p60"] = float(minutes_pred["p60"])
    return feat


def build_samples_v21(history: pd.DataFrame, team_strengths: dict[int, dict],
                      minutes_preds: pd.DataFrame) -> pd.DataFrame:
    """Mirrors features.build_samples; joins the leakage-safe minutes
    predictions on (player_id, gw). A missing prediction for an eligible row
    is a precompute/join bug -> raise, never impute (spec §8)."""
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in minutes_preds.iterrows()}
    rows = []
    for player_id, pdf in history.groupby("player_id"):
        pdf = pdf.sort_values(["gw", "fixture_id"])
        for i in range(len(pdf)):
            target = pdf.iloc[i]
            prior = pdf[pdf["gw"] < target["gw"]]
            if len(prior) == 0:
                continue
            key = (int(player_id), int(target["gw"]))
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            feat = build_feature_row_v21(prior, target, team_strengths,
                                         {"p_play": p_play, "p60": p60})
            feat.update({
                "player_id": int(player_id),
                "gw": int(target["gw"]),
                "position": target["position"],
                "target": float(target["total_points"]),
            })
            rows.append(feat)
    cols = FEATURE_COLUMNS_V21 + ["xmin", "player_id", "gw", "position", "target"]
    return pd.DataFrame(rows, columns=cols)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_features_v21.py -v`
Expected: 3 PASS

- [ ] **Step 6: Commit**

```bash
git add model/features_v21.py model/tests/test_features_v21.py model/tests/conftest.py
git commit -m "feat(model): v2.1 feature rows + samples with minutes-output join (#127)"
```

---

### Task 6: `train_v21` + `--v21` CLI (`train.py`)

**Files:**
- Modify: `model/train.py` (add `train_v21` after `train_v2`; extend the `__main__` block)
- Test: `model/tests/test_train_v21.py`

**Interfaces:**
- Consumes: `fit_models(samples, *, feature_columns, model_version, ..., extra)` (existing — defaults fill v1's decay/window/scaling, which v2.1 intentionally keeps); Tasks 1–5.
- Produces: `train_v21(history: pd.DataFrame, team_strengths: dict) -> dict` — an artifact whose top level matches v1's plus a `minutes` extra-block: `{"cutoff", "window_long", "window_short", "l1_alpha", "feature_columns", "models"}`. CLI: `python train.py --v21` → `model/artifacts/xpts-v21.json`.

- [ ] **Step 1: Write the failing test**

`model/tests/test_train_v21.py`:

```python
"""train_v21 artifact shape: self-describing minutes block + v21 columns."""
from feature_spec_v21 import (FEATURE_COLUMNS_V21, MINUTES_FEATURE_COLUMNS,
                              MODEL_VERSION_V21)
from train import train_v21


def test_train_v21_artifact_shape(synthetic_history, synthetic_strengths):
    artifact = train_v21(synthetic_history, synthetic_strengths)
    assert artifact["model_version"] == MODEL_VERSION_V21
    assert artifact["feature_columns"] == FEATURE_COLUMNS_V21
    minutes = artifact["minutes"]
    assert minutes["cutoff"] == 60
    assert minutes["l1_alpha"] == 0.1
    assert minutes["feature_columns"] == MINUTES_FEATURE_COLUMNS
    for pos in ("GKP", "DEF", "MID", "FWD"):
        assert pos in artifact["coefficients"]
        for head in ("play", "p60_given_play"):
            entry = minutes["models"][pos][head]
            assert set(entry) == {"const", *MINUTES_FEATURE_COLUMNS}
    for pos_coefs in artifact["coefficients"].values():
        for entry in pos_coefs.values():
            assert set(entry) == {"const", *FEATURE_COLUMNS_V21}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_train_v21.py -v`
Expected: FAIL with `ImportError: cannot import name 'train_v21'`

- [ ] **Step 3: Write the implementation**

Add to `model/train.py` after `train_v2`:

```python
def train_v21(history: pd.DataFrame, team_strengths: dict) -> dict:
    """Fit the v2.1 candidate (#127): v1 features with xmin -> (p_play, p60),
    plus the self-describing minutes block. Committed but NOT wired into
    serving (#128 parked pending the gate + prospective validation)."""
    from feature_spec_v21 import (
        FEATURE_COLUMNS_V21, MINUTES_CUTOFF, MINUTES_FEATURE_COLUMNS,
        MINUTES_L1_ALPHA, MINUTES_WINDOW_LONG, MINUTES_WINDOW_SHORT,
        MODEL_VERSION_V21,
    )
    from features_v21 import build_samples_v21
    from minutes_model import (build_minutes_samples, fit_minutes_models,
                               precompute_minutes_predictions)

    # Quantile coefs train on leakage-safe (strictly-prior) minutes features —
    # classic stacking; the SERVED minutes model refits on all rows.
    preds = precompute_minutes_predictions(history)
    samples = build_samples_v21(history, team_strengths, preds)
    minutes_models = fit_minutes_models(build_minutes_samples(history))
    return fit_models(
        samples,
        feature_columns=FEATURE_COLUMNS_V21,
        model_version=MODEL_VERSION_V21,
        extra={"minutes": {
            "cutoff": MINUTES_CUTOFF,
            "window_long": MINUTES_WINDOW_LONG,
            "window_short": MINUTES_WINDOW_SHORT,
            "l1_alpha": MINUTES_L1_ALPHA,
            "feature_columns": MINUTES_FEATURE_COLUMNS,
            "models": minutes_models,
        }},
    )
```

Change the `__main__` block's branch structure to:

```python
    history = load_history()
    if "--v2" in sys.argv:
        artifact = train_v2(history)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v2.json")
        save_artifact(artifact, out)
        print(f"[train] v2: {len(artifact['coefficients'])} position models -> {out}")
    elif "--v21" in sys.argv:
        strengths = load_team_strengths()
        artifact = train_v21(history, strengths)
        out = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v21.json")
        save_artifact(artifact, out)
        print(f"[train] v21: {len(artifact['coefficients'])} position models -> {out}")
    else:
        ...  # existing v1 branch, unchanged
```

(Note: `"--v2" in sys.argv` is exact list membership, so `--v21` does NOT match the `--v2` branch — but keep `--v2` / `--v21` / else structure anyway for readability.)

- [ ] **Step 4: Run tests to verify they pass (including the v1 byte-identity guards)**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_train_v21.py tests/test_train.py tests/test_train_v2.py -v`
Expected: all PASS (statsmodels `IterationLimitWarning` on the synthetic quantile fits is normal — the prod fit warns too).

- [ ] **Step 5: Commit**

```bash
git add model/train.py model/tests/test_train_v21.py
git commit -m "feat(model): train_v21 + --v21 CLI emitting the v2.1 artifact (#127)"
```

---

### Task 7: Probability metrics + walk-forward backtest (`metrics.py`, `backtest_v21.py`)

**Files:**
- Modify: `model/metrics.py` (append two functions)
- Create: `model/backtest_v21.py` (walk-forward + evaluate; the report writer is Task 8)
- Test: `model/tests/test_metrics.py` (append), `model/tests/test_backtest_v21.py`

**Interfaces:**
- Consumes: `build_samples`/`build_feature_row` (v1), `build_samples_v21`/`build_feature_row_v21`, `precompute_minutes_predictions`, `fit_models`/`predict`, `baseline_form`, `hot3_points` (import from `backtest_v2` — do not duplicate), existing metrics.
- Produces: `metrics.log_loss(pred, outcome) -> float` and `metrics.brier(pred, outcome) -> float`; `walk_forward_v21(history, team_strengths, start_gw=8, end_gw=38) -> tuple[pd.DataFrame, pd.DataFrame]` returning `(results, minutes_rows)` — `results` aggregated per (player_id, gw) with columns `player_id, gw, position, actual, p50_v1, p50_aug, p25, p50, p75, base_form, xmin, hot3`; `minutes_rows` per-fixture with `player_id, gw, position, p_play, p60, xmin, played, sixty`; `evaluate_v21(results, minutes_rows, min_xmin=0.5) -> dict` (keys listed in the code below — Task 8's report consumes them verbatim); `FEATURE_COLUMNS_AUG` and `REPORT_MARKER = "<!-- xpts-v21-results -->"`.

- [ ] **Step 1: Write the failing metric tests**

Append to `model/tests/test_metrics.py`:

```python
from metrics import brier, log_loss


def test_log_loss_clips_and_scores():
    import pandas as pd
    perfect = log_loss(pd.Series([1.0, 0.0]), pd.Series([1.0, 0.0]))
    assert perfect < 1e-4                      # clipped, not -inf
    bad = log_loss(pd.Series([0.0, 1.0]), pd.Series([1.0, 0.0]))
    assert bad > perfect


def test_brier():
    import pandas as pd
    assert brier(pd.Series([1.0, 0.0]), pd.Series([1.0, 0.0])) == 0.0
    assert brier(pd.Series([0.5, 0.5]), pd.Series([1.0, 0.0])) == 0.25
```

- [ ] **Step 2: Run to verify failure, then implement the metrics**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_metrics.py -v` → new tests FAIL with `ImportError`.

Append to `model/metrics.py`:

```python
def log_loss(pred: pd.Series, outcome: pd.Series) -> float:
    p = np.clip(np.asarray(pred, float), 1e-6, 1 - 1e-6)
    y = np.asarray(outcome, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def brier(pred: pd.Series, outcome: pd.Series) -> float:
    return float(np.mean((np.asarray(pred, float) - np.asarray(outcome, float)) ** 2))
```

Re-run: all `test_metrics.py` PASS.

- [ ] **Step 3: Write the failing backtest tests**

`model/tests/test_backtest_v21.py`:

```python
"""walk_forward_v21 shapes + evaluate_v21 gate logic and filters."""
import pandas as pd

from backtest_v21 import evaluate_v21, walk_forward_v21


def _mk_results(v1_err: float, v21_err: float, cap_flip: bool) -> pd.DataFrame:
    rows = []
    for gw in (8, 9):
        for i in range(10):
            actual = float(i)
            inside = i % 2 == 0            # coverage exactly 0.5
            rows.append({
                "player_id": i, "gw": gw, "position": "MID", "actual": actual,
                "p50_v1": actual + v1_err, "p50_aug": actual,
                "p25": actual - 1.0 if inside else actual + 1.0,
                "p50": actual + v21_err,
                "p75": actual + 1.0 if inside else actual + 2.0,
                "base_form": actual + 2.0, "xmin": 1.0, "hot3": float(i),
            })
    df = pd.DataFrame(rows)
    if cap_flip:
        # candidate crowns a dud (actual 0) while v1 keeps the true top pick;
        # 9.5 only just tops the candidate's real max (9 + v21_err), so the
        # single distorted row cannot flip the MAE comparison.
        df.loc[(df["gw"] == 8) & (df["player_id"] == 0), "p50"] = 9.5
    return df


def _mk_minutes() -> pd.DataFrame:
    # xmin is WRONG on rows 2/3 (extreme confident misses) so the hurdle
    # model's calibrated p60 must score a lower log-loss.
    return pd.DataFrame({
        "player_id": [1, 2, 3, 4], "gw": [8] * 4, "position": ["MID"] * 4,
        "p_play": [0.95, 0.3, 0.9, 0.4], "p60": [0.9, 0.1, 0.8, 0.2],
        "xmin": [1.0, 1.0, 0.0, 0.0], "played": [1.0, 0.0, 1.0, 1.0],
        "sixty": [1.0, 0.0, 1.0, 0.0],
    })


def test_gate_pass_and_fail_paths():
    ok = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), _mk_minutes())
    assert ok["beats_v1_mae"] and ok["captaincy_ok"] and ok["coverage_ok"]
    assert ok["passes_gate"]
    bad = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=True), _mk_minutes())
    assert bad["beats_v1_mae"] and not bad["captaincy_ok"]
    assert not bad["passes_gate"]


def test_eval_filter_uses_heuristic_xmin_and_uncapped_is_everything():
    df = _mk_results(2.0, 0.25, cap_flip=False)
    df.loc[df["gw"] == 8, "xmin"] = 0.0
    m = evaluate_v21(df, _mk_minutes())
    assert m["n_eval"] == 10               # only gw 9 rows survive the filter
    assert m["uncapped"]["n"] == 20        # uncapped sees all rows
    assert m["minutes"]["logloss_p60"] < m["minutes"]["logloss_xmin"]


def test_walk_forward_shapes(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v21(
        synthetic_history, synthetic_strengths, start_gw=25, end_gw=28)
    assert not results.empty and not minutes_rows.empty
    assert {"p50_v1", "p50_aug", "p25", "p50", "p75", "xmin", "hot3"} <= set(results.columns)
    assert {"p_play", "p60", "played", "sixty", "xmin"} <= set(minutes_rows.columns)
    m = evaluate_v21(results, minutes_rows)
    for k in ("passes_gate", "beats_v1_mae", "captaincy_ok", "coverage_ok"):
        assert isinstance(m[k], bool)
    assert m["minutes"]["n"] == len(minutes_rows)
```

- [ ] **Step 4: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backtest_v21'`

- [ ] **Step 5: Write the implementation**

`model/backtest_v21.py`:

```python
"""Walk-forward backtest for xPts v2.1 (#127): v1 benchmark vs the
pre-registered candidate (xmin -> p_play/p60) vs the augment diagnostic,
the gate, and the minutes model's standalone quality. Report writer is
appended in the next task."""
from __future__ import annotations

import pandas as pd

from backtest_v2 import hot3_points
from baselines import baseline_form
from feature_spec import FEATURE_COLUMNS
from feature_spec_v21 import FEATURE_COLUMNS_V21, MINUTES_CUTOFF, MODEL_VERSION_V21
from features import build_feature_row, build_samples
from features_v21 import build_feature_row_v21, build_samples_v21
from metrics import (brier, captaincy_points, interval_coverage, log_loss,
                     mae, within_position_spearman)
from minutes_model import precompute_minutes_predictions
from train import fit_models, predict

# Diagnostic variant (c): v1's columns (incl. xmin) + the minutes outputs.
# NEVER gate-eligible — the pre-registered candidate is FEATURE_COLUMNS_V21.
FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]

REPORT_MARKER = "<!-- xpts-v21-results -->"


def walk_forward_v21(history: pd.DataFrame, team_strengths: dict,
                     start_gw: int = 8, end_gw: int = 38
                     ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (results, minutes_rows): results aggregated per (player, gw)
    like backtest_v2; minutes_rows stay per-fixture for the standalone
    minutes diagnostics (p60 vs the actual 60+ outcome)."""
    preds = precompute_minutes_predictions(history)
    pred_map = {(int(r["player_id"]), int(r["gw"])):
                (float(r["p_play"]), float(r["p60"]))
                for _, r in preds.iterrows()}
    out_rows: list[dict] = []
    minutes_rows: list[dict] = []
    for t in range(start_gw, end_gw + 1):
        past = history[history["gw"] < t]
        s_v1 = build_samples(past, team_strengths)
        s_v21 = build_samples_v21(past, team_strengths, preds)
        if len(s_v1) == 0 or len(s_v21) == 0:
            continue
        art_v1 = fit_models(s_v1)
        art_v21 = fit_models(s_v21, feature_columns=FEATURE_COLUMNS_V21,
                             model_version=MODEL_VERSION_V21)
        # (c) augment: the v21 frame already carries xmin as a diagnostic
        # column, so the same frame fits v1-columns + minutes outputs.
        art_aug = fit_models(s_v21, feature_columns=FEATURE_COLUMNS_AUG,
                             model_version="v21-aug")
        for _, target in history[history["gw"] == t].iterrows():
            pid = int(target["player_id"])
            prior = history[(history["player_id"] == pid) & (history["gw"] < t)]
            if len(prior) == 0:
                continue
            key = (pid, t)
            if key not in pred_map:
                raise KeyError(f"missing minutes prediction for {key}")
            p_play, p60 = pred_map[key]
            pos = target["position"]
            f1 = build_feature_row(prior, target, team_strengths)
            f21 = build_feature_row_v21(prior, target, team_strengths,
                                        {"p_play": p_play, "p60": p60})
            out_rows.append({
                "player_id": pid, "gw": t, "position": pos,
                "actual": float(target["total_points"]),
                "p50_v1": predict(art_v1, f1, pos, 0.50),
                "p50_aug": predict(art_aug, f21, pos, 0.50),
                "p25": predict(art_v21, f21, pos, 0.25),
                "p50": predict(art_v21, f21, pos, 0.50),
                "p75": predict(art_v21, f21, pos, 0.75),
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
    df = pd.DataFrame(out_rows)
    mdf = pd.DataFrame(minutes_rows)
    if df.empty:
        return df, mdf
    agg = {"actual": "sum", "p50_v1": "sum", "p50_aug": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
    return df.groupby(["player_id", "gw"], as_index=False).agg(agg), mdf


def evaluate_v21(results: pd.DataFrame, minutes_rows: pd.DataFrame,
                 min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    aug_mae = mae(df["p50_aug"], df["actual"])
    v21_mae = mae(df["p50"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    v21_cap = captaincy_points(df, "p50")
    coverage = interval_coverage(df, "p25", "p75")
    beats_mae = v21_mae < v1_mae
    cap_ok = v21_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    m = minutes_rows
    calibration = []
    dec = pd.qcut(m["p60"], 10, duplicates="drop")
    for interval, g in m.groupby(dec, observed=True):
        calibration.append({"bucket": str(interval),
                            "mean_pred": float(g["p60"].mean()),
                            "observed": float(g["sixty"].mean()),
                            "n": int(len(g))})

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "aug_mae": aug_mae, "v21_mae": v21_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "v21_captaincy": v21_cap,
        "v21_spearman": within_position_spearman(df, "p50"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v21_mae": mae(results["p50"], results["actual"]),
        },
        "minutes": {
            "n": int(len(m)),
            "logloss_p60": log_loss(m["p60"], m["sixty"]),
            "logloss_xmin": log_loss(m["xmin"], m["sixty"]),
            "brier_p60": brier(m["p60"], m["sixty"]),
            "brier_xmin": brier(m["xmin"], m["sixty"]),
            "calibration": calibration,
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v21_signed_error": float((hot["p50"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py tests/test_metrics.py -v`
Expected: all PASS (the walk-forward shape test takes ~30–60 s: 30 precompute fits + 4×3 quantile fits on synthetic data).

- [ ] **Step 7: Commit**

```bash
git add model/metrics.py model/backtest_v21.py model/tests/test_metrics.py model/tests/test_backtest_v21.py
git commit -m "feat(model): v2.1 walk-forward backtest + gate + minutes diagnostics (#127)"
```

---

### Task 8: Report writer (`backtest_v21.py`, part 2)

**Files:**
- Modify: `model/backtest_v21.py` (append `write_report_v21` + `__main__`)
- Test: `model/tests/test_backtest_v21.py` (append)

**Interfaces:**
- Consumes: Task 7's `evaluate_v21` metrics dict, `REPORT_MARKER`.
- Produces: `write_report_v21(metrics: dict, path: str) -> None`; a `__main__` runnable against the full local dataset (Task 9 uses it).

- [ ] **Step 1: Write the failing tests**

Append to `model/tests/test_backtest_v21.py`:

```python
import pytest

from backtest_v21 import REPORT_MARKER, write_report_v21


def _metrics_stub() -> dict:
    return {
        "n_eval": 100, "v1_mae": 2.0632, "aug_mae": 2.06, "v21_mae": 2.05,
        "base_form_mae": 2.44, "v1_captaincy": 185.0, "v21_captaincy": 186.0,
        "v21_spearman": 0.31, "v1_spearman": 0.30, "coverage": 0.49,
        "beats_v1_mae": True, "captaincy_ok": True, "coverage_ok": True,
        "passes_gate": True,
        "uncapped": {"n": 200, "v1_mae": 2.5, "v21_mae": 2.4},
        "minutes": {"n": 200, "logloss_p60": 0.4, "logloss_xmin": 0.6,
                    "brier_p60": 0.12, "brier_xmin": 0.2,
                    "calibration": [{"bucket": "(0.0, 0.5]", "mean_pred": 0.3,
                                     "observed": 0.28, "n": 100}]},
        "hot_streak": {"n": 20, "v21_signed_error": -1.0,
                       "v1_signed_error": -1.1, "base_form_signed_error": 2.0},
    }


def test_report_truncates_only_own_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    prefix = "# v1 stuff\n\nv1 body\n\n<!-- xpts-v2-results -->\n\nv2 body\n"
    path.write_text(prefix + f"\n{REPORT_MARKER}\n\nOLD v21 section\n")
    write_report_v21(_metrics_stub(), str(path))
    content = path.read_text()
    assert content.startswith(prefix.rstrip() + "\n\n" + REPORT_MARKER)
    assert content.count(REPORT_MARKER) == 1
    assert "OLD v21 section" not in content
    assert "✅ PASS" in content


def test_report_refuses_duplicate_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    path.write_text(f"{REPORT_MARKER}\nx\n{REPORT_MARKER}\ny\n")
    with pytest.raises(ValueError):
        write_report_v21(_metrics_stub(), str(path))
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -v`
Expected: 2 new tests FAIL with `ImportError: cannot import name 'write_report_v21'`

- [ ] **Step 3: Write the implementation**

Append to `model/backtest_v21.py` (add `import os` to imports):

```python
def _calibration_table(cal: list[dict]) -> str:
    lines = ["| bucket | mean p60 | observed 60+ rate | n |",
             "|--------|----------|-------------------|---|"]
    for b in cal:
        lines.append(f"| {b['bucket']} | {b['mean_pred']:.3f} "
                     f"| {b['observed']:.3f} | {b['n']} |")
    return "\n".join(lines)


def write_report_v21(metrics: dict, path: str) -> None:
    verdict = ("✅ PASS — revive #128/#130 for this candidate (prospective "
               "validation before any promotion)" if metrics["passes_gate"]
               else "❌ FAIL — documented finding; #128 stays parked")
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER}

# xPts model — v2.1 results (minutes model, #127)

**Model version:** `{MODEL_VERSION_V21}` · gate vs v1 on the same walk-forward
(2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5; n = {metrics['n_eval']}).
Spec: `docs/superpowers/specs/2026-07-05-xpts-v21-minutes-model-design.md`.

## Ablation (MAE, lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) candidate — xmin → p_play + p60 | {metrics['v21_mae']:.4f} |
| (c) augment — v1 + p_play + p60 (diagnostic only) | {metrics['aug_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: candidate {metrics['v21_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: candidate {metrics['v21_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25, p75]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).
Uncapped population (n = {metrics['uncapped']['n']}): candidate MAE
{metrics['uncapped']['v21_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Minutes model standalone (per-fixture eval rows, n = {metrics['minutes']['n']})

| metric | hurdle model (p60) | xmin-as-P(60+) baseline |
|--------|--------------------|--------------------------|
| log-loss | {metrics['minutes']['logloss_p60']:.4f} | {metrics['minutes']['logloss_xmin']:.4f} |
| Brier | {metrics['minutes']['brier_p60']:.4f} | {metrics['minutes']['brier_xmin']:.4f} |

### Calibration (p60 deciles)

{_calibration_table(metrics['minutes']['calibration'])}

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): candidate {hs['v21_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

- candidate beats v1 on MAE: **{metrics['beats_v1_mae']}**
- candidate captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER) > 1:
        raise ValueError("duplicate xpts-v21 marker in report — refusing to write")
    if REPORT_MARKER in content:
        content = content[: content.index(REPORT_MARKER)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    history = load_history()
    strengths = load_team_strengths()
    results, minutes_rows = walk_forward_v21(history, strengths)
    metrics = evaluate_v21(results, minutes_rows)
    out = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                        "docs", "xpts-model.md"))
    write_report_v21(metrics, out)
    print(f"[backtest-v21] n={metrics['n_eval']} v1={metrics['v1_mae']:.4f} "
          f"aug={metrics['aug_mae']:.4f} v21={metrics['v21_mae']:.4f} "
          f"cap {metrics['v21_captaincy']:.0f} vs {metrics['v1_captaincy']:.0f} "
          f"cov={metrics['coverage']:.3f} "
          f"minutes-ll {metrics['minutes']['logloss_p60']:.4f} vs "
          f"xmin-ll {metrics['minutes']['logloss_xmin']:.4f} "
          f"PASS={metrics['passes_gate']}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add model/backtest_v21.py model/tests/test_backtest_v21.py
git commit -m "feat(model): v2.1 report writer with own-marker truncation guard (#127)"
```

---

### Task 9: Full-data walk-forward — the gate run

This task runs on the local stack; it is operational, not TDD. **Detached-process protocol is mandatory** (a prior silent failure cost 7 hours): absolute paths everywhere, verify alive + producing output ~30 s after launch, and an explicit process-exit sentinel in the log.

**Files:**
- Modify: `docs/xpts-model.md` (the `__main__` run appends the v21 section)

**Prerequisites (verify, do not assume):**

- [ ] **Step 1: Verify the local stack + data**

```bash
docker exec supabase_db_fantasy-gaffer psql -U postgres -c \
  "select count(*) from public.player_gw_history where season = '2025/26'"
```
Expected: `29747`. If the container is down: `supabase start` from the project root first.

- [ ] **Step 2: Launch detached with an exit sentinel**

```bash
M=/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model
rm -f /tmp/backtest_v21.log
nohup bash -c "$M/.venv/bin/python $M/backtest_v21.py; echo EXITED rc=\$?" \
  >> /tmp/backtest_v21.log 2>&1 &
```

- [ ] **Step 3: Verify alive ~30 s after launch**

```bash
sleep 30 && pgrep -f backtest_v21.py && tail -5 /tmp/backtest_v21.log
```
Expected: a PID, plus the known benign `pandas ... SQLAlchemy` UserWarning in the log. **If no PID or the log shows a Traceback/`EXITED`, stop and diagnose — do not wait.**

- [ ] **Step 4: Monitor to completion**

Poll `grep -c "EXITED" /tmp/backtest_v21.log` every few minutes. Expected runtime ~40–60 min (34 GWs × 3 quantile-artifact fits + 38 precompute fits; the L1 logits add a few minutes over v2.0's 39-min run). On completion, expect `EXITED rc=0` and a final `[backtest-v21] …` summary line.

- [ ] **Step 5: Sanity-check the harness against the published benchmark**

From the summary line: `v1=` must be ≈ `2.0632` and `n=` ≈ `7373` (the harness must reproduce v1's published walk-forward numbers — if not, there is a harness bug; stop and investigate before reading anything into the candidate's numbers). Confirm `docs/xpts-model.md` now ends with the `<!-- xpts-v21-results -->` section and the v1/v2 sections above it are untouched (`git diff docs/xpts-model.md` shows additions only after the v21 marker).

- [ ] **Step 6: Commit the report (whatever the verdict)**

```bash
git add docs/xpts-model.md
git commit -m "docs(model): v2.1 minutes-model walk-forward results + gate verdict (#127)"
```

**Note:** the gate verdict (PASS/FAIL) decides the arc's next move (#128 revival vs documented finding) but does NOT change the remaining tasks — the artifact + parity fixture (Task 10) are committed either way, exactly as v2.0 did.

---

### Task 10: Full-data artifact + parity-fixture v21 block + freshness guard

**Files:**
- Create: `model/artifacts/xpts-v21.json` (generated)
- Modify: `model/emit_parity_fixture.py` (add `_prior_v21`, `build_v21_cases`, wire into `main()`)
- Modify: `model/artifacts/parity-fixture.json` (regenerated)
- Test: `model/tests/test_parity_fixture_v21.py`

**Interfaces:**
- Consumes: `train.py --v21` (Task 6); `build_minutes_feature_row`, `predict_minutes` (Tasks 2–3); `build_feature_row_v21` (Task 5); the existing `_prior(pos)`, `CLUB_STRENGTHS`, `POSITIONS`, `predict` in `emit_parity_fixture.py`.
- Produces: a `v21` key in `parity-fixture.json` (v1 top-level and `v2` blocks byte-identical to before); `build_v21_cases() -> dict` importable by the freshness test.

- [ ] **Step 1: Train the full-data artifact**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
  .venv/bin/python train.py --v21
```
Expected: `[train] v21: 4 position models -> .../artifacts/xpts-v21.json` (takes a few minutes — the precompute runs inside). Inspect: the JSON has `"model_version": "v2.1.0"` and a `"minutes"` block with 4 positions × `play`/`p60_given_play`.

- [ ] **Step 2: Extend the emitter**

Add to `model/emit_parity_fixture.py` (below `_prior`; add the imports shown):

```python
from feature_spec_v21 import FEATURE_COLUMNS_V21, MINUTES_FEATURE_COLUMNS, MODEL_VERSION_V21
from features_v21 import build_feature_row_v21
from minutes_model import build_minutes_feature_row, predict_minutes

_ART_V21 = os.path.join(os.path.dirname(__file__), "artifacts", "xpts-v21.json")

# v2.1 cases get a third, rotation-flavoured prior row so the minutes
# features exercise the zeros/short-minutes paths. _prior itself is shared
# with the v1/v2 cases and MUST stay byte-identical.
_V21_EXTRA_ROW = {
    "GKP": {"gw": 3, "fixture_id": 30, "starts": 0, "minutes": 0, "total_points": 0,
            "expected_goals": 0.0, "expected_assists": 0.0,
            "expected_goal_involvements": 0.0, "threat": 0.0, "creativity": 0.0,
            "influence": 0.0, "bps": 0, "defensive_contribution": 0, "value": 45},
    "DEF": {"gw": 3, "fixture_id": 30, "starts": 0, "minutes": 0, "total_points": 0,
            "expected_goals": 0.0, "expected_assists": 0.0,
            "expected_goal_involvements": 0.0, "threat": 0.0, "creativity": 0.0,
            "influence": 0.0, "bps": 0, "defensive_contribution": 0, "value": 50},
    "MID": {"gw": 3, "fixture_id": 30, "starts": 0, "minutes": 25, "total_points": 1,
            "expected_goals": 0.05, "expected_assists": 0.04,
            "expected_goal_involvements": 0.09, "threat": 6.0, "creativity": 5.0,
            "influence": 4.0, "bps": 4, "defensive_contribution": 1, "value": 76},
    "FWD": {"gw": 3, "fixture_id": 30, "starts": 0, "minutes": 30, "total_points": 2,
            "expected_goals": 0.10, "expected_assists": 0.02,
            "expected_goal_involvements": 0.12, "threat": 12.0, "creativity": 3.0,
            "influence": 6.0, "bps": 6, "defensive_contribution": 0, "value": 86},
}


def _prior_v21(pos: str) -> pd.DataFrame:
    return pd.concat([_prior(pos), pd.DataFrame([_V21_EXTRA_ROW[pos]])],
                     ignore_index=True)


def build_v21_cases() -> dict:
    with open(_ART_V21) as f:
        artifact = json.load(f)
    position_values = {"GKP": 45, "DEF": 50, "MID": 76, "FWD": 86}
    cases = []
    for i, pos in enumerate(POSITIONS):
        if pos not in artifact["coefficients"]:
            continue
        prior = _prior_v21(pos)
        mf = build_minutes_feature_row(prior)
        p_play, p60 = predict_minutes(artifact["minutes"]["models"], mf, pos)
        target = pd.Series({"was_home": bool(i % 2), "opponent_team": 5,
                            "value": position_values[pos]})
        feat = build_feature_row_v21(prior, target, CLUB_STRENGTHS,
                                     {"p_play": p_play, "p60": p60})
        cases.append({
            "position": pos,
            "prior_rows": prior.to_dict(orient="records"),
            "target": {"was_home": bool(target["was_home"]),
                       "opponent_team": 5, "value": int(target["value"])},
            "club_strengths": {str(k): v for k, v in CLUB_STRENGTHS.items()},
            "expected_minutes_features": {c: mf[c] for c in MINUTES_FEATURE_COLUMNS},
            "expected_minutes": {"p_play": p_play, "p60": p60},
            "expected_features": {c: feat[c] for c in FEATURE_COLUMNS_V21},
            "expected": {
                "p25": predict(artifact, feat, pos, 0.25),
                "p50": predict(artifact, feat, pos, 0.50),
                "p75": predict(artifact, feat, pos, 0.75),
            },
        })
    return {"model_version": MODEL_VERSION_V21, "cases": cases}
```

In `main()`, change the output line to include the new block:

```python
    out = {"model_version": MODEL_VERSION, "cases": cases,
           "v2": build_v2_cases(), "v21": build_v21_cases()}
```

- [ ] **Step 3: Write the freshness guard**

`model/tests/test_parity_fixture_v21.py`:

```python
"""Freshness guard: the committed parity-fixture v21 block must equal a fresh
build_v21_cases() run. Fails if minutes_model/features_v21/feature_spec_v21 or
the v21 artifact change without re-running emit_parity_fixture.py."""
import json
import os

from emit_parity_fixture import build_v21_cases

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "artifacts",
                        "parity-fixture.json")


def test_committed_v21_block_is_fresh():
    with open(_FIXTURE) as f:
        committed = json.load(f)["v21"]
    fresh = json.loads(json.dumps(build_v21_cases()))  # normalize via JSON round-trip
    assert committed == fresh, (
        "parity-fixture.json v21 block is stale — re-run emit_parity_fixture.py"
    )
```

- [ ] **Step 4: Regenerate the fixture and verify the old blocks are untouched**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
  .venv/bin/python emit_parity_fixture.py && \
  git diff --stat model/artifacts/parity-fixture.json
```
Then verify only the `v21` key changed:

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
  .venv/bin/python - <<'EOF'
import json, subprocess
old = json.loads(subprocess.run(
    ["git", "show", "HEAD:model/artifacts/parity-fixture.json"],
    capture_output=True, text=True, check=True).stdout)
new = json.load(open("artifacts/parity-fixture.json"))
assert {k: v for k, v in new.items() if k != "v21"} == old, "v1/v2 blocks changed!"
print("v1 + v2 blocks byte-identical; v21 block added")
EOF
```
Expected: `v1 + v2 blocks byte-identical; v21 block added`

- [ ] **Step 5: Run the full model suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests -q`
Expected: all PASS (including the v2 freshness guard `test_parity_fixture_v2.py` — proof the regeneration didn't disturb the v2 block).

- [ ] **Step 6: Commit**

```bash
git add model/artifacts/xpts-v21.json model/artifacts/parity-fixture.json \
        model/emit_parity_fixture.py model/tests/test_parity_fixture_v21.py
git commit -m "feat(model): v2.1 artifact + parity-fixture v21 block + freshness guard (#127)"
```

---

## Post-plan (controller work, not tasks)

Final whole-branch review → PR → merge per superpowers:finishing-a-development-branch. Then arc bookkeeping by gate verdict: **PASS** → revive #128/#130 for this candidate, update #107's issue map; **FAIL** → record the finding in #127/#107, keep #128 parked, proceed to #126 (external xG) design. Update `CLAUDE.md`'s v2 section and memory either way. The v2.1 artifact must NOT be wired into `fpl-project` serving regardless of verdict.
