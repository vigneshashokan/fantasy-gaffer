# xPts model — v1 results

**Model version:** `v1.0.0`
**Decision:** Build (not buy) — our own model is the intended USP. See
`docs/superpowers/specs/2026-06-16-xpts-model-v1-design.md`.

## Data
- Source: backfilled `player_gw_history`, season 2025/26 (FPL-embedded Opta xG).
- Features: exp-decay form (window 6, α 0.85) of xG/xA/xGI/threat/creativity/
  influence/bps/defensive_contribution/total_points; recent starts share (xMinutes
  proxy); opponent strength (home/away-aware); was_home; price. Penalty/set-piece
  order, ownership, and explicit FDR are deferred to v2 (anachronistic or redundant
  for a last-season backtest).

## Model
Per-position linear quantile regression (GKP/DEF/MID/FWD × q 0.25/0.50/0.75),
target = a player-fixture's actual total_points. Coefficients are a dot product
(`model/artifacts/xpts-v1.json`) so Deno serving reproduces them with near-zero skew.

Note: `expected_goal_involvements ≈ expected_goals + expected_assists` makes the three
`form_expected_goal_involvements`/`form_expected_goals`/`form_expected_assists` features
near-collinear, which produces large compensating coefficients (e.g. ±888) in the artifact
and a statsmodels `IterationLimitWarning`. This does **not** affect predictions — the
collinear terms cancel and outputs are identical — it is a coefficient-identifiability
artifact. The v2 lever is to drop the redundant `form_expected_goal_involvements` feature
or add regularization.

## Validation
Walk-forward over 2025/26 (GW 8→38): for each GW *t*, train on `gw < t`, predict *t*,
accumulate out-of-sample. Evaluated among players with recent starts share ≥ 0.5
(n = 7373).

| metric | model p50 | baseline (c) exp-decay form | last-GW | season PPG |
|--------|-----------|------------------------------|---------|------------|
| MAE (lower better) | 2.063 | 2.444 | 2.716 | 2.333 |
| within-position Spearman | 0.302 | 0.270 | — | — |
| cumulative captaincy points | 185 | 174 | — | — |

Interval coverage of `[p25, p75]`: 0.489 (target ≈ 0.50 ± 0.10).

## Gate
- Beats baseline (c) on MAE: **True**
- Beats baseline (c) on cumulative captaincy: **True**
- Coverage within ±0.10 of 0.50: **True**

**Verdict: ✅ PASS — ship v1 serving (Plan 3)**

## A→C migration trigger (v2)
The `projections` table is the frozen contract; the app reads only it. Move serving
to a Python batch job (Approach C) when the model outgrows a portable dot product
(e.g. GBM/ensemble) such that re-implementing inference in Deno risks train/serve
skew — *not* merely when adding xG data. Until then, serving stays in-stack (Deno
`pg_cron`).

<!-- xpts-v2-results -->

# xPts model — v2.0 results (match engine)

**Model version:** `v2.0.0` · gate vs v1 (`v1.0.0`) on the same
walk-forward (2025/26, GW 8→38, eval among xmin ≥ 0.5; n = 7373).
Spec: `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md`.

## Ablation (MAE, lower better)

| variant | MAE |
|---------|-----|
| (a) v1 features | 2.063 |
| (b) v1 + match features | 2.063 |
| (c) full v2 (xGI + static strengths dropped) | 2.061 |
| exp-decay form baseline | 2.444 |

Captaincy: v2 184 vs v1 185.
Spearman: v2 0.303 vs v1 0.302.
Coverage of [p25, p75]: 0.489 (target 0.50 ± 0.10).

## Match-engine standalone (620 team-fixtures)

| metric | dynamic ratings | static strengths |
|--------|-----------------|------------------|
| per-match xG MAE | 0.600 | 0.593 |
| clean-sheet Brier | 0.192 | 0.189 |

## Hot-streak diagnostic (top-decile last-3-GW points; n = 881)

Mean signed error (pred − actual): v2 -1.108 ·
v1 -1.103 · form baseline +2.017.
Positive = over-prediction of hot players; the xG-form design should keep v2's
value near the form baseline's or better (regression to the mean).

## Gate

- v2 beats v1 on MAE: **True**
- v2 captaincy ≥ v1: **False**
- Coverage within ±0.10 of 0.50: **True**

**Verdict: ❌ FAIL — documented finding; do NOT wire shadow serving**
