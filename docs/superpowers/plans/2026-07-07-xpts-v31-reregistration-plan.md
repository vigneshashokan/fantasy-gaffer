# xPts v3.1 Re-registration Mini-Cycle (#144) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pre-registered v3.1 gate run — the #129 simulator + a strictly-prior global assist multiplier, judged with median-for-MAE / mean-for-captaincy functionals, a variance-aware two-part captaincy condition, and mid-P PIT coverage — plus the three #143 triaged-minor hygiene tests.

**Architecture:** One tiny new pure module (`assist_scale.py`), two additive changes to `walk_forward_v3` (an `assist_scale` flag and always-on `u_mid` emission), and a new gate module `backtest_v31.py` (captain-picks frame, bootstrap, evaluate, report writer, run_gate) that reuses the existing walk-forward. No frozen module changes; no serving work.

**Tech Stack:** Python 3 (venv at `model/.venv`), pandas/numpy, pytest. Spec: `docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md`.

## Global Constraints

- **The frozen registration (spec §2) — copied verbatim, these exact semantics or nothing:**
  - Single candidate "v3.1" = the #129 simulator with exactly one modeling change (the assist multiplier). No SECONDARY.
  - Point estimate for MAE = the **simulated median** (`p50_v3` column); captaincy ranking = the **simulated mean** (`mean_v3` column).
  - Gate condition 1 (MAE, strict): `MAE(p50_v3) < MAE(p50_v1)` in-run.
  - Gate condition 2 (captaincy, both parts): **C1** — cumulative captain points of the v3.1 pick (argmax `mean_v3` per GW, eval pool) `>` cumulative captain points of the form-baseline pick (argmax `base_form`); **C2** — paired bootstrap over per-GW captain-point deltas `d_t = pts_v3.1(t) − pts_v1(t)`, `N_BOOTSTRAP = 10000` resamples of GW indices with replacement, seed `BOOTSTRAP_SEED = 20260707`; fails iff the 90th percentile of the resampled cumulative delta is `< 0`.
  - Gate condition 3 (coverage, mid-P): per eval row `u_mid = P(draws < actual) + 0.5·P(draws = actual)`; coverage = share of rows with `0.25 ≤ u_mid ≤ 0.75`; must lie within `0.50 ± 0.10`.
  - Walk-forward 2025/26 GW 8→38, eval `xmin ≥ 0.5`, `N_SIMS = 8000`, `V3_SEED_BASE = 20260706` **unchanged**.
