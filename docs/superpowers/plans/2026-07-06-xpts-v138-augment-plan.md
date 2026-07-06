# xPts #138 Augment Mini-Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the pre-registered gate for the augment candidate (v1's full feature set including `xmin`, plus the #127 minutes-model outputs `p_play`/`p60`) and record the verdict.

**Architecture:** The walk-forward harness (`walk_forward_v21`) already fits the augment artifact every GW and emits its p50; this cycle adds its p25/p75 emission, a new ~100-line gate module `backtest_aug.py` (evaluate + report + testable `run_gate` seam that dumps the run's frames for the captain-flip diagnostic), the CLAUDE.md-mandated triaged-minors batch, and one full-data gate run. Verdict-only: no serving artifact, no `train.py` branch, no feature-spec module, no parity-fixture changes.

**Tech Stack:** Python 3.12 (`model/.venv`), pandas, statsmodels (untouched), pytest. Local Supabase Postgres at `127.0.0.1:54322` + live FPL bootstrap for the full run.

**Spec:** `docs/superpowers/specs/2026-07-06-xpts-v138-augment-design.md`

## Global Constraints

- **Branch:** all work on `feat/xpts-v138-augment` (already cut from `main`; the spec commit is on it).
- **Toolchain:** `model/` is a separate Python toolchain. Test with `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q` (the venv is **`.venv`**, not `venv`). Do NOT run `npm test`, `tsc`, or `expo lint` for this work — `model/` is excluded from all of them.
- **Pre-registered candidate (spec §2, frozen):** `FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]` exactly as defined in `model/backtest_v21.py`. Gate = (augment MAE < in-run v1 MAE) AND (augment captaincy ≥ in-run v1 captaincy) AND (|coverage of [p25_aug, p75_aug] − 0.50| ≤ 0.10). Eval population: heuristic `xmin ≥ 0.5`. Walk-forward 2025/26 GW 8→38. In-run comparisons only. No post-hoc variants.
- **Byte-identical fits:** do not touch `fit_models`, any `feature_spec*.py`, `minutes_model.py`'s fit/predict paths, `features*.py`, or anything under `supabase/`. The augment p50 path must produce exactly what #127's diagnostic produced (same code path, two added `predict` calls at q 0.25/0.75).
- **Never run `write_report_v21` or `write_report_v2`** (i.e., never execute `backtest_v21.py` or `backtest_v2.py` as `__main__`): each truncates `docs/xpts-model.md` from its own marker to end-of-file, destroying the hand-written subsections and every later section.
- **Detached/long-run commands use absolute paths only** (the persistent shell cwd has bitten twice), with an `echo EXITED rc=$?` sentinel, and must be verified alive ~30 s after launch.
- Commits use conventional-commit style (`feat(model): …`, `test(model): …`, `chore(model): …`, `docs(model): …`).

---

### Task 1: `walk_forward_v21` emits the augment quantiles

**Files:**
- Modify: `model/backtest_v21.py` (the `FEATURE_COLUMNS_AUG` comment block ~line 23; the `out_rows.append` dict ~line 68; the `agg` dict ~line 90)
- Test: `model/tests/test_backtest_v21.py` (extend `test_walk_forward_shapes`, ~line 63)

**Interfaces:**
- Consumes: `art_aug` (already fit per GW inside `walk_forward_v21`), `predict(artifact, features, position, quantile) -> float` from `train.py`.
- Produces: the `walk_forward_v21` results frame gains two columns, `p25_aug: float` and `p75_aug: float`, surviving the `(player_id, gw)` groupby as sums. Task 2's `evaluate_aug` and `run_gate` rely on these exact column names.

- [ ] **Step 1: Extend the shapes test to require the new columns (failing test)**

In `model/tests/test_backtest_v21.py`, change the column assertion inside `test_walk_forward_shapes` from:

```python
    assert {"p50_v1", "p50_aug", "p25", "p50", "p75", "xmin", "hot3"} <= set(results.columns)
```

to:

```python
    assert {"p50_v1", "p50_aug", "p25_aug", "p75_aug",
            "p25", "p50", "p75", "xmin", "hot3"} <= set(results.columns)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py::test_walk_forward_shapes -q`
Expected: FAIL — the set-inclusion assertion (missing `p25_aug`/`p75_aug`).

- [ ] **Step 3: Emit the quantiles**

In `model/backtest_v21.py`, in the `out_rows.append({...})` dict, replace:

```python
                "p50_aug": predict(art_aug, f21, pos, 0.50),
```

with:

```python
                "p25_aug": predict(art_aug, f21, pos, 0.25),
                "p50_aug": predict(art_aug, f21, pos, 0.50),
                "p75_aug": predict(art_aug, f21, pos, 0.75),
```

In the `agg` dict, replace:

```python
    agg = {"actual": "sum", "p50_v1": "sum", "p50_aug": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
```

with:

```python
    agg = {"actual": "sum", "p50_v1": "sum", "p25_aug": "sum",
           "p50_aug": "sum", "p75_aug": "sum", "p25": "sum",
           "p50": "sum", "p75": "sum", "base_form": "sum",
           "position": "first", "xmin": "first", "hot3": "first"}
```

- [ ] **Step 4: Update the `FEATURE_COLUMNS_AUG` registration comment**

In `model/backtest_v21.py`, replace:

```python
# Diagnostic variant (c): v1's columns (incl. xmin) + the minutes outputs.
# NEVER gate-eligible — the pre-registered candidate is FEATURE_COLUMNS_V21.
FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]
```

with:

```python
# Variant (c): v1's columns (incl. xmin) + the minutes outputs. Diagnostic-only
# under #127's registration; #138 pre-registers it as its own gate candidate —
# that gate lives in backtest_aug.py (spec: docs/superpowers/specs/
# 2026-07-06-xpts-v138-augment-design.md §2).
FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]
```

- [ ] **Step 5: Run the file's suite to verify it passes**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -q`
Expected: all PASS (the emit change is additive; `evaluate_v21` ignores unknown columns).

- [ ] **Step 6: Run the whole model suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: all PASS (61+ tests).

- [ ] **Step 7: Commit**

```bash
git add model/backtest_v21.py model/tests/test_backtest_v21.py
git commit -m "feat(model): walk_forward_v21 emits augment p25/p75 (#138)"
```

---

### Task 2: `backtest_aug.py` — the #138 gate module

**Files:**
- Create: `model/backtest_aug.py`
- Test: `model/tests/test_backtest_aug.py` (new)

**Interfaces:**
- Consumes: `walk_forward_v21(history, team_strengths, start_gw, end_gw) -> (results, minutes_rows)` from `backtest_v21.py` — `results` now carries `p25_aug`/`p50_aug`/`p75_aug` (Task 1); `mae`/`captaincy_points`/`interval_coverage`/`within_position_spearman` from `metrics.py`; the shared `synthetic_history`/`synthetic_strengths` fixtures in `model/tests/conftest.py`.
- Produces: `evaluate_aug(results, min_xmin=0.5) -> dict` (keys listed in Step 3's code — Task 4 reads `passes_gate` and the summary numbers), `write_report_aug(metrics, path) -> None`, `run_gate(history, team_strengths, report_path, dump_path=None, start_gw=8, end_gw=38) -> dict`, `REPORT_MARKER_AUG = "<!-- xpts-v138-results -->"`. Task 4 runs `python backtest_aug.py <dump_path>`.

- [ ] **Step 1: Write the failing tests**

Create `model/tests/test_backtest_aug.py`:

```python
"""#138 gate: evaluate_aug fields, _aug-column coverage, report writer scoping,
run_gate results+minutes dump."""
import pandas as pd
import pytest

from backtest_aug import (REPORT_MARKER_AUG, evaluate_aug, run_gate,
                          write_report_aug)


def _mk_results(aug_err: float, cap_flip: bool) -> pd.DataFrame:
    rows = []
    for gw in (8, 9):
        for i in range(10):
            actual = float(i)
            inside = i % 2 == 0            # _aug coverage exactly 0.5
            rows.append({
                "player_id": i, "gw": gw, "position": "MID", "actual": actual,
                "p50_v1": actual + 2.0, "p50_aug": actual + aug_err,
                "p25_aug": actual - 1.0 if inside else actual + 1.0,
                "p75_aug": actual + 1.0 if inside else actual + 2.0,
                # v21 columns present-but-wrong (coverage 0.0): evaluate_aug
                # must NOT read these.
                "p25": actual + 5.0, "p50": actual + 5.0, "p75": actual + 6.0,
                "base_form": actual + 2.0, "xmin": 1.0, "hot3": float(i),
            })
    df = pd.DataFrame(rows)
    if cap_flip:
        # candidate crowns a dud (actual 0); 9.5 only just tops the real max
        # (9 + aug_err), so one distorted row can't flip the MAE comparison.
        df.loc[(df["gw"] == 8) & (df["player_id"] == 0), "p50_aug"] = 9.5
    return df


def test_gate_pass_and_fail_paths():
    ok = evaluate_aug(_mk_results(0.25, cap_flip=False))
    assert ok["beats_v1_mae"] and ok["captaincy_ok"] and ok["coverage_ok"]
    assert ok["passes_gate"]
    bad = evaluate_aug(_mk_results(0.25, cap_flip=True))
    assert bad["beats_v1_mae"] and not bad["captaincy_ok"]
    assert not bad["passes_gate"]


def test_coverage_reads_aug_columns_not_v21():
    m = evaluate_aug(_mk_results(0.25, cap_flip=False))
    # the v21 p25/p75 in the frame give coverage 0.0; the _aug bands were
    # constructed for exactly 0.5 — a 0.5 reading proves column selection.
    assert m["coverage"] == 0.5 and m["coverage_ok"]


def test_eval_filter_uses_heuristic_xmin_and_uncapped_is_everything():
    df = _mk_results(0.25, cap_flip=False)
    df.loc[df["gw"] == 8, "xmin"] = 0.0
    m = evaluate_aug(df)
    assert m["n_eval"] == 10               # only gw 9 rows survive the filter
    assert m["uncapped"]["n"] == 20        # uncapped sees all rows


def _metrics_stub() -> dict:
    return {
        "n_eval": 100, "v1_mae": 2.0632, "aug_mae": 2.0440,
        "base_form_mae": 2.44, "v1_captaincy": 185.0, "aug_captaincy": 186.0,
        "aug_spearman": 0.31, "v1_spearman": 0.30, "coverage": 0.49,
        "beats_v1_mae": True, "captaincy_ok": True, "coverage_ok": True,
        "passes_gate": True,
        "uncapped": {"n": 200, "v1_mae": 2.5, "aug_mae": 2.4},
        "hot_streak": {"n": 20, "aug_signed_error": -1.0,
                       "v1_signed_error": -1.1, "base_form_signed_error": 2.0},
    }


def test_report_appends_after_v21_and_truncates_own_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    prefix = ("# v1\n\n<!-- xpts-v2-results -->\n\nv2 body\n\n"
              "<!-- xpts-v21-results -->\n\nv21 body\n")
    path.write_text(prefix + f"\n{REPORT_MARKER_AUG}\n\nOLD v138 section\n")
    write_report_aug(_metrics_stub(), str(path))
    content = path.read_text()
    assert content.startswith(prefix.rstrip() + "\n\n" + REPORT_MARKER_AUG)
    assert content.count(REPORT_MARKER_AUG) == 1
    assert "OLD v138 section" not in content
    assert "v21 body" in content           # earlier sections untouched
    assert "✅ PASS" in content


def test_report_refuses_duplicate_marker(tmp_path):
    path = tmp_path / "xpts-model.md"
    path.write_text(f"{REPORT_MARKER_AUG}\nx\n{REPORT_MARKER_AUG}\ny\n")
    with pytest.raises(ValueError):
        write_report_aug(_metrics_stub(), str(path))


def test_run_gate_dumps_frames_and_writes_report(tmp_path, synthetic_history,
                                                 synthetic_strengths):
    report = tmp_path / "xpts-model.md"
    report.write_text("# doc\n")
    dump = tmp_path / "results.csv"
    m = run_gate(synthetic_history, synthetic_strengths, str(report),
                 dump_path=str(dump), start_gw=25, end_gw=28)
    dumped = pd.read_csv(dump)
    assert {"p50_v1", "p50_aug", "p25_aug", "p75_aug"} <= set(dumped.columns)
    minutes = pd.read_csv(tmp_path / "results.minutes.csv")
    assert {"player_id", "gw", "p_play", "p60"} <= set(minutes.columns)
    assert m["n_eval"] > 0 and isinstance(m["passes_gate"], bool)
    content = report.read_text()
    assert REPORT_MARKER_AUG in content and "## Gate" in content
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_aug.py -q`
Expected: collection error — `ModuleNotFoundError: No module named 'backtest_aug'`.

- [ ] **Step 3: Write the module**

Create `model/backtest_aug.py`:

```python
"""#138 gate module: the pre-registered augment candidate (v1's columns incl.
xmin + the #127 minutes outputs p_play/p60) vs the in-run v1 benchmark, on
walk_forward_v21's output. Spec:
docs/superpowers/specs/2026-07-06-xpts-v138-augment-design.md.

The candidate's fits/predictions come from walk_forward_v21 (variant (c),
FEATURE_COLUMNS_AUG) — this module only evaluates and reports. Minutes-model
standalone metrics are NOT recomputed here (unchanged from #127)."""
from __future__ import annotations

import os
import sys

import pandas as pd

from backtest_v21 import walk_forward_v21
from metrics import (captaincy_points, interval_coverage, mae,
                     within_position_spearman)

REPORT_MARKER_AUG = "<!-- xpts-v138-results -->"
MODEL_VERSION_AUG = "v21-aug"


def evaluate_aug(results: pd.DataFrame, min_xmin: float = 0.5) -> dict:
    df = results[results["xmin"] >= min_xmin].copy()
    v1_mae = mae(df["p50_v1"], df["actual"])
    aug_mae = mae(df["p50_aug"], df["actual"])
    v1_cap = captaincy_points(df, "p50_v1")
    aug_cap = captaincy_points(df, "p50_aug")
    coverage = interval_coverage(df, "p25_aug", "p75_aug")
    beats_mae = aug_mae < v1_mae
    cap_ok = aug_cap >= v1_cap
    coverage_ok = abs(coverage - 0.5) <= 0.10

    hot_cut = df["hot3"].quantile(0.9)
    hot = df[df["hot3"] >= hot_cut]

    return {
        "n_eval": int(len(df)),
        "v1_mae": v1_mae, "aug_mae": aug_mae,
        "base_form_mae": mae(df["base_form"], df["actual"]),
        "v1_captaincy": v1_cap, "aug_captaincy": aug_cap,
        "aug_spearman": within_position_spearman(df, "p50_aug"),
        "v1_spearman": within_position_spearman(df, "p50_v1"),
        "coverage": coverage,
        "beats_v1_mae": bool(beats_mae),
        "captaincy_ok": bool(cap_ok),
        "coverage_ok": bool(coverage_ok),
        "passes_gate": bool(beats_mae and cap_ok and coverage_ok),
        "uncapped": {
            "n": int(len(results)),
            "v1_mae": mae(results["p50_v1"], results["actual"]),
            "aug_mae": mae(results["p50_aug"], results["actual"]),
        },
        "hot_streak": {
            "n": int(len(hot)),
            "aug_signed_error": float((hot["p50_aug"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "v1_signed_error": float((hot["p50_v1"] - hot["actual"]).mean()) if len(hot) else 0.0,
            "base_form_signed_error": float((hot["base_form"] - hot["actual"]).mean()) if len(hot) else 0.0,
        },
    }


def write_report_aug(metrics: dict, path: str) -> None:
    verdict = ("✅ PASS — revive #128/#130 for this candidate (prospective "
               "validation before any promotion)" if metrics["passes_gate"]
               else "❌ FAIL — documented finding; #128 stays parked")
    hs = metrics["hot_streak"]
    section = f"""{REPORT_MARKER_AUG}

# xPts model — #138 results (augment candidate: v1 + p_play/p60, xmin kept)

**Model version:** `{MODEL_VERSION_AUG}` · pre-registered gate vs v1 on the same
walk-forward (2025/26, GW 8→38, eval among heuristic xmin ≥ 0.5;
n = {metrics['n_eval']}). Candidate = FEATURE_COLUMNS_AUG — v1's full feature
set including xmin, plus the #127 minutes-model outputs p_play/p60.
Spec: `docs/superpowers/specs/2026-07-06-xpts-v138-augment-design.md`.
In-run comparison only: published priors (augment 2.0440 as #127's diagnostic)
drift at the 4th decimal with live team strengths.

## MAE (lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | {metrics['v1_mae']:.4f} |
| (b) augment candidate — v1 + p_play + p60 | {metrics['aug_mae']:.4f} |
| exp-decay form baseline | {metrics['base_form_mae']:.4f} |

Captaincy: candidate {metrics['aug_captaincy']:.0f} vs v1 {metrics['v1_captaincy']:.0f}.
Spearman: candidate {metrics['aug_spearman']:.3f} vs v1 {metrics['v1_spearman']:.3f}.
Coverage of [p25_aug, p75_aug]: {metrics['coverage']:.3f} (target 0.50 ± 0.10).
Uncapped population (n = {metrics['uncapped']['n']}): candidate MAE
{metrics['uncapped']['aug_mae']:.4f} vs v1 {metrics['uncapped']['v1_mae']:.4f}.

## Hot-streak diagnostic (top-decile last-3-GW points; n = {hs['n']})

Mean signed error (pred − actual): candidate {hs['aug_signed_error']:+.3f} ·
v1 {hs['v1_signed_error']:+.3f} · form baseline {hs['base_form_signed_error']:+.3f}.

## Gate

- candidate beats v1 on MAE: **{metrics['beats_v1_mae']}**
- candidate captaincy ≥ v1: **{metrics['captaincy_ok']}**
- Coverage within ±0.10 of 0.50: **{metrics['coverage_ok']}**

**Verdict: {verdict}**
"""
    with open(path) as f:
        content = f.read()
    if content.count(REPORT_MARKER_AUG) > 1:
        raise ValueError("duplicate xpts-v138 marker in report — refusing to write")
    if REPORT_MARKER_AUG in content:
        content = content[: content.index(REPORT_MARKER_AUG)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


def run_gate(history: pd.DataFrame, team_strengths: dict, report_path: str,
             dump_path: str | None = None,
             start_gw: int = 8, end_gw: int = 38) -> dict:
    """The gate run: walk-forward -> (optional) frame dumps -> evaluate ->
    report. Dumps happen BEFORE evaluation so the captain-flip diagnostic
    reads the exact frames that produced the verdict (live-strengths drift
    makes any re-run non-identical). minutes_rows ride along as
    <dump>.minutes.csv for the p60-pathology check."""
    results, minutes_rows = walk_forward_v21(history, team_strengths,
                                             start_gw=start_gw, end_gw=end_gw)
    if dump_path is not None:
        results.to_csv(dump_path, index=False)
        root, ext = os.path.splitext(dump_path)
        minutes_rows.to_csv(f"{root}.minutes{ext}", index=False)
    metrics = evaluate_aug(results)
    write_report_aug(metrics, report_path)
    return metrics


if __name__ == "__main__":
    from data import load_history, load_team_strengths

    report = os.path.normpath(os.path.join(os.path.dirname(__file__), "..",
                                           "docs", "xpts-model.md"))
    dump = sys.argv[1] if len(sys.argv) > 1 else None
    m = run_gate(load_history(), load_team_strengths(), report, dump)
    print(f"[backtest-aug] n={m['n_eval']} v1={m['v1_mae']:.4f} "
          f"aug={m['aug_mae']:.4f} "
          f"cap {m['aug_captaincy']:.0f} vs {m['v1_captaincy']:.0f} "
          f"cov={m['coverage']:.3f} PASS={m['passes_gate']}")
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_aug.py -q`
Expected: 6 PASS (the `run_gate` test runs a short synthetic walk-forward, ~10–30 s).

- [ ] **Step 5: Run the whole model suite**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add model/backtest_aug.py model/tests/test_backtest_aug.py
git commit -m "feat(model): #138 gate module — evaluate_aug + report + run_gate dump seam"
```

---

### Task 3: Triaged-minors batch

Seven items parked from #125/#127, mandated by CLAUDE.md for the next `model/`-touching PR. Items 4–5 are behavioral (a guard + output formatting) and get tests; the rest are behavior-neutral. If any item turns out to be behavior-affecting beyond its description here, drop it from the batch and note it in your report instead of absorbing it silently.

**Files:**
- Modify: `model/backtest_v21.py` (`evaluate_v21`, ~lines 112–119), `model/feature_spec_v2.py` (~line 15), `model/grid_v2.py` (~lines 26–36), `model/backtest_v2.py` (~lines 60–65), `model/minutes_model.py` (`_fit_logit` docstring, ~lines 90–95), `model/emit_parity_fixture.py` (~lines 132, 167, 199)
- Test: `model/tests/test_backtest_v21.py` (two new tests at end of file)

**Interfaces:**
- Consumes: `evaluate_v21(results, minutes_rows, min_xmin=0.5) -> dict` and the `_mk_results`/`_mk_minutes` helpers already in `test_backtest_v21.py`.
- Produces: no interface changes — `evaluate_v21` now raises `ValueError` on empty `minutes_rows`, and its calibration `bucket` strings become `"{left:.3f}–{right:.3f}"`.

- [ ] **Step 1: Write the two failing tests**

Append to `model/tests/test_backtest_v21.py` (note: `import pytest` and `pd` already present in the file):

```python
def test_evaluate_v21_raises_clearly_on_empty_minutes_rows():
    empty = pd.DataFrame(columns=["player_id", "gw", "position", "p_play",
                                  "p60", "xmin", "played", "sixty"])
    with pytest.raises(ValueError, match="minutes_rows is empty"):
        evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), empty)


