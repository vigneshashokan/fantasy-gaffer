# xPts v3.1 — re-registration mini-cycle (#144) design

**Date:** 2026-07-07 · **Issue:** #144 · **Arc index:** #107 · **Evidence base:** #129 (PR #143,
`docs/xpts-model.md` §`<!-- xpts-v3-results -->`) · **Pattern:** the #138 mini-cycle (small
candidate delta + one gate run on existing infrastructure).

## 1. Context & goal

#129 built the generative Monte Carlo simulator and failed its gate — but, uniquely in the arc,
the failure decomposed into four named causes: (1) the registered mean point estimate loses under
L1 where the simulated median (2.0111 post-hoc) is the best MAE ever tested; (2) `p_assist`
under-predicts by ~26% because FPL's assist definition is broader than xA; (3) mild top-decile
independent-Poisson clean-sheet optimism; (4) interval coverage over-counts by construction on a
discrete predictive distribution (42.8% of eval rows sit exactly on an interval endpoint). The
captaincy pathology that killed #125/#127/#138 is structurally cured (zero pathological picks),
and Spearman 0.360 vs v1's 0.302 is the best ranking signal recorded.

v3.1 is the pre-registered re-run with the cheap, precisely-diagnosed fixes applied: the
corrected evaluation functionals, the assist-rate correction, and discreteness-aware coverage
semantics. Cause (3) — Dixon-Coles — is **deliberately excluded** (decision: it is the one fix
with real implementation risk in the draw pipeline, the miss is mild and top-decile-only; it
remains a v2.2 lever).

This cycle also redesigns two gate conditions (§4). That redesign happens **now, between cycles,
before any v3.1 number exists** — the one legitimate window to change a gate without post-hoc
taint. The ship policy is unchanged: this gate opens **shadow serving only** (#128 revival);
promotion still requires the prospective ≥6-live-GW eval.

## 2. Pre-registration (this section IS the registration — frozen before the run)

- **Single candidate ("v3.1"):** the #129 simulator (§3–§5 of the v3 spec, unchanged) with
  exactly one modeling change — the strictly-prior global assist-rate multiplier of §3 below.
  No SECONDARY: #129's blend evidence is direct (worst captaincy of all, 168 — v1's −0.98 bias
  pulls rankings toward its quantile-fit picks), and v3's published numbers are the built-in
  ablation reference for the assist fix's marginal effect.
