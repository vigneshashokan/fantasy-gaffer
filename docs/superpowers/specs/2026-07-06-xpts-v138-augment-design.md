# xPts #138 — augment candidate mini-cycle (v1 + p_play/p60, xmin kept)

**Issue:** #138 · **Parent arc:** #107 (xPts v2) · **Date:** 2026-07-06
**Prior art:** `docs/superpowers/specs/2026-07-05-xpts-v21-minutes-model-design.md` (#127 — the
minutes model this candidate consumes), `docs/xpts-model.md` (v2.1 section — the verdict and
captaincy diagnostic that motivated this issue).

This is a **pre-registered mini-cycle, not a full design cycle**: the model, features, and
walk-forward harness all exist. The work is a small harness extension, one gate run, and the
verdict.

## 1. Context & goal

#127's backtest ran the **augment** variant — v1's full feature set *including* `xmin`, plus the
minutes-model outputs `p_play`/`p60` — as a diagnostic-only ablation. It scored **MAE 2.0440**,
the best of anything tested to date (v1 2.0629, #127's replace-candidate 2.0497). Per
pre-registration discipline it could not be promoted post hoc; this cycle is its own
pre-registered run.

**Honest risk, stated up front:** the augment keeps exactly the features that produced #127's
captaincy pathologies (GW8 goalkeeper captain; GW20 `p60 = 0.41` captain). `p_play`/`p60` sit
≈ 0.9 across the eval population (near-collinear with the intercept), so coefficient instability
may recur and fail captaincy the same way. Measuring is cheap either way; a FAIL further
confirms the additive-head bottleneck and strengthens the #129 case.

## 2. Pre-registration (this section IS the registration — frozen before the run)

- **Candidate:** `FEATURE_COLUMNS_AUG = FEATURE_COLUMNS + ["p_play", "p60"]`, exactly as already
  defined in `model/backtest_v21.py`. v1's columns (including `xmin`) plus the two minutes-model
  outputs. Per-position linear quantile regression at q 0.25/0.50/0.75, same `fit_models` path,
  in-memory `model_version="v21-aug"`.
- **Benchmark:** v1 (`FEATURE_COLUMNS`), fit in the same run on the same data.
- **Walk-forward:** 2025/26, GW 8→38, train on `gw < t`, predict t — unchanged from #125/#127.
- **Eval population:** heuristic `xmin ≥ 0.5` — unchanged, for comparability with every prior
  gate.
- **Gate (all three must hold):**
  1. augment MAE < in-run v1 MAE;
  2. augment cumulative captaincy ≥ in-run v1 captaincy;
  3. coverage of `[p25_aug, p75_aug]` within 0.50 ± 0.10.
- **In-run comparison only.** `load_team_strengths()` fetches live bootstrap strengths, which
  FPL re-tunes; published numbers (v1 2.0629/2.0632, augment 2.0440) drift at the 4th decimal
  place across runs. Both models see identical strengths within a run, so the gate is unaffected.
  The published 2.0440 is the motivating prior, **not** the bar.
- **No post-hoc variants.** This is the only gate-eligible candidate of the cycle. If some other
  ablation looks better in the output, it gets its own issue and its own pre-registered run.

## 3. Harness changes

Two touch points, mirroring the established per-cycle module pattern
(`backtest_v2.py` → `backtest_v21.py` → `backtest_aug.py`).

### 3a. `model/backtest_v21.py` — minimal in-place extension

- `walk_forward_v21` emits two new per-row columns, `p25_aug` and `p75_aug`
  (`predict(art_aug, f21, pos, 0.25/0.75)` — `art_aug` is already fit every GW; the p50 path is
  byte-identical to #127's). Both columns join the groupby aggregation as sums, like every other
  quantile column.
- The `FEATURE_COLUMNS_AUG` comment is updated: it was "diagnostic-only, NEVER gate-eligible"
  under #127's registration; #138 pre-registers it as *this* cycle's candidate (pointer to
  `backtest_aug.py`).
- Nothing else in the module changes. `evaluate_v21`/`write_report_v21` are not re-run in this
  cycle (re-running `write_report_v21` would clobber the hand-written captaincy-diagnostic
  subsection in `docs/xpts-model.md`).

### 3b. New `model/backtest_aug.py` — the #138 gate module (~100 lines)

- `evaluate_aug(results, min_xmin=0.5) -> dict` — from the `walk_forward_v21` results frame
  (ignores `minutes_rows`; the minutes model is unchanged from #127, so its standalone metrics
  are not recomputed). Computes: `n_eval`, `v1_mae`, `aug_mae`, `base_form_mae`,
  `v1_captaincy`, `aug_captaincy` (`captaincy_points(df, "p50_aug")`), `aug_spearman` /
  `v1_spearman`, `coverage` (`interval_coverage(df, "p25_aug", "p75_aug")`), the three gate
  booleans, `passes_gate`, `uncapped` (n + both MAEs on the unfiltered frame), and the
  hot-streak signed errors (augment / v1 / form baseline, same top-decile `hot3` cut as #127).
- `write_report_aug(metrics, path)` — appends a new section to `docs/xpts-model.md` under its
  own marker `<!-- xpts-v138-results -->`, with the same own-marker truncation + duplicate-marker
  guard pattern as `write_report_v21`. Section contents: candidate definition, the three-row MAE
  table (v1 / augment / form baseline), captaincy, Spearman, coverage, uncapped MAE, hot-streak,
  gate booleans, verdict line (PASS → "revive #128/#130 for this candidate — prospective
  validation before any promotion"; FAIL → "documented finding; #128 stays parked").
- `run_gate(history, team_strengths, report_path, dump_path=None, start_gw=8, end_gw=38) ->
  dict` — the testable seam: runs `walk_forward_v21`, optionally dumps the per-(player, gw)
  results frame to `dump_path` as CSV — and the per-fixture `minutes_rows` frame alongside it
  (`*.minutes.csv`; the diagnostic's `p60 < 0.5` pathology check needs the picks' minutes
  predictions) — **before** evaluating, then `evaluate_aug` + `write_report_aug`, returns the
  metrics dict. `__main__` just loads full local data and calls it, printing the one-line
  summary.
  This is a #127 lesson: the captain-flip diagnostic must analyze *the exact run that produced
  the verdict*, not a fresh walk-forward whose live-strengths input may have drifted. The
  runbook passes an absolute path outside the repo.

### Report-section hazard (inherited, documented)

The v138 section lives *after* the v21 section in `docs/xpts-model.md`. The existing report
writers truncate from their own marker to end-of-file, so a re-run of `backtest_v21.py` (or
`backtest_v2.py`) would delete every later section, including this one. This is the established,
documented pattern ("hand-written subsections — re-add if regenerated"); no new mitigation is
built for a mini-cycle.

## 4. Pre-committed diagnostic — captain-flip analysis, regardless of verdict

The per-GW captain-flip diagnostic (the #127 scratch script, `captain_diag.py`, adapted to
compare `p50_v1` vs `p50_aug` picks) runs **whatever the gate says**, reading the dumped results
+ minutes CSVs from the gate run (no re-run). If the augment passes captaincy but still produces
GW8-goalkeeper-style pathological picks that merely got lucky, that goes on record before anyone
considers promotion. Its summary — flip count, per-flip deltas, worst flips, any pathological
picks (wrong-position captain; captain with `p60 < 0.5`) — is added to the report section as a
hand-written subsection (marked re-add-if-regenerated, like #125's grid and #127's diagnostic).
The script stays scratch (not committed); the findings are what's durable.

## 5. Testing

`pytest` in `model/` is the gate; no TS tooling touches this cycle.

- **`model/tests/test_backtest_v21.py` (extend):** the existing walk-forward test additionally
  asserts `p25_aug`/`p75_aug` are present in the results frame and survive the (player, gw)
  aggregation.
- **`model/tests/test_backtest_aug.py` (new):** on the existing `conftest.py` synthetic
  fixtures —
  - `evaluate_aug` returns correct gate fields on a hand-constructed results frame, including a
    case where captaincy fails (augment picks a lower-actual captain) and a case where it passes;
  - coverage is computed from the `_aug` quantile columns (not the v21 ones);
  - `write_report_aug` appends under its own marker, truncates at its own marker on re-write,
    and raises on a duplicated marker;
  - `run_gate` with a `dump_path` writes the results CSV before evaluation (exercised on the
    synthetic fixtures — no live run in tests).
- **No changes to minutes-model or features tests** — those modules are untouched.

## 6. Triaged-minors batch (mandated by CLAUDE.md: "address in passing when #138 … reopens `model/`")

One behavior-neutral cleanup task at the end of the cycle (except where noted):

1. Remove dead `POSITIONS_V2` (v2 paths iterate v1's `POSITIONS`).
2. `grid_v2.py` tie-break: prefer incumbent defaults over `min()`'s arbitrary winner on ties.
3. Ablation call-sites passing `decay_alpha=None`: clarify (comment/docstring) that `None` means
   "use v1 default", not "no decay".
4. `evaluate_v21`: guard the opaque `qcut` crash on empty `minutes_rows` (raise a clear
   `ValueError` naming the input) — the one non-cosmetic fix.
5. Calibration table: format qcut interval reprs as readable ranges (affects future runs only;
   the committed v21 report is not regenerated).
6. `_fit_logit` docstring stray paren.
7. Deduplicate the `position_values` literal (3×) in `emit_parity_fixture.py`.

If any of these turns out to be behavior-affecting beyond its description, it is dropped from
the batch and re-triaged rather than absorbed silently.

## 7. Out of scope (deliberate, user-decided)

- **No serving artifact, no `train.py` branch, no feature-spec module, no parity-fixture block.**
  This cycle ends at the verdict ("verdict only", user decision 2026-07-06). On a PASS, the
  artifact/train/parity wiring becomes the **first task of reviving #128** — where the ship
  policy (shadow serving, ≥6 evaluated live GWs, champion/challenger swap) applies unchanged.
- **No changes to `fpl-project` serving, the client, or v1's frozen feature spec.** v1 keeps
  serving untouched whatever the verdict.
- **No minutes-model changes.** It is validated, frozen infra from #127.

## 8. Error handling

Nothing new. The walk-forward inherits #127's never-crash contract (intercept-only fallbacks in
the minutes model; `KeyError` on a missing minutes prediction is a real invariant violation and
*should* crash). The one new guard is minors item 4 (empty `minutes_rows`).

## 9. Process & sequencing

1. Branch `feat/xpts-v138-augment` off `main` (this spec commits on it).
2. Plan via writing-plans; execute via subagent-driven-development — expected shape: Task 1
   (walk-forward extension + tests), Task 2 (`backtest_aug.py` + tests), Task 3 (triaged-minors
   batch), Task 4 (full-data gate run + report + diagnostic).
3. The ~10-minute full-data run follows the detached-ops protocol: absolute paths, `echo EXITED
   rc=$?` sentinel, verify alive-and-producing ~30 s after launch.
4. Verdict → `docs/xpts-model.md` (new section) + captain-flip subsection → PR → on merge, close
   #138 with the finding and update #107's index (same bookkeeping shape as #125/#127).

## 10. Success criteria

- Harness emits augment p25/p75; `pytest` green in `model/`.
- One full-data gate run recorded under `<!-- xpts-v138-results -->` with all three gate
  booleans and the verdict.
- Captain-flip diagnostic recorded regardless of verdict.
- Triaged-minors batch landed (or individually re-triaged with reasons).
- #138 closed with the finding; #107 index updated. On PASS: #128 revival is the designated
  next step for this candidate. On FAIL: v1 keeps serving; the finding routes to #129.