def test_calibration_buckets_are_readable_ranges():
    m = evaluate_v21(_mk_results(2.0, 0.25, cap_flip=False), _mk_minutes())
    assert m["minutes"]["calibration"]
    for b in m["minutes"]["calibration"]:
        # raw pd.Interval reprs look like "(0.0989, 0.341]" — we want plain
        # "0.099–0.341" ranges in the report table.
        assert "(" not in b["bucket"] and "]" not in b["bucket"]
```

- [ ] **Step 2: Run to verify both fail**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -q`
Expected: 2 FAIL — the empty frame currently crashes opaquely inside `pd.qcut` (not a `ValueError` matching "minutes_rows is empty"), and buckets contain `(`/`]`.

- [ ] **Step 3: Fix items 4 + 5 in `model/backtest_v21.py`**

In `evaluate_v21`, replace:

```python
    m = minutes_rows
    calibration = []
    dec = pd.qcut(m["p60"], 10, duplicates="drop")
    for interval, g in m.groupby(dec, observed=True):
        calibration.append({"bucket": str(interval),
                            "mean_pred": float(g["p60"].mean()),
                            "observed": float(g["sixty"].mean()),
                            "n": int(len(g))})
```

with:

```python
    m = minutes_rows
    if len(m) == 0:
        raise ValueError("evaluate_v21: minutes_rows is empty — the "
                         "walk-forward produced no per-fixture minutes rows")
    calibration = []
    dec = pd.qcut(m["p60"], 10, duplicates="drop")
    for interval, g in m.groupby(dec, observed=True):
        calibration.append({"bucket": f"{interval.left:.3f}–{interval.right:.3f}",
                            "mean_pred": float(g["p60"].mean()),
                            "observed": float(g["sixty"].mean()),
                            "n": int(len(g))})
```