- **Frozen modules — do not modify:** `rates_v3.py`, `simulate_v3.py`, `points_rules.py`, `feature_spec_v3.py`, all v1/v2/v2.1 modules (`train.py`, `features*.py`, `feature_spec*.py`, `minutes_model.py`, `match_engine.py`, `backtest_v2.py`, `backtest_v21.py`, `backtest_aug.py`), everything under `supabase/`, all committed artifacts. The ONLY modified existing files are `model/backtest_v3.py` (Task 2's two additive changes) and three test files.
- **Never run `backtest_v2.py`, `backtest_v21.py`, `backtest_aug.py`, or `backtest_v3.py` as `__main__`** — each report writer truncates from its own marker to EOF and would clobber every later section of `docs/xpts-model.md`.
- **Non-mutation pattern (spec §3), verbatim where the multiplier is applied:** `player = {**player, "rates": {**player["rates"], "xa90": player["rates"]["xa90"] * k_assist}}`. Never `*=` into the `build_player_rates` output.
- **Column naming:** the results frame keeps the `_v3` suffix (`mean_v3`, `p50_v3`, …) even when produced with `assist_scale=True`; the v3.1-ness is the run configuration.
- **Environment:** all pytest commands run as `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest <target> -q`. Always absolute paths; the repo shell's cwd is not guaranteed.
- **Branch:** all commits go on `feat/xpts-v31-reregistration` (already exists and is checked out; verify with `git branch --show-current` before the first commit).
- Baseline before this plan: 131 tests passing in `model/tests/`.

---

### Task 1: `assist_scale.py` — the strictly-prior global assist multiplier

**Files:**
- Create: `model/assist_scale.py`
- Test: `model/tests/test_assist_scale.py`

**Interfaces:**
- Consumes: nothing from this plan (pure pandas).
- Produces: `compute_assist_scale(past: pd.DataFrame) -> float` and `ASSIST_SCALE_FALLBACK = 1.0` (float). Task 2 imports `compute_assist_scale` into `backtest_v3.py`. The input frame needs columns `assists` and `expected_assists`; callers pass a pre-filtered `gw < t` frame.

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_assist_scale.py`:

```python
"""assist_scale tests: exact ratio, both fallback paths, the caller's
strictly-prior contract, and the spec §3 non-mutating application pattern."""
import numpy as np
import pandas as pd
import pytest

from assist_scale import ASSIST_SCALE_FALLBACK, compute_assist_scale


def test_exact_ratio():
    past = pd.DataFrame({"assists": [1, 0, 2], "expected_assists": [0.5, 0.5, 1.0]})
    assert compute_assist_scale(past) == pytest.approx(3.0 / 2.0)


def test_empty_frame_falls_back():
    past = pd.DataFrame({"assists": [], "expected_assists": []})
    assert compute_assist_scale(past) == ASSIST_SCALE_FALLBACK


def test_zero_denominator_falls_back():
    past = pd.DataFrame({"assists": [2], "expected_assists": [0.0]})
    assert compute_assist_scale(past) == ASSIST_SCALE_FALLBACK


def test_caller_prior_filter_matters():
    # k is sensitive to which rows the caller includes — proving the
    # strictly-prior contract (pass history[gw < t], never the full frame).
    hist = pd.DataFrame({"gw": [1, 1, 2],
                         "assists": [1, 1, 10],
                         "expected_assists": [1.0, 1.0, 1.0]})
    k_past = compute_assist_scale(hist[hist["gw"] < 2])
    k_full = compute_assist_scale(hist)
    assert k_past == pytest.approx(1.0)
    assert k_full == pytest.approx(4.0)


def test_scaled_application_is_non_mutating_and_non_compounding():
    # The spec §3 mandated application pattern must leave the
    # build_player_rates output — and anything it may share, e.g.
    # rates_v3._EMPTY_PRIOR — untouched, and must not compound on re-application.
    from rates_v3 import _EMPTY_PRIOR, build_player_rates
    prior = pd.DataFrame([{
        "player_id": 1, "gw": 1, "fixture_id": 10, "position": "MID",
        "minutes": 90, "expected_goals": 0.3, "expected_assists": 0.4,
        "saves": 0, "yellow_cards": 0, "red_cards": 0, "own_goals": 0,
        "penalties_missed": 0, "penalties_saved": 0, "bonus": 0,
        "defensive_contribution": 0,
    }])
    k = 1.3
    player = build_player_rates(prior, "MID", {})
    base_xa = player["rates"]["xa90"]
    scaled = {**player, "rates": {**player["rates"],
                                  "xa90": player["rates"]["xa90"] * k}}
    assert scaled["rates"]["xa90"] == pytest.approx(base_xa * k)
    assert player["rates"]["xa90"] == pytest.approx(base_xa)  # source untouched
    scaled2 = {**player, "rates": {**player["rates"],
                                   "xa90": player["rates"]["xa90"] * k}}
    assert scaled2["rates"]["xa90"] == pytest.approx(base_xa * k)  # no compounding
    assert _EMPTY_PRIOR["rates"]["xa90"] == 0.0  # module state pristine
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_assist_scale.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'assist_scale'`

- [ ] **Step 3: Write the implementation**

Create `model/assist_scale.py`:

```python
"""Strictly-prior global assist-rate multiplier for v3.1 (#144, spec §3).

FPL's assist definition is broader than xA (#129 diagnostics: p_assist under
by ~26%); k rescales the xA-derived assist rate to the observed aggregate.
Pure; no I/O. Callers are responsible for passing a pre-filtered gw<t frame
(same contract as rates_v3). On a #128 revival, serving computes k from the
full current-season history at serve time — strictly prior by construction."""
from __future__ import annotations

import pandas as pd

ASSIST_SCALE_FALLBACK = 1.0


def compute_assist_scale(past: pd.DataFrame) -> float:
    if len(past) == 0:
        return ASSIST_SCALE_FALLBACK
    denom = float(past["expected_assists"].sum())
    if denom <= 0.0:
        return ASSIST_SCALE_FALLBACK
    return float(past["assists"].sum()) / denom
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_assist_scale.py -q`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/assist_scale.py model/tests/test_assist_scale.py
git commit -m "feat(model): strictly-prior global assist multiplier (#144 spec §3)"
```

---

### Task 2: `walk_forward_v3` additions — `assist_scale` flag + `u_mid` emission

**Files:**
- Modify: `model/backtest_v3.py` (imports block; `walk_forward_v3` only — `evaluate_v3`, `write_report_v3`, `run_gate`, `__main__` stay byte-identical; add one new module-level helper `mid_p_value`)
- Test: `model/tests/test_backtest_v3.py` (extend the shapes test; add two tests)

**Interfaces:**
- Consumes: `compute_assist_scale(past) -> float` from Task 1.
- Produces (Task 3 relies on these): `walk_forward_v3(history, team_strengths, start_gw=8, end_gw=38, n_sims=N_SIMS, assist_scale=False)` — same return `(results, minutes_rows)`, with `results` gaining a `u_mid` float column in `[0, 1]`; `mid_p_value(total: np.ndarray, actual: float) -> float`.

- [ ] **Step 1: Write the failing tests**

In `model/tests/test_backtest_v3.py`, add to the imports:

```python
from assist_scale import compute_assist_scale
from backtest_v3 import mid_p_value
```

(keep the existing `from backtest_v3 import (REPORT_MARKER_V3, evaluate_v3, run_gate, walk_forward_v3, write_report_v3)` import as is.)

In `test_walk_forward_shapes_and_quantile_coherence`, add `"u_mid"` to the `need` set and append one assertion at the end of the test:

```python
    assert results["u_mid"].between(0.0, 1.0).all()
```

Add two new tests after `test_target_gw_stats_do_not_leak_into_predictions`:

```python
def test_mid_p_value_exact_cases():
    total = np.array([1, 2, 2, 3])
    assert mid_p_value(total, 2.0) == pytest.approx(0.25 + 0.5 * 0.5)
    assert mid_p_value(total, 3.0) == pytest.approx(0.75 + 0.5 * 0.25)
    assert mid_p_value(total, 0.0) == 0.0
    assert mid_p_value(total, 4.0) == 1.0


def test_assist_scale_flag_shifts_p_assist(synthetic_history, synthetic_strengths):
    base, _ = walk_forward_v3(synthetic_history, synthetic_strengths, **FAST)
    scaled, _ = walk_forward_v3(synthetic_history, synthetic_strengths,
                                assist_scale=True, **FAST)
    # Direction-aware: on this fixture k may be < 1 (sparse assists vs xA).
    k = compute_assist_scale(synthetic_history[synthetic_history["gw"] < FAST["start_gw"]])
    assert k != pytest.approx(1.0)
    if k > 1.0:
        assert scaled["p_assist"].mean() > base["p_assist"].mean()
    else:
        assert scaled["p_assist"].mean() < base["p_assist"].mean()
    # No assertion on other components: they share the RNG stream and may
    # legitimately shift when the assist lambda changes.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v3.py -q`
Expected: collection error — `ImportError: cannot import name 'mid_p_value' from 'backtest_v3'`

- [ ] **Step 3: Implement the two additions**

In `model/backtest_v3.py`:

**(a)** Add one import (alphabetical position, after the `baselines` import):

```python
from assist_scale import compute_assist_scale
```

**(b)** Add the helper directly below the `_SIM_KEYS` line:

```python
def mid_p_value(total: np.ndarray, actual: float) -> float:
    """Mid-P PIT of `actual` under the empirical distribution of `total`
    (#144 spec §2: P(draws < a) + 0.5·P(draws = a); exact for the
    integer-valued draw arrays and integer-valued actuals we feed it)."""
    return float((total < actual).mean() + 0.5 * (total == actual).mean())
```

**(c)** Replace `walk_forward_v3` with this version. The changes, and ONLY these: the `assist_scale` parameter; the per-step `k_assist`; the non-mutating scaled copy; `actual_sum` accumulation in `acc`; `u_mid` + `actual_sim` on sim rows; the post-merge consistency assert + `actual_sim` drop. Everything else is copied verbatim from the current function:

```python
def walk_forward_v3(history: pd.DataFrame, team_strengths: dict,
                    start_gw: int = 8, end_gw: int = 38,
                    n_sims: int = N_SIMS,
                    assist_scale: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (results, minutes_rows). results has one row per (player, gw):
    v1 columns aggregated by summing per-fixture quantile predictions (v1's
    existing DGW behavior), v3 columns from elementwise-summed draw arrays
    (quantiles of the sum), ensemble columns from both, and u_mid — the mid-P
    PIT of the row's actual under its own simulated distribution (#144).
    assist_scale=True applies the strictly-prior global assist multiplier
    (#144 spec §3); False preserves #129 behavior."""
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
        k_assist = compute_assist_scale(past) if assist_scale else 1.0
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
            if assist_scale:
                player = {**player, "rates": {**player["rates"],
                                              "xa90": player["rates"]["xa90"] * k_assist}}
            sim = simulate_player_fixture(rng, pos, p_play, p60, player,
                                          lam_against, m_att, m_sav, n=n_sims)
            if pid in acc:
                for k in _SIM_KEYS:
                    acc[pid][k] = acc[pid][k] + sim[k]
                acc[pid]["actual_sum"] += float(target["total_points"])
            else:
                acc[pid] = {k: sim[k] for k in _SIM_KEYS}
                acc[pid]["position"] = pos
                acc[pid]["actual_sum"] = float(target["total_points"])
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
            row["u_mid"] = mid_p_value(arrs["total"], arrs["actual_sum"])
            row["actual_sim"] = arrs["actual_sum"]
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
    if not np.allclose(results["actual"], results["actual_sim"]):
        raise AssertionError(
            "walk_forward_v3: groupby-summed actual != draw-side actual_sum — "
            "the two DGW aggregation paths have drifted")
    results = results.drop(columns=["actual_sim"])
    results["point_ens"] = 0.5 * (results["mean_v3"] + results["p50_v1"])
    for k in (25, 50, 75):
        results[f"p{k}_ens"] = 0.5 * (results[f"p{k}_v3"] + results[f"p{k}_v1"])
    return results, mdf
```

Also update the module docstring's last line by appending: ` #144 adds the assist_scale flag + u_mid emission (spec: docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md).`

- [ ] **Step 4: Run the whole v3 test file to verify everything passes**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v3.py -q`
Expected: all pass (12 tests: the 10 existing — determinism/DGW/leakage/gate/report tests must still pass, proving `assist_scale=False` preserves behavior — plus the 2 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/backtest_v3.py model/tests/test_backtest_v3.py
git commit -m "feat(model): walk_forward_v3 assist_scale flag + mid-P u_mid emission (#144)"
```

---

### Task 3: `backtest_v31.py` — picks frame, bootstrap, evaluate

**Files:**
- Create: `model/backtest_v31.py` (this task: constants, `walk_forward_v31`, `build_captain_picks`, `bootstrap_captaincy`, `evaluate_v31`; Task 4 appends the report writer + `run_gate` + `__main__`)
- Test: `model/tests/test_backtest_v31.py`

**Interfaces:**
- Consumes: `walk_forward_v3(..., assist_scale=True)` and results columns `mean_v3`, `p50_v3`, `p50_v1`, `base_form`, `u_mid`, `actual`, `xmin`, `position`, `hot3` (Task 2); `mae`, `within_position_spearman` from `metrics`.
- Produces (Task 4 relies on these): `MODEL_VERSION_V31 = "v3.1"`, `N_BOOTSTRAP = 10000`, `BOOTSTRAP_SEED = 20260707`, `REPORT_MARKER_V31 = "<!-- xpts-v31-results -->"`; `walk_forward_v31(history, team_strengths, start_gw=8, end_gw=38, n_sims=N_SIMS) -> (pd.DataFrame, pd.DataFrame)`; `build_captain_picks(df) -> pd.DataFrame` with columns `{gw, model, player_id, pred, actual}`, `model ∈ {"v31", "v1", "base"}`; `bootstrap_captaincy(picks, n_boot=N_BOOTSTRAP, seed=BOOTSTRAP_SEED) -> dict` with keys `q10/q50/q90/p_worse/deltas`; `evaluate_v31(results, min_xmin=0.5) -> dict` (key list in the code below — Task 4's report template consumes it verbatim).

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_backtest_v31.py`:

```python
"""backtest_v31 tests (#144): captain-picks argmax + tie semantics vs
captaincy_points, bootstrap gate condition, evaluate_v31 pass/fail per gate
condition (including an explicit full-pass frame), and the walk-forward
wrapper smoke. Report/run_gate tests are appended by Task 4."""
import numpy as np
import pandas as pd
import pytest

from backtest_v31 import (bootstrap_captaincy, build_captain_picks,
                          evaluate_v31, walk_forward_v31)
from metrics import captaincy_points

FAST = dict(start_gw=25, end_gw=28, n_sims=300)


def _picks_input_frame() -> pd.DataFrame:
    # 3 GWs x 3 players; a different clear winner per ranking column.
    rows = []
    for gw in (1, 2, 3):
        for pid, mean_v3, p50_v1, base_form, actual in [
                (1, 9.0, 2.0, 1.0, 8.0),
                (2, 3.0, 8.0, 2.0, 4.0),
                (3, 1.0, 1.0, 9.0, 2.0)]:
            rows.append({"player_id": pid, "gw": gw, "mean_v3": mean_v3,
                         "p50_v1": p50_v1, "base_form": base_form,
                         "actual": actual, "xmin": 1.0})
    return pd.DataFrame(rows)


def test_build_captain_picks_argmax_per_model():
    picks = build_captain_picks(_picks_input_frame())
    assert len(picks) == 9  # 3 gws x 3 models
    v31 = picks[picks["model"] == "v31"]
    assert set(v31["player_id"]) == {1} and float(v31["actual"].sum()) == 24.0
    v1 = picks[picks["model"] == "v1"]
    assert set(v1["player_id"]) == {2} and float(v1["actual"].sum()) == 12.0
    base = picks[picks["model"] == "base"]
    assert set(base["player_id"]) == {3} and float(base["actual"].sum()) == 6.0


def test_captain_pick_tie_matches_captaincy_points():
    # idxmax keeps the first index on ties — must match metrics.captaincy_points.
    df = pd.DataFrame([
        {"player_id": 1, "gw": 1, "mean_v3": 5.0, "p50_v1": 5.0,
         "base_form": 5.0, "actual": 3.0, "xmin": 1.0},
        {"player_id": 2, "gw": 1, "mean_v3": 5.0, "p50_v1": 5.0,
         "base_form": 5.0, "actual": 7.0, "xmin": 1.0},
    ])
    picks = build_captain_picks(df)
    v31_sum = float(picks[picks["model"] == "v31"]["actual"].sum())
    assert v31_sum == captaincy_points(df, "mean_v3")
    assert v31_sum == 3.0


def _picks_from_actuals(v31_actuals, v1_actuals) -> pd.DataFrame:
    rows = []
    for i, (a31, a1) in enumerate(zip(v31_actuals, v1_actuals), start=1):
        rows.append({"gw": i, "model": "v31", "player_id": 1, "pred": 0.0, "actual": a31})
        rows.append({"gw": i, "model": "v1", "player_id": 2, "pred": 0.0, "actual": a1})
        rows.append({"gw": i, "model": "base", "player_id": 3, "pred": 0.0, "actual": 0.0})
    return pd.DataFrame(rows)


def test_bootstrap_all_positive_deltas_pass():
    out = bootstrap_captaincy(_picks_from_actuals([5.0] * 10, [3.0] * 10), n_boot=500)
    assert out["q90"] == pytest.approx(20.0)  # every resample sums to 10 x 2
    assert out["p_worse"] == 0.0


def test_bootstrap_uniform_negative_deltas_fail():
    out = bootstrap_captaincy(_picks_from_actuals([1.0] * 10, [4.0] * 10), n_boot=500)
    assert out["q90"] == pytest.approx(-30.0)
    assert out["q90"] < 0.0
    assert out["p_worse"] == 1.0


def test_bootstrap_is_seed_deterministic():
    picks = _picks_from_actuals([2.0, 9.0, 1.0, 7.0, 3.0], [4.0, 2.0, 6.0, 1.0, 5.0])
    a = bootstrap_captaincy(picks)
    b = bootstrap_captaincy(picks)
    assert a["q90"] == b["q90"] and a["p_worse"] == b["p_worse"]


def test_bootstrap_raises_on_single_gw():
    with pytest.raises(ValueError, match="2 distinct GWs"):
        bootstrap_captaincy(_picks_from_actuals([5.0], [3.0]))


def _v31_frame(median_beats=True, cap_beats_base=True, cap_vs_v1="tie",
               cov_inside=True) -> pd.DataFrame:
    """Hand-built results frame: 4 gws x 4 MID players, one clear captain per
    ranking. cap_vs_v1: "tie" -> v3.1 and v1 both captain player 1 (deltas 0,
    q90 = 0 passes C2 — an exact tie is deliberately a pass); "lose_big" ->
    v3.1 captains a 2-point player every gw (q90 < 0 fails). cov_inside puts
    HALF the u_mid values inside [0.25, 0.75] (coverage 0.5)."""
    rows = []
    for gw in (1, 2, 3, 4):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            err_v31 = 0.5 if median_beats else 3.0
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                # v1 always captains player 1 (actual 10); v1 MAE = 1.25.
                "p50_v1": 8.0 if i == 0 else 1.0,
                # base captains player 4 (actual 2) unless cap_beats_base=False:
                # then player 1, tying v3.1's 40 (C1 needs a STRICT beat).
                "base_form": ((3.0 if i == 3 else 1.0) if cap_beats_base
                              else (9.0 if i == 0 else 1.0)),
                "mean_v3": ((9.5 if i == 0 else 1.0) if cap_vs_v1 == "tie"
                            else (9.5 if i == 1 else 1.0)),
                "p50_v3": actual - err_v31,
                "u_mid": (0.5 if i < 2 else 0.9) if cov_inside else 0.9,
            })
    return pd.DataFrame(rows)