- **Functionals (declared):** point estimate for MAE = the **simulated median** (`p50_v3` of the
  run; L1's optimal functional — integer granularity accepted and declared); captaincy ranking =
  the **simulated mean** (median-ranked captaincy loses resolution to integer ties: 157 in the
  #129 diagnostics). Both come from the same simulation; contract quantiles remain interpolated
  simulation quantiles (`np.quantile(..., method="linear")`).
- **Benchmark:** v1 (`FEATURE_COLUMNS`), fit in the same run on the same data (same per-step
  refit path as #127/#138/#129). **In-run comparison only** (live team strengths drift at the
  4th decimal across runs).
- **Walk-forward:** 2025/26, GW 8→38, all per-player and per-step quantities built strictly from
  `gw < t` — unchanged. **Eval population:** heuristic `xmin ≥ 0.5` — unchanged (n = 7373
  expected).
- **Gate (all three must hold):**
  1. **MAE (strict):** MAE(simulated median) < in-run v1 MAE(p50). n ≈ 7373 makes this
     low-variance; no tolerance.
  2. **Captaincy (variance-aware, both parts must hold):**
     - **C1 — baseline floor:** cumulative captain points of the v3.1 pick (argmax of the
       simulated mean per GW, eval pool) **>** cumulative captain points of the form-baseline
       pick (argmax of `base_form`), in-run. The naive model must lose outright.
     - **C2 — not significantly worse than v1:** paired bootstrap over the per-GW captain-point
       deltas `d_t = pts_v3.1(t) − pts_v1(t)` (31 GWs expected). `N_BOOTSTRAP = 10000` resamples
       of the GW indices with replacement, seed `BOOTSTRAP_SEED = 20260707`; the condition
       **fails iff the 90th percentile of the resampled cumulative delta is < 0** (v1 better
       with ≥90% bootstrap confidence).
  3. **Coverage (mid-P):** per eval row, `u_mid = P(draws < actual) + 0.5·P(draws = actual)`
     computed from the row's own simulated distribution; coverage = share of rows with
     `0.25 ≤ u_mid ≤ 0.75`; must lie within **0.50 ± 0.10**.
- **Simulation size & determinism:** `N_SIMS = 8000`, RNG `default_rng(V3_SEED_BASE + gw)` with
  `V3_SEED_BASE = 20260706` **unchanged** — the only thing that moves vs #129 is the assist
  rate, so differences from v3's published numbers are attributable to the candidate change
  (statistically; per-draw streams shift because the assist λ consumes randomness differently).
- **No post-hoc variants.** Any configuration that looks good in the output gets its own issue
  and its own pre-registered run. #129's numbers are quoted as reference, never re-judged.

## 3. The candidate change: strictly-prior global assist multiplier

At each walk-forward step t, over **all** history rows with `gw < t` (the same `past` frame the
step already builds):

```
k_assist(t) = Σ past["assists"] / Σ past["expected_assists"]
```

with fallback `k_assist = ASSIST_SCALE_FALLBACK = 1.0` when the denominator is ≤ 0 or the frame
is empty. The multiplier scales the xA-derived assist rate **after** `build_player_rates`
resolves the player-vs-prior fallback, so it covers both paths:

```
scaled = {**player, "rates": {**player["rates"], "xa90": player["rates"]["xa90"] * k}}
```

**Non-mutation is mandatory** — `build_player_rates` can return structures that share the
module-level `_EMPTY_PRIOR` dict; an in-place `*=` would poison every subsequent call (same bug
class as the `MatchEngine` default-args gotcha). The scaled copy above is the required form, and
a regression test must prove repeated application does not compound (§7).

One parameter, leakage-safe by construction (fit on `gw < t`, the same strictly-prior pattern as
the minutes precompute), directly targeting the measured −26% mean bias; expected k ≈ 1.2–1.4,
stable from GW8 onward (7 GWs ≈ 180+ aggregate assists). Goals are untouched (`p_goal` 0.079 vs
0.077 — calibrated). On a PASS, #128's serving (`serve_v3.py`, v3 spec §9) computes `k_assist`
from the full current-season history at serve time — strictly prior by construction.

## 4. Gate redesign rationale (captaincy + coverage)

**Why the captaincy condition changes.** "Cumulative captaincy ≥ v1" compares 31 realized argmax
picks — integers with haul-sized swings. The #129 diagnostics showed v1's 185 leans on
quantile-fit luck (Garner ×4, Anderson ×4, B.Fernandes ×9 landing) while v3's structurally sane
premium picks (Haaland/Saka/Foden/Palmer, min p60 0.765) scored 178: a genuinely better model
can lose this comparison on one season's coin flips. The two-part form keeps a hard floor (must
beat the naive baseline outright — no magic number) and replaces the strict v1 comparison with a
significance test: noise is forgiven, a real deficit is not. **Sanity anchors, computed on #129's
published numbers before this design was frozen:** v3's −7 cumulative delta across ~25 active
flips passes C2 with wide margin (per-GW deltas have σ ≈ 6–8, so the bootstrap q90 of the sum
sits far above 0); v3's 178 vs the baseline's captaincy (174 in the v1-era backtest; recomputed
in-run) passes C1. The redesign is calibrated to forgive #129-sized noise, not #127-sized
deficits (−13 with pathological picks would still have to clear the naive floor and the
significance bar on its own numbers).

**Why the coverage semantics change.** Integer draws produce integer quantiles; inclusive
endpoint counting then over-covers a discrete distribution by construction (42.8% of #129's eval
rows sat exactly on an endpoint; intervals were *not* wider than v1's — median width 3.00 vs
3.16). Mid-P PIT is the standard deterministic treatment: rows on an endpoint get principled
fractional credit, the whole simulated CDF is used instead of two quantiles, and — unlike
randomized PIT — no seed can flip a gate verdict. The 0.50 ± 0.10 target is unchanged; only the
measurement is corrected. v1 has no draws, so its coverage stays inclusive-counting, reported as
context only (v1 is the benchmark, not a gated candidate).

**Why MAE stays strict.** n ≈ 7373 rows makes the MAE comparison low-variance; no redesign is
needed or offered.

**Scope of the redesign.** These semantics bind this and future registrations; they do not
retroactively change #129's verdict (that registration is closed). The gate's role is unchanged:
it opens shadow serving (#128), and the prospective ≥6-live-GW eval remains the promotion
arbiter.

## 5. Harness

**`model/assist_scale.py` (new, tiny):** `ASSIST_SCALE_FALLBACK = 1.0` and
`compute_assist_scale(past: pd.DataFrame) -> float` — the §3 ratio with the fallback. Pure,
unit-tested, importable by #128's serving later.

**`model/backtest_v3.py` (modified — the #138 precedent of extending the shared walk-forward):**
`walk_forward_v3` gains two things, both additive:

1. **`assist_scale: bool = False` parameter.** Default `False` preserves #129 behavior —
   existing tests are the guard. When `True`, each step computes `k = compute_assist_scale(past)`
   and applies the §3 scaled copy before `simulate_player_fixture`.
2. **`u_mid` emission (always on).** The per-GW `acc` dict additionally accumulates the
   player's summed actual points (`acc[pid]["actual_sum"] += float(target["total_points"])` —
   DGW fixtures sum, mirroring the draw-array summation). At summarize time, with the total-points
   draw array `total` and the accumulated actual `a`:
   `u_mid = mean(total < a) + 0.5·mean(total == a)` (exact — both sides are integer-valued).
   `u_mid` becomes a column of the sim rows and survives into the results frame. After the
   final merge, a consistency assert verifies the groupby-summed `actual` equals the
   accumulated `actual_sum` per row (`np.allclose`), guarding the two aggregation paths against
   drift.

Nothing else in `backtest_v3.py` changes: `evaluate_v3`, `write_report_v3`, and `run_gate` are
untouched, and **`backtest_v3.py` is never run as `__main__` again** (the report-writer marker
rule).

**`model/backtest_v31.py` (new, the gate module):**

- Constants: `MODEL_VERSION_V31 = "v3.1"`, `N_BOOTSTRAP = 10000`, `BOOTSTRAP_SEED = 20260707`,
  `REPORT_MARKER_V31 = "<!-- xpts-v31-results -->"`.
- `walk_forward_v31(history, team_strengths, ...)` — thin wrapper:
  `walk_forward_v3(..., assist_scale=True)`. Column names keep the `_v3` suffix (the v3.1-ness
  is the run configuration; `evaluate_v31` interprets them as the candidate).
- `build_captain_picks(df) -> pd.DataFrame` — from the eval-filtered frame, one row per
  (gw, model) for model ∈ {`v31` → argmax `mean_v3`, `v1` → argmax `p50_v1`, `base` → argmax
  `base_form`}: `{gw, model, player_id, pred, actual}`. Ties resolve by `idxmax` (first index),
  matching `metrics.captaincy_points` exactly.
- `bootstrap_captaincy(picks, n_boot=N_BOOTSTRAP, seed=BOOTSTRAP_SEED) -> dict` — pivots picks
  to per-GW `d_t = actual_v31 − actual_v1`, resamples GW indices with replacement, returns
  `{"q10", "q50", "q90", "p_worse", "deltas"}`; C2 = `q90 ≥ 0`. Raises `ValueError` on < 2
  distinct GWs.
- `evaluate_v31(results, min_xmin=0.5) -> dict` — eval filter, then: MAE of `p50_v3` (the
  registered median functional) vs `p50_v1` vs `base_form`; captaincy sums for v31/v1/base from
  the picks frame; C1, C2 (with the bootstrap dict's q-values recorded); mid-P coverage from
  `u_mid`; the three gate booleans and `passes_gate`; plus the #129-style diagnostics — mean-MAE
  of `mean_v3` (diagnostic only), Spearman v31/v1, GKP-only MAE, uncapped-population MAE,
  hot-streak signed errors, n. Raises `ValueError` on an empty frame.
- `write_report_v31(metrics, path)` — own-marker truncation + duplicate-header guard, appended
  after the v3 section of `docs/xpts-model.md` (it is the last section, so own-marker→EOF
  truncation is safe).
- `run_gate(history, team_strengths, report_path, dump_prefix)` — **dumps the results frame,
  minutes frame, AND the captain-picks frame as CSVs BEFORE evaluating** (the #138
  dump-before-evaluate lesson: diagnostics must analyze the exact gate run), then evaluates,
  writes the report, prints the one-line summary.
- `__main__` block loads the season data the same way `backtest_v3.py` did and calls `run_gate`
  with dump prefix `/tmp/xpts-v31/`.

## 6. Pre-committed diagnostics (run whatever the gate says)

On the dumped frames, as a hand-written subsection under the generated section (re-add-if-
regenerated note included, per every prior cycle):

- **Assist-fix attribution:** `p_assist` calibration (predicted vs observed deciles) vs #129's
  0.055/0.074; the `k_assist(t)` trajectory (expect ≈1.2–1.4, stable).
- **Captaincy under the new gate:** the picks table vs v1 and vs v3's published picks; the
  bootstrap delta distribution (q10/q50/q90, `p_worse`).
- **Functional check:** median-MAE (registered) vs mean-MAE (diagnostic) — confirms the
  functional choice without re-litigating it.
- **Coverage:** the `u_mid` decile histogram (PIT uniformity), not just the one banded number.
- Spearman, GKP-only, uncapped-population, hot-streak — mirroring the v3 section for
  comparability.

## 7. Files & tests

**Create:**
- `model/assist_scale.py` · `model/tests/test_assist_scale.py`:
  exact ratio on a known frame; zero-denominator/empty → 1.0 fallback; sensitivity check
  proving the caller contract matters (`k` computed on `history[gw < t]` differs from `k` on the
  full frame when the current GW's rows would shift the ratio); **non-mutation regression**: applying
  the §3 scaled-copy pattern twice to the same `build_player_rates` output does not compound,
  and a subsequent `build_player_rates` call for an empty-ish prior still sees pristine
  `_EMPTY_PRIOR` rates.
- `model/backtest_v31.py` · `model/tests/test_backtest_v31.py`:
  `u_mid` exactness on hand-built draws (e.g. draws `[1,2,2,3]`, actual 2 → `0.25 + 0.5·0.5 =
  0.5`; endpoint and outside cases); `build_captain_picks` argmax per model on a tiny frame,
  including an `idxmax`-tie case matching `captaincy_points`; `bootstrap_captaincy` — all-positive
  deltas pass, large-uniform-negative deltas fail (`q90 < 0`), seed-determinism, `ValueError`
  on 1 GW; `evaluate_v31` gate booleans on a constructed **passing** frame
  (`passes_gate == True` asserted explicitly — the #143 triaged-minor lesson) and on per-condition
  failing frames; `write_report_v31` marker truncation + duplicate guard; `walk_forward_v31`
  smoke on the conftest synthetic season (columns present, `u_mid ∈ [0,1]`, one-to-one merge,
  actual-consistency assert holds, and — on a fixture whose `k_assist > 1` — `assist_scale=True`
  yields strictly higher mean `p_assist` than `False`; no assertion on other components, whose
  draws may legitimately shift with the shared RNG stream).

**Modify:**
- `model/backtest_v3.py` — the two §5 additions only.
- `model/tests/test_backtest_v3.py` — assert the new `u_mid` column exists and is in `[0,1]` on
  the existing smoke test; **hygiene:** an ensemble-passing `_gate_frame` variant asserting
  `passes_gate_secondary == True` (#143 triaged minor 1).
- `model/tests/test_rates_v3.py` — **hygiene:** `.head(RATE_WINDOW)` truncation test with > 6
  divergent rows (#143 triaged minor 2).
- `model/tests/test_simulate_v3.py` — **hygiene:** `LAMBDA_CAP = 3.0` actually binding on an
  attacking λ (#143 triaged minor 3).

**Frozen (untouched):** all v1/v2/v2.1 modules, `rates_v3.py`, `simulate_v3.py`,
`points_rules.py`, `feature_spec_v3.py`, everything under `supabase/`, all committed artifacts.
No new artifact is emitted — v3.1, like v3, is code + constants; serving wiring is #128's job
on a PASS.

## 8. Error handling

Existing: empty-results `ValueError`; missing minutes prediction `KeyError`. New: assist-scale
fallback on zero denominator (§3); `bootstrap_captaincy` `ValueError` on < 2 distinct GWs;
the walk-forward actual-consistency assert (§5); `write_report_v31` duplicate guard.

## 9. Out of scope (deliberate)

Dixon-Coles (v2.2 lever — decision recorded in §1); any serving work (#128 revives only on a
PASS and builds the v3 spec §9 A→C design, now including the assist scale); #126 external xG
(parked — engine leg not binding); #131 factors (waits for snapshot data ~GW10+); any change to
v1 serving, the `projections` contract, or the client.

## 10. Process & sequencing

Branch `feat/xpts-v31-reregistration` (this spec is its first commit) → implementation plan →
SDD execution (sonnet implementers; opus review on the gate module, per #129 precedent) → full
`model/` pytest suite green → **controller-run detached gate run** (~50 min, the #129 runtime;
absolute paths, `EXITED rc=$?` sentinel, alive-check ~30 s after launch, background watcher) →
diagnostics on the dumped frames → hand-written report subsection → verdict → PR → bookkeeping
(#144 verdict comment, #107 index, CLAUDE.md, memory, ledger). Never run
`backtest_v2.py`/`backtest_v21.py`/`backtest_aug.py`/`backtest_v3.py` as `__main__`.

## 11. Success criteria

1. The §2 registration receives a verdict, recorded in `docs/xpts-model.md` under
   `<!-- xpts-v31-results -->` with the §6 diagnostics, whatever it says.
2. The gate redesign (variance-aware captaincy + mid-P coverage) is documented well enough that
   a future reader can verify it was frozen before the run (§4 anchors are computed from #129's
   published numbers only).
3. On PASS: #128 revives as the next cycle. On FAIL: findings named on #144; the arc pauses for
   prospective-season data; v1 keeps serving untouched either way.