(The committed `docs/xpts-model.md` v21 table keeps its raw reprs — that report is not regenerated; the format change affects future runs only.)

- [ ] **Step 4: Run the two new tests to verify they pass**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/test_backtest_v21.py -q`
Expected: all PASS.

- [ ] **Step 5: Item 1 — remove dead `POSITIONS_V2`**

First verify it is dead: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && grep -rn "POSITIONS_V2" . --include="*.py"`
Expected: exactly one hit — its definition in `feature_spec_v2.py`. Then delete this line from `model/feature_spec_v2.py`:

```python
POSITIONS_V2 = ["GKP", "DEF", "MID", "FWD"]
```

(If grep finds other references, STOP — the item is mis-triaged; skip it and report.)

- [ ] **Step 6: Item 2 — `grid_v2.py` tie-break prefers the incumbent**

In `model/grid_v2.py`, add after the `GRID = {...}` block:

```python
# The frozen defaults (feature_spec_v2). On (4-dp) MAE ties — observed: all
# 18 configs tied — BEST must be the incumbent, not min()'s arbitrary pick.
INCUMBENT = {"window": 10, "alpha": 0.9, "prior_weight": 4}
```

and replace:

```python
    best = min(results, key=lambda r: r[1])
```

with:

```python
    best = min(results, key=lambda r: (round(r[1], 4), r[0] != INCUMBENT))
```