def test_evaluate_v31_full_pass_frame():
    m = evaluate_v31(_v31_frame())
    # median MAE 0.5 < v1 1.25; cap 40 > base 8; deltas all 0 -> q90 = 0 >= 0;
    # coverage 0.5. Every condition — and the gate — must be True.
    assert m["beats_v1_mae"]
    assert m["cap_c1"] and m["cap_c2"] and m["captaincy_ok"]
    assert m["coverage_ok"]
    assert m["passes_gate"] is True
    assert m["v31_captaincy"] == 40.0 and m["base_captaincy"] == 8.0


def test_evaluate_v31_fails_on_median_mae():
    m = evaluate_v31(_v31_frame(median_beats=False))
    assert not m["beats_v1_mae"]
    assert not m["passes_gate"]


def test_evaluate_v31_fails_c1_on_baseline_tie():
    m = evaluate_v31(_v31_frame(cap_beats_base=False))
    assert not m["cap_c1"]
    assert not m["captaincy_ok"] and not m["passes_gate"]


def test_evaluate_v31_fails_c2_on_significant_deficit():
    m = evaluate_v31(_v31_frame(cap_vs_v1="lose_big"))
    assert m["boot"]["q90"] < 0.0
    assert not m["cap_c2"]
    assert not m["captaincy_ok"] and not m["passes_gate"]