(No test — the module is a live-data script with no test scaffolding; the change is print-only selection logic guarded by the comment.)

- [ ] **Step 7: Item 3 — clarify `decay_alpha=None` at the ablation call-sites**

In `model/backtest_v2.py`, directly above the `art_v1m = fit_models(...)` line, add:

```python
        # decay_alpha=None / form_window=None mean "use the v1 defaults"
        # (fit_models substitutes DECAY_ALPHA / FORM_WINDOW) — NOT "disabled".
        # scaling={} / extra=None are the v2 spec's explicit choices.
```

- [ ] **Step 8: Item 6 — `_fit_logit` docstring stray paren**

In `model/minutes_model.py`, in `_fit_logit`'s docstring, replace the final line:

```python
    path) — never crashes the walk-forward — spec §2)."""
```

with:

```python
    path) — never crashes the walk-forward — spec §2."""
```

- [ ] **Step 9: Item 7 — deduplicate `position_values` in `emit_parity_fixture.py`**

In `model/emit_parity_fixture.py`, add a module-level constant after the existing artifact-path constants near the top of the file:

```python
POSITION_VALUES = {"GKP": 45, "DEF": 50, "MID": 76, "FWD": 86}
```

Then delete all three local `position_values = {"GKP": 45, "DEF": 50, "MID": 76, "FWD": 86}` lines (in `build_v21_cases`, `build_v2_cases`, and `main`) and change every `position_values[pos]` to `POSITION_VALUES[pos]` (three sites).