def test_evaluate_v31_fails_on_coverage():
    m = evaluate_v31(_v31_frame(cov_inside=False))
    assert m["coverage_mid_p"] == 0.0
    assert not m["coverage_ok"] and not m["passes_gate"]


def test_evaluate_v31_raises_on_empty_frame():
    with pytest.raises(ValueError, match="results frame is empty"):
        evaluate_v31(pd.DataFrame())


def test_walk_forward_v31_smoke(synthetic_history, synthetic_strengths):
    results, minutes_rows = walk_forward_v31(synthetic_history,
                                             synthetic_strengths, **FAST)
    assert {"u_mid", "mean_v3", "p50_v3", "p50_v1", "base_form",
            "xmin"} <= set(results.columns)
    assert len(results) > 0 and len(minutes_rows) > 0
    assert results["u_mid"].between(0.0, 1.0).all()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v31.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'backtest_v31'`

- [ ] **Step 3: Write the implementation**

Create `model/backtest_v31.py`:

```python
"""Walk-forward gate for xPts v3.1 (#144): the #129 simulator + the
strictly-prior global assist multiplier, judged under the re-registered
gate — MAE on the simulated MEDIAN, captaincy on the simulated MEAN with a
variance-aware two-part condition (beats the form baseline outright AND not
significantly worse than v1 by paired bootstrap), and mid-P PIT coverage.
Spec (frozen registration §2):
docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md."""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