- [ ] **Step 10: Run the whole model suite (parity freshness tests verify item 7 changed nothing)**

Run: `cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q`
Expected: all PASS — `test_parity_fixture_v2.py`/`test_parity_fixture_v21.py` rebuild cases through the deduplicated code and compare against the committed fixture byte-for-byte.

- [ ] **Step 11: Commit**

```bash
git add model/backtest_v21.py model/tests/test_backtest_v21.py model/feature_spec_v2.py model/grid_v2.py model/backtest_v2.py model/minutes_model.py model/emit_parity_fixture.py
git commit -m "chore(model): triaged-minors batch from #125/#127 (empty-frame guard, calibration ranges, dead POSITIONS_V2, grid tie-break, docstring/comment fixes, POSITION_VALUES dedup)"
```

---

### Task 4: Full-data gate run + captain-flip diagnostic + report

This task is operational (controller-run, not a code subagent): it needs the local Supabase stack, the live FPL bootstrap, and the detached-ops protocol.

**Files:**
- Modify: `docs/xpts-model.md` (the run appends the `<!-- xpts-v138-results -->` section; the diagnostic adds a hand-written subsection)
- Scratch (not committed): `/tmp/xpts-v138/results.csv`, `/tmp/xpts-v138/results.minutes.csv`, `/tmp/xpts-v138/run.log`, `/tmp/xpts-v138/captain_diag_aug.py`