from backtest_v3 import walk_forward_v3
from feature_spec_v3 import N_SIMS
from metrics import mae, within_position_spearman

MODEL_VERSION_V31 = "v3.1"
N_BOOTSTRAP = 10000
BOOTSTRAP_SEED = 20260707
REPORT_MARKER_V31 = "<!-- xpts-v31-results -->"

# model label -> the results column whose per-GW argmax is that model's captain
_PICK_COLS = {"v31": "mean_v3", "v1": "p50_v1", "base": "base_form"}


def walk_forward_v31(history: pd.DataFrame, team_strengths: dict,
                     start_gw: int = 8, end_gw: int = 38,
                     n_sims: int = N_SIMS) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The v3.1 candidate IS the v3 walk-forward with the assist multiplier
    on; columns keep the _v3 suffix (the v3.1-ness is this configuration)."""
    return walk_forward_v3(history, team_strengths, start_gw=start_gw,
                           end_gw=end_gw, n_sims=n_sims, assist_scale=True)


def build_captain_picks(df: pd.DataFrame) -> pd.DataFrame:
    """One row per (gw, model): the pick's id, its ranking value, and its
    realized points. Ties resolve by idxmax (first index) — identical to
    metrics.captaincy_points."""
    rows = []
    for gw, g in df.groupby("gw"):
        for model, col in _PICK_COLS.items():
            pick = g.loc[g[col].idxmax()]
            rows.append({"gw": int(gw), "model": model,
                         "player_id": int(pick["player_id"]),
                         "pred": float(pick[col]),
                         "actual": float(pick["actual"])})
    return pd.DataFrame(rows)


def bootstrap_captaincy(picks: pd.DataFrame, n_boot: int = N_BOOTSTRAP,
                        seed: int = BOOTSTRAP_SEED) -> dict:
    """Paired bootstrap of the cumulative per-GW captain-point delta
    (v3.1 − v1). Gate condition C2 = q90 >= 0 (spec §2: fail only if v1 is
    better with >= 90% bootstrap confidence)."""
    wide = picks.pivot(index="gw", columns="model", values="actual")
    if len(wide) < 2:
        raise ValueError("bootstrap_captaincy: need >= 2 distinct GWs")
    deltas = (wide["v31"] - wide["v1"]).to_numpy(dtype=float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(deltas), size=(n_boot, len(deltas)))
    sums = deltas[idx].sum(axis=1)
    return {"q10": float(np.quantile(sums, 0.10)),
            "q50": float(np.quantile(sums, 0.50)),
            "q90": float(np.quantile(sums, 0.90)),
            "p_worse": float((sums < 0).mean()),
            "deltas": deltas}


def evaluate_v31(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    if len(results) == 0:
        raise ValueError("evaluate_v31: results frame is empty — no walk-forward rows")
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    v31_mae = mae(df["p50_v3"], df["actual"])          # registered: simulated MEDIAN
    mean_mae_diag = mae(df["mean_v3"], df["actual"])   # diagnostic (v3's functional)
    picks = build_captain_picks(df)
    cap = picks.groupby("model")["actual"].sum()
    boot = bootstrap_captaincy(picks)

    beats = v31_mae < v1_mae
    cap_c1 = float(cap["v31"]) > float(cap["base"])
    cap_c2 = boot["q90"] >= 0.0
    coverage = float(((df["u_mid"] >= 0.25) & (df["u_mid"] <= 0.75)).mean())
    cov_ok = abs(coverage - 0.5) <= 0.10

    gkp = df[df["position"] == "GKP"]
    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "v31_mae": v31_mae, "mean_mae_diag": mean_mae_diag,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v31_captaincy": float(cap["v31"]), "v1_captaincy": float(cap["v1"]),
        "base_captaincy": float(cap["base"]),
        "boot": {k: boot[k] for k in ("q10", "q50", "q90", "p_worse")},
        "coverage_mid_p": coverage,
        "v31_spearman": within_position_spearman(df, "mean_v3"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "beats_v1_mae": bool(beats),
        "cap_c1": bool(cap_c1), "cap_c2": bool(cap_c2),
        "captaincy_ok": bool(cap_c1 and cap_c2),
        "coverage_ok": bool(cov_ok),
        "passes_gate": bool(beats and cap_c1 and cap_c2 and cov_ok),
        "gkp": {
            "n": int(len(gkp)),
            "v1_mae": mae(gkp["p50_v1"], gkp["actual"]) if len(gkp) else 0.0,
            "v31_mae": mae(gkp["p50_v3"], gkp["actual"]) if len(gkp) else 0.0,
        },
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "v31_mae": mae(results["p50_v3"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "v31_signed_error": float((hot["mean_v3"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }
```

(`os` and `sys` are imported now because Task 4's `run_gate`/`__main__` in this same file use them; a linter may flag them as unused until Task 4 lands — leave them.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v31.py -q`
Expected: `13 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/backtest_v31.py model/tests/test_backtest_v31.py
git commit -m "feat(model): v3.1 gate module — captain picks, paired bootstrap, evaluate_v31 (#144)"
```

---

### Task 4: `write_report_v31` + `run_gate` + `__main__`

**Files:**
- Modify: `model/backtest_v31.py` (append three definitions)
- Test: `model/tests/test_backtest_v31.py` (append four tests)

**Interfaces:**
- Consumes: everything Task 3 produced (exact key names in `evaluate_v31`'s return dict).
- Produces: `write_report_v31(metrics: dict, path: str) -> None`; `run_gate(history, team_strengths, report_path, dump_path=None, start_gw=8, end_gw=38, min_xmin=0.5) -> dict`; a `__main__` block. This is the module the controller runs for the real gate (`.venv/bin/python backtest_v31.py /tmp/xpts-v31/results.csv`).

- [ ] **Step 1: Write the failing tests**

Append to `model/tests/test_backtest_v31.py` — add `import os` and the two new names to the module's backtest_v31 import (`REPORT_MARKER_V31`, `run_gate`, `write_report_v31`), then:

```python
def _metrics() -> dict:
    return evaluate_v31(_v31_frame())


def test_report_appends_after_existing_sections(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("# Header\n\n<!-- xpts-v3-results -->\n\nold v3 section\n")
    write_report_v31(_metrics(), str(p))
    content = p.read_text()
    assert "old v3 section" in content
    assert content.index(REPORT_MARKER_V31) > content.index("old v3 section")


def test_report_truncates_own_marker_only(tmp_path):
    p = tmp_path / "report.md"
    p.write_text("keep me\n\n" + REPORT_MARKER_V31 + "\n\nstale v31 section\n")
    write_report_v31(_metrics(), str(p))
    content = p.read_text()
    assert "keep me" in content and "stale v31 section" not in content
    assert content.count(REPORT_MARKER_V31) == 1


def test_report_refuses_duplicate_marker(tmp_path):
    p = tmp_path / "report.md"
    p.write_text(REPORT_MARKER_V31 + "\n\n" + REPORT_MARKER_V31 + "\n")
    with pytest.raises(ValueError, match="duplicate"):
        write_report_v31(_metrics(), str(p))


def test_run_gate_dumps_three_frames_before_evaluating(tmp_path, synthetic_history,
                                                       synthetic_strengths):
    report = tmp_path / "report.md"
    report.write_text("# xPts model\n")
    dump = tmp_path / "results.csv"
    metrics = run_gate(synthetic_history, synthetic_strengths, str(report),
                       dump_path=str(dump), start_gw=25, end_gw=28)
    assert os.path.exists(dump)
    assert os.path.exists(tmp_path / "results.minutes.csv")
    assert os.path.exists(tmp_path / "results.picks.csv")
    assert isinstance(metrics["passes_gate"], bool)
    assert REPORT_MARKER_V31 in report.read_text()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v31.py -q`
Expected: collection error — `ImportError: cannot import name 'write_report_v31'`

- [ ] **Step 3: Write the implementation**

Append to `model/backtest_v31.py`:

```python
def write_report_v31(metrics: dict, path: str) -> None:
    verdict = ("✅ PASS — revive #128/#130 for this candidate (prospective "
               "validation before any promotion)"
               if metrics["passes_gate"] else
               "❌ FAIL — documented finding; #128 stays parked")
    hs = metrics["hot_streak"]
    b = metrics["boot"]
    section = f"""{REPORT_MARKER_V31}

# xPts model — v3.1 results (re-registration mini-cycle, #144)

**Model version:** `{MODEL_VERSION_V31}` · single pre-registered candidate vs the
in-run v1 benchmark on the same walk-forward (2025/26, GW 8→38, eval among
heuristic xmin ≥ 0.5; n = {metrics['n_eval']}). Candidate = the #129 simulator + a
strictly-prior global assist multiplier. Registered functionals: MAE on the
simulated MEDIAN, captaincy ranking on the simulated MEAN. Coverage = mid-P
PIT (discreteness-aware). Captaincy gate = beats the form baseline outright
AND not significantly worse than v1 (paired bootstrap, N = {N_BOOTSTRAP}, seed
{BOOTSTRAP_SEED}; fail iff q90 < 0). N_SIMS = 8000, seed-pinned per GW. Spec:
`docs/superpowers/specs/2026-07-07-xpts-v31-reregistration-design.md`.
In-run comparison only (live team strengths drift at the 4th decimal).

## MAE (lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) v3.1 — simulated median (registered) | {metrics['v31_mae']:.4f} |
| (c) v3.1 — simulated mean (diagnostic) | {metrics['mean_mae_diag']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy (mean-ranked): v3.1 {metrics['v31_captaincy']:.0f} · v1
{metrics['v1_captaincy']:.0f} · form baseline {metrics['base_captaincy']:.0f}.
Bootstrap Σ(v3.1 − v1) per-GW captain deltas: q10 {b['q10']:+.1f} · q50
{b['q50']:+.1f} · q90 {b['q90']:+.1f} · P(worse) {b['p_worse']:.3f}.
Spearman: v3.1 {metrics['v31_spearman']:.3f} · v1 {metrics['v1_spearman']:.3f}.
Mid-P coverage: {metrics['coverage_mid_p']:.3f} (target 0.50 ± 0.10).
GKP-only MAE (n = {metrics['gkp']['n']}): v3.1 {metrics['gkp']['v31_mae']:.4f}
vs v1 {metrics['gkp']['v1_mae']:.4f}.
Uncapped population (n = {metrics['uncapped']['n']}): v3.1 MAE
{metrics['uncapped']['v31_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): v3.1 (mean) {hs['v31_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

| condition | v3.1 |
|-----------|------|
| beats v1 on MAE (median functional) | **{metrics['beats_v1_mae']}** |
| captaincy C1 — beats form baseline | **{metrics['cap_c1']}** |
| captaincy C2 — bootstrap q90 ≥ 0 vs v1 | **{metrics['cap_c2']}** |
| mid-P coverage within ±0.10 of 0.50 | **{metrics['coverage_ok']}** |

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER_V31) > 1:
        raise ValueError("duplicate xpts-v31 marker in report — refusing to write")
    if REPORT_MARKER_V31 in content:
        content = content[: content.index(REPORT_MARKER_V31)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


def run_gate(history: pd.DataFrame, team_strengths: dict, report_path: str,
             dump_path: str | None = None,
             start_gw: int = 8, end_gw: int = 38,
             min_xmin: float = 0.5) -> dict:
    """Walk-forward -> (optional) frame dumps -> evaluate -> report. Dumps —
    including the captain-picks frame — happen BEFORE evaluation so the
    diagnostics read the exact frames that produced the verdict."""
    results, minutes_rows = walk_forward_v31(history, team_strengths,
                                             start_gw=start_gw, end_gw=end_gw)
    picks = build_captain_picks(results[results["xmin"] >= min_xmin])
    if dump_path is not None:
        results.to_csv(dump_path, index=False)
        root, ext = os.path.splitext(dump_path)
        minutes_rows.to_csv(f"{root}.minutes{ext}", index=False)
        picks.to_csv(f"{root}.picks{ext}", index=False)
    metrics = evaluate_v31(results, min_xmin=min_xmin)
    write_report_v31(metrics, report_path)
    return metrics


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    report = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                           "docs", "xpts-model.md"))
    dump = sys.argv[1] if len(sys.argv) > 1 else None
    m = run_gate(load_history(), load_team_strengths(), report, dump)
    print(f"[backtest-v31] n={m['n_eval']} v1={m['v1_mae']:.4f} "
          f"v31(med)={m['v31_mae']:.4f} mean-diag={m['mean_mae_diag']:.4f} "
          f"cap v31 {m['v31_captaincy']:.0f} vs v1 {m['v1_captaincy']:.0f} "
          f"(base {m['base_captaincy']:.0f}, q90 {m['boot']['q90']:+.1f}) "
          f"cov={m['coverage_mid_p']:.3f} GATE={m['passes_gate']}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v31.py -q`
Expected: `17 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/backtest_v31.py model/tests/test_backtest_v31.py
git commit -m "feat(model): v3.1 report writer + run_gate with picks dump (#144)"
```

---

### Task 5: Hygiene — the three #143 triaged-minor tests + full suite

**Files:**
- Modify: `model/tests/test_backtest_v3.py` (one helper + one test)
- Modify: `model/tests/test_rates_v3.py` (one test)
- Modify: `model/tests/test_simulate_v3.py` (one test)

**Interfaces:**
- Consumes: existing helpers only — `test_backtest_v3.py`'s `evaluate_v3` import; `test_rates_v3.py`'s `hrow`/`frame` helpers; `test_simulate_v3.py`'s `sim` helper. No production code changes: these tests must pass against the CURRENT implementations (they are regression guards, not TDD reds). If any fails, STOP and report — that means one of the #143 latent-bug hypotheses is real.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the ensemble-passing gate-frame test** (guards `evaluate_v3`'s secondary block against a `p25_v3`-for-`p25_ens` style column typo — nothing previously asserted `passes_gate_secondary == True`)

Append to `model/tests/test_backtest_v3.py`:

```python
def _ens_gate_frame() -> pd.DataFrame:
    """SECONDARY-passing frame: the blend beats v1 MAE, matches its captaincy,
    and half its blended intervals cover (coverage 0.5). v3 and v1 intervals
    are set identical per row so the ensemble interval equals both."""
    rows = []
    for gw in (1, 2):
        for i in range(4):
            actual = 10.0 if i == 0 else 2.0
            inside = i < 2
            rows.append({
                "player_id": i + 1, "gw": gw, "position": "MID",
                "actual": actual, "xmin": 1.0, "hot3": float(i),
                "base_form": 2.0,
                "p50_v1": 8.0 if i == 0 else 1.0,
                "p25_v1": actual - 1.0 if inside else actual + 1.0,
                "p75_v1": actual + 1.0 if inside else actual + 2.0,
                "mean_v3": actual - 0.5,
                "p25_v3": actual - 1.0 if inside else actual + 1.0,
                "p50_v3": actual,
                "p75_v3": actual + 1.0 if inside else actual + 2.0,
                "p_goal": 0.3, "p_assist": 0.2, "p_cs_pts": 0.1, "p_haul": 0.05,
            })
    df = pd.DataFrame(rows)
    df["point_ens"] = 0.5 * (df["mean_v3"] + df["p50_v1"])
    for k in (25, 50, 75):
        df[f"p{k}_ens"] = 0.5 * (df[f"p{k}_v3"] + df[f"p{k}_v1"])
    return df


def test_evaluate_secondary_pass_path():
    # ens MAE 0.875 < v1 1.25; ens captains player 1 (ties v1, >= holds);
    # ens coverage 0.5. A p25_v3-for-p25_ens column typo in the secondary
    # block would break this.
    m = evaluate_v3(_ens_gate_frame())
    assert m["beats_v1_mae_ens"] and m["captaincy_ok_ens"] and m["coverage_ok_ens"]
    assert m["passes_gate_secondary"] is True
```

- [ ] **Step 2: Add the rate-window truncation test** (`.head(RATE_WINDOW)` was untested with more than 6 divergent played rows)

Append to `model/tests/test_rates_v3.py` (and add `RATE_WINDOW` to the existing `from feature_spec_v3 import RATE_ALPHA` line):

```python
def test_rate_window_truncates_to_most_recent_played_rows():
    # 8 played rows; the two OLDEST carry an absurd xG. Only the RATE_WINDOW
    # most recent rows (gw 8..3, all xg=0.3, 90') may count.
    rows = [hrow(g, 90, xg=(99.0 if g <= 2 else 0.3)) for g in range(1, 9)]
    prior = frame(rows)
    priors = position_rate_priors(prior)
    out = build_player_rates(prior, "MID", priors)
    w = RATE_ALPHA ** np.arange(RATE_WINDOW)
    expected = 90.0 * float(np.dot(w, np.full(RATE_WINDOW, 0.3))) / float(
        np.dot(w, np.full(RATE_WINDOW, 90.0)))
    assert out["rates"]["xg90"] == pytest.approx(expected)  # = 0.3
    assert out["rates"]["xg90"] < 1.0  # the 99.0 rows fell outside the window
```

- [ ] **Step 3: Add the attacking-lambda cap test** (`LAMBDA_CAP = 3.0` was never tested actually binding on an attacking rate — only the elevated saves cap was exercised)

Append to `model/tests/test_simulate_v3.py` (and add `LAMBDA_CAP` to the existing `from feature_spec_v3 import M_FULL, SAVES_LAMBDA_CAP` line):

```python
def test_goal_lambda_capped_at_lambda_cap():
    # Uncapped goal lambda = 9.0 * 1.0 * (85/90) = 8.5 — far above LAMBDA_CAP;
    # the observed mean must sit at the CAP, not at 8.5.
    out = sim(xg90=9.0, m_att=1.0, lam_against=0.0, n=200000)
    sd = out["goals"].std()
    assert out["goals"].mean() == pytest.approx(
        LAMBDA_CAP, abs=4 * sd / math.sqrt(200000))
```

- [ ] **Step 4: Run the three touched files, then the full suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v3.py tests/test_rates_v3.py tests/test_simulate_v3.py -q`
Expected: all pass.

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: `158 passed` (131 baseline + 5 Task 1 + 2 Task 2 + 13 Task 3 + 4 Task 4 + 3 Task 5; the exact number may differ by ±2 if the baseline count shifted — the requirement is ZERO failures).

- [ ] **Step 5: Commit**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app
git add model/tests/test_backtest_v3.py model/tests/test_rates_v3.py model/tests/test_simulate_v3.py
git commit -m "test(model): #143 triaged minors — ensemble pass path, rate-window truncation, goal-lambda cap"
```

---

## NOT in this plan (controller-run, after all tasks complete and review passes)

The real gate run is the controller's job, per the spec §10 detached-ops protocol — it is NOT a plan task and no subagent should attempt it:

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && \
mkdir -p /tmp/xpts-v31 && \
nohup .venv/bin/python backtest_v31.py /tmp/xpts-v31/results.csv \
  > /tmp/xpts-v31/run.log 2>&1; echo "EXITED rc=$?" >> /tmp/xpts-v31/run.log
```

(~50 min; verify the process is alive and the log growing ~30 s after launch; watch for the `EXITED rc=` sentinel.) Then: diagnostics on `/tmp/xpts-v31/results*.csv`, the hand-written report subsection, verdict, PR, bookkeeping.