**Interfaces:**
- Consumes: `python backtest_aug.py <dump_path>` (Task 2), the populated local `player_gw_history` (29,747 rows, season 2025/26), the live bootstrap.
- Produces: the recorded verdict — the input to the finishing workflow (PR, issue #138 close-with-finding, #107 index update).

- [ ] **Step 1: Preconditions**

```bash
cd /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model && .venv/bin/python -m pytest tests/ -q
docker exec supabase_db_fantasy-gaffer psql -U postgres -t -c "select count(*) from player_gw_history where season = '2025/26';"
curl -s -H "User-Agent: fpl-gaffer-model/1.0" https://fantasy.premierleague.com/api/bootstrap-static/ | /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model/.venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print(d['events'][0]['deadline_time'], '->', d['events'][-1]['deadline_time'])"
```

Expected: suite green; row count **29747**; deadlines spanning **2025-08 → 2026-05**. **If the deadlines show 2026-08+ the FPL API has rolled over to 2026/27 — STOP and escalate: live strengths would map 2025/26 opponent ids onto the wrong clubs and the run would be invalid** (the fix — pinning strengths per season — is a known future harness lever, out of scope here).

- [ ] **Step 2: Launch the run detached (absolute paths + sentinel)**

```bash
mkdir -p /tmp/xpts-v138
cd /tmp/xpts-v138 && /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model/.venv/bin/python /Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model/backtest_aug.py /tmp/xpts-v138/results.csv > /tmp/xpts-v138/run.log 2>&1; echo "EXITED rc=$?" >> /tmp/xpts-v138/run.log
```

Run detached (background) via the harness. Expected runtime **~10 minutes** (measured for #127's identical walk-forward; the two extra predict calls per row are negligible).

- [ ] **Step 3: Verify alive ~30 s after launch**

The script prints nothing until the final summary, so check the **process**, not the log:

```bash
ps aux | grep "[b]acktest_aug" && tail -5 /tmp/xpts-v138/run.log
```

Expected: the python process present with non-trivial CPU; log empty (no `EXITED`, no traceback). If the process is gone and the log shows `EXITED rc=` non-zero or a traceback, debug before re-launching.

- [ ] **Step 4: On completion, read the verdict**

```bash
tail -3 /tmp/xpts-v138/run.log
```

Expected shape: `[backtest-aug] n=7373 v1=2.06xx aug=2.04xx cap AAA vs BBB cov=0.4xx PASS=True|False` then `EXITED rc=0`. Confirm `docs/xpts-model.md` now ends with the `<!-- xpts-v138-results -->` section and that the v2/v21 sections above it (including their hand-written subsections) are untouched (`git diff docs/xpts-model.md` shows pure append).

- [ ] **Step 5: Captain-flip diagnostic (runs regardless of verdict)**

Write `/tmp/xpts-v138/captain_diag_aug.py`:

```python
"""#138 diagnostic: per-GW captain picks, v1 vs augment, from the gate run's
dumped frames (NO re-run — live-strengths drift makes re-runs non-identical)."""
import sys

import pandas as pd
import requests

results_csv = sys.argv[1]
df = pd.read_csv(results_csv)
df = df[df["xmin"] >= 0.5]
mr = (pd.read_csv(results_csv.replace(".csv", ".minutes.csv"))
      .drop_duplicates(["player_id", "gw"]).set_index(["player_id", "gw"]))

names, etypes = {}, {}
try:
    r = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/",
                     headers={"User-Agent": "fpl-gaffer-model/1.0"}, timeout=15)
    els = r.json()["elements"]
    names = {e["id"]: e["web_name"] for e in els}
except Exception as exc:  # names are a nicety only
    print(f"[diag] name lookup unavailable: {exc}")

rows = []
for gw, g in df.groupby("gw"):
    v1p = g.loc[g["p50_v1"].idxmax()]
    ap = g.loc[g["p50_aug"].idxmax()]
    v1_id, a_id = int(v1p["player_id"]), int(ap["player_id"])
    a_p60 = float(mr.loc[(a_id, gw), "p60"]) if (a_id, gw) in mr.index else float("nan")
    rows.append({
        "gw": gw, "same": v1_id == a_id,
        "v1_pick": names.get(v1_id, v1_id), "v1_actual": v1p["actual"],
        "aug_pick": names.get(a_id, a_id), "aug_actual": ap["actual"],
        "aug_pos": ap["position"], "aug_p60": round(a_p60, 3),
        "delta": ap["actual"] - v1p["actual"],
    })

d = pd.DataFrame(rows)
pd.set_option("display.width", 200)
print(d.to_string(index=False))
diff = d[~d["same"]]
print(f"\n[diag] flips: {len(diff)}/{len(d)}; cumulative delta on flips: "
      f"{diff['delta'].sum():+.0f} (v1 {d['v1_actual'].sum():.0f}, "
      f"aug {d['aug_actual'].sum():.0f})")
patho = d[(d["aug_pos"] == "GKP") | (d["aug_p60"] < 0.5)]
print(f"[diag] pathological aug picks (GKP captain or p60 < 0.5): {len(patho)}")
if len(patho):
    print(patho.to_string(index=False))
if len(diff):
    print("[diag] worst flips:")
    print(diff.nsmallest(5, "delta").to_string(index=False))
```

Run: `/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app/model/.venv/bin/python /tmp/xpts-v138/captain_diag_aug.py /tmp/xpts-v138/results.csv`
Expected: the per-GW table, flip count, pathology count. (~seconds — reads CSVs, no model runs.)

- [ ] **Step 6: Append the hand-written diagnostic subsection**

In `docs/xpts-model.md`, inside the new `#138 results` section, insert **before** the `## Gate` heading a subsection with the diagnostic's actual findings, following this shape (fill every bracketed value from Step 5's output — no brackets may remain):

```markdown
## Captain-flip diagnostic

(Hand-written subsection — re-add if this section is ever regenerated by
`backtest_aug.write_report_aug`.)

Per-GW captain picks are identical in [N]/31 GWs; the flips are GW [list],
with deltas [list] (cumulative [±X] on flipped GWs). Pathological picks
(wrong-position captain or p60 < 0.5): [count + one line each, or "none"].
[2–4 sentences interpreting the result against #127's finding — did the
additive-head pathology recur, soften, or vanish, and what does that imply
for the verdict and for #129.]
```

- [ ] **Step 7: Commit the report**

```bash
git add docs/xpts-model.md
git commit -m "docs(model): #138 augment gate run — verdict + captain-flip diagnostic"
```

Then hand back to the controller for the finishing workflow (PR; on merge: close #138 with the finding, update #107's index; PASS additionally designates #128 revival for this candidate).
