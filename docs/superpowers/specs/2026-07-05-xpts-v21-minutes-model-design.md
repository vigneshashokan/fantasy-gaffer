# xPts v2.1 — Minutes / Rotation Model (design)

**Issue:** #127 · **Arc:** #107 (v2.1 lever) · **Date:** 2026-07-05
**Predecessors:** v1 (`docs/xpts-model.md`, champion — walk-forward MAE 2.0632 /
captaincy 185), v2.0 match engine (#125, gate ❌ FAIL — spec
`2026-07-04-xpts-v2-match-engine-design.md`).

## 1. Context and this iteration

v2.0's verdict routed the arc to *richer signal, not tuning*: the match
features carried ~no marginal information over player form under a linear
quantile head, and all 18 hyperparameter configs tied. Minutes are the single
biggest driver of FPL points, and today's minutes signal is one heuristic —
`xmin` = mean of `starts` over the last ≤6 rows (`model/features.py`). This
iteration replaces it with a real minutes model.

**Scope decision (user, 2026-07-05): backtestable core only.** Features derive
solely from `minutes`/`starts` history, so the 2025/26 walk-forward can
validate everything against the standing gate. Snapshot-fed live features
(`status`/`news`/`chance_of_playing`, freezing per GW from 2026/27 GW1 via
#123) are **out of scope** — they join later with #131 once real per-GW data
accumulates (~GW10+).

**Success criterion:** the same gate v2.0 failed, on the same walk-forward
(2025/26, GW8→38, eval among heuristic `xmin ≥ 0.5`):

1. candidate beats v1 on MAE (target < 2.0632 as computed in-run), AND
2. candidate cumulative captaincy ≥ v1's (185 in-run), AND
3. interval coverage of [p25, p75] within 0.50 ± 0.10.

**Ship policy unchanged:** a gate pass does NOT wire serving. It revives #128
(shadow serving) and #130 (prospective eval); promotion needs ≥6 evaluated
live GWs per the arc's hold-until-prospectively-validated rule. A gate fail is
a documented finding, exactly like #125.

### Decisions log (from brainstorming)

- **Lever order:** #127 first (backtestable today, zero external deps,
  reuses the merged harness); #126 external xG second; #131 waits on data.
- **Approach A chosen:** 3-class minutes structure (0 / 1–59 / 60+) as a
  **hurdle pair of binary logits** per position — statsmodels only (no
  sklearn), every output a dot product + sigmoid (portable; no A→C trigger).
- **Rejected:** direct E[minutes] regression (erases the 60-minute payoff
  cliff — appearance point + CS eligibility); GBM classifier (non-portable,
  would drag the A→C serving migration forward for one unvalidated feature
  stage; model-class power was not v2.0's bottleneck).
- **Pre-registered candidate:** v1's feature columns with `xmin` REPLACED by
  `p_play` + `p60`. One-lever diff against the champion — xGI and static
  strengths stay (unlike v2.0), so attribution is clean.
- **No hyperparameter grid stage** — windows fixed by design (#125 lesson:
  tuning is not where the gains are).
- **Eval filter definition unchanged** — still heuristic `xmin ≥ 0.5`, so
  2.0632/185 stays apples-to-apples even though the candidate no longer uses
  `xmin` as a feature.

## 2. The minutes model (`model/minutes_model.py`)

Per position (GKP/DEF/MID/FWD), two binary logistic regressions forming a
hurdle model:

- **`p_play`** = P(minutes ≥ 1) — the rotation/availability process. Fit on
  all samples of that position.
- **`p60_given_play`** = P(minutes ≥ 60 | played) — the role/substitution
  process. Fit on the subset with `minutes ≥ 1`.
- Downstream features: `p_play`, and `p60 = p_play × p60_given_play`.

### Features (8, backtest-legal)

All from the player's prior GW rows, most-recent-first, same
"prior = `gw < target gw`" rule as v1 (rows with zero prior GW rows are
skipped, matching `build_samples`). "Rows" include 0-minute rows — the
2025/26 backfill (element-summary route) has a row per player-fixture
including non-appearances, which is exactly the rotation signal.

| feature | definition |
|---|---|
| `start_share_6` | mean `starts` over last ≤6 rows (≡ today's `xmin`) |
| `start_share_3` | mean `starts` over last ≤3 rows |
| `mins_share_6` | mean `minutes/90` over last ≤6 rows |
| `p60_share_6` | share of last ≤6 rows with `minutes ≥ 60` |
| `started_last` | `starts` of the most recent row (0/1) |
| `mins_last` | `minutes/90` of the most recent row |
| `zeros_last_3` | count of 0-minute rows in last ≤3 (absence/return signal) |
| `n_prior` | `min(len(prior), 6) / 6` (early-season data-volume signal) |

Plain (undecayed) shares — consistent with the `xmin` heuristic they replace;
the two-window split (3 vs 6) carries the recency signal instead.

### Fitting

`statsmodels.api.Logit(...).fit_regularized(method="l1", alpha=0.1)` — a
small fixed α declared in `feature_spec_v21.py` (`MINUTES_L1_ALPHA = 0.1`).
It is a stability device, not a tuned hyperparameter (#125 lesson): no grid
over it; change it only if the degenerate-fit tests demand. L1 regularization is load-bearing for GKP, where
near-perfect separation (starters play 90 or nothing) blows up an unpenalized
fit. Degenerate-fit guards: if a position's training subset has fewer than a
minimum row count or a single-class label column, fall back to the empirical
class rate as a constant predictor (intercept-only model) for that position —
never crash the walk-forward.

### Leakage-safe precompute (load-bearing)

Naively, fitting the minutes model on `gw < t` and using its outputs as
features for the *quantile model's training rows* at `s < t` leaks: the
minutes model's parameters have seen row *s*'s own minutes, which correlate
strongly with its points target. Therefore:

**`precompute_minutes_predictions(history)`** computes predictions once per
row with strictly-prior fits — for each GW *s* (ascending), fit the 8 logits
on `gw < s`, predict all rows at *s* — and returns a frame keyed
`(player_id, gw)` with `p_play`, `p60`. Both quantile-training rows and eval
rows join against this cache; a row's minutes features never depend on which
walk-forward step consumes it. 38 GWs × 8 tiny logits ≈ trivial runtime.

GWs whose prior data is insufficient to fit (early season) get the
intercept-only fallback predictions. DGW rows: the two per-fixture rows of a
(player, gw) share one prediction (prior excludes same-GW rows) but
contribute two label observations when used as training data — matching v1's
handling.

## 3. Integration (`model/feature_spec_v21.py`, `model/features_v21.py`)

- **`feature_spec_v21.py`** — the v2.1 contract, parallel to the frozen v1
  and v2 specs: `MODEL_VERSION_V21 = "v2.1.0"`, `MINUTES_CUTOFF = 60`,
  `MINUTES_WINDOW_LONG = 6`, `MINUTES_WINDOW_SHORT = 3`,
  `MINUTES_FEATURE_COLUMNS` (the 8 names, order = serving contract), and
  `FEATURE_COLUMNS_V21` = v1's `FEATURE_COLUMNS` with `xmin` removed and
  `p_play`, `p60` appended (order = serving contract).
- **`features_v21.py`** — `build_feature_row_v21(prior, target,
  team_strengths, minutes_pred)` = v1's `build_feature_row` minus `xmin`
  plus the two cached predictions; `build_samples_v21(history,
  team_strengths, minutes_preds)` mirrors `build_samples`, joining the
  precompute frame on `(player_id, gw)`. The heuristic `xmin` is still
  computed and carried on samples/results rows — as the eval filter and a
  diagnostic column, not a model feature.

### Variants in the backtest

| variant | columns | role |
|---|---|---|
| (a) v1 | `FEATURE_COLUMNS` | benchmark (must reproduce 2.0632/185 in-run) |
| (b) candidate | `FEATURE_COLUMNS_V21` (xmin → p_play + p60) | **pre-registered gate candidate** |
| (c) augment | v1 columns + `p_play` + `p60` (xmin kept) | diagnostic only — does the heuristic retain marginal signal? |

The gate verdict applies to (b) alone. If (c) outperforms (b), that is a
documented finding motivating a follow-up candidate — never a post-hoc swap.

## 4. Backtest, gate, and diagnostics (`model/backtest_v21.py`)

`walk_forward_v21(history, team_strengths, start_gw=8, end_gw=38)`:
precompute minutes predictions once; per GW *t*, build v1/candidate/augment
samples from `gw < t`, fit the three quantile artifacts via the existing
parameterized `fit_models`, predict GW *t* rows, aggregate per
`(player_id, gw)` — the same shape as `walk_forward_v2`.

`evaluate_v21(results)` — the gate (as §1) plus:

- **Minutes-model standalone quality** (eval rows GW8→38, all positions,
  no xmin filter): log-loss and Brier of `p60` against `minutes ≥ 60`
  outcomes, versus the baseline of using heuristic `xmin` as P(60+) directly.
  This answers "is the minutes model better?" independently of whether the
  downstream gate is tight.
- **Calibration table** for `p60` (deciles: mean predicted vs observed rate).
- **Secondary uncapped MAE**: candidate vs v1 over ALL eval rows (≥1 prior
  row, no xmin filter) — where minutes signal should show most. Diagnostic
  only; the gate population is unchanged.
- The existing hot-streak diagnostic, for continuity.

`write_report_v21(...)` appends a `<!-- xpts-v21-results -->` section to
`docs/xpts-model.md`, truncating **only at its own marker** — it must never
touch the v1 or v2 sections above it. (Known repo gotcha: `write_report_v2`
truncates at the v2 marker; since the v21 section sits below the v2 section,
regenerating v2 would clobber v21 — do not regenerate v2; its finding is
final.)

## 5. Training + artifact (`model/train.py`, `model/artifacts/xpts-v21.json`)

`train_v21(history, team_strengths)`: run the precompute, build candidate
samples over the full season, fit via `fit_models(samples,
feature_columns=FEATURE_COLUMNS_V21, model_version=MODEL_VERSION_V21, ...)`,
and attach the minutes model under an `extra` key. CLI: `train.py --v21` →
`model/artifacts/xpts-v21.json`. All-defaults `fit_models`/`train.py` calls
remain byte-identical to v1 (guarded already).

The artifact is **self-describing**: quantile coefficients (per position ×
quantile over `FEATURE_COLUMNS_V21`) plus a `minutes` block — per-position
`{play: {coef, intercept}, p60_given_play: {coef, intercept}}` over
`MINUTES_FEATURE_COLUMNS`, with the cutoff/window constants embedded.
Intercept-only fallbacks serialize in the SAME shape as fitted models —
`const = logit(clipped rate)`, all feature coefficients `0.0` — so the
predict path has no special case.

**The v2.1 artifact is committed but NOT wired into serving** — same posture
as `xpts-v2.json`. The four-file retrain-recopy invariant activates only if
#128 revives on a gate pass + prospective validation.

## 6. Parity fixture + serving portability

`emit_parity_fixture.py` gains an additive `v21` block (v1 and v2 blocks
byte-unchanged): a small synthetic player history exercising the real chain —
minutes features → both logits → `p_play`/`p60` → candidate feature row →
quantile scoring. Freshness guard `model/tests/test_parity_fixture_v21.py`:
the committed block must equal a fresh build (v2.0 precedent — re-run the
emitter after ANY change to the v2.1 chain).

Portability note (why no serving work is in scope): `fpl-project` already
reads recent `player_gw_history`, which carries `starts` and `minutes` — a
future Deno port needs only the 8 features + 2 sigmoids + the existing dot
product. In-season DGW capture writes one GW-aggregate row (live route), so
served `mins_last`/`started_last` can exceed 1.0 on a DGW (aggregate
minutes/starts); the Deno port (if #128 revives) should clamp all share and
indicator features to [0, 1]. Recorded here; not built now.

## 7. Testing

- `model/tests/test_minutes_model.py` — feature construction (windows,
  zeros-counting, n_prior clamp, first-appearance skip); hurdle math
  (`p60 = p_play × p60_given_play`, probabilities in [0,1]); separation
  fallback (single-class subset → intercept-only, no crash); leakage guard
  (precompute for GW *s* is invariant to rows at `gw ≥ s` — mutate a future
  row, predictions unchanged).
- `model/tests/test_features_v21.py` — `FEATURE_COLUMNS_V21` composition
  (xmin absent, p_play/p60 present, v1 columns otherwise intact); row parity
  with v1's builder on the shared columns; join correctness incl. a DGW case
  (two rows, one prediction).
- `model/tests/test_backtest_v21.py` — gate conjunction logic; eval filter
  uses heuristic xmin; report writer truncates only at its own marker
  (existing v1/v2 content preserved byte-identically).
- `model/tests/test_train_v21.py` — artifact shape (self-describing minutes
  block); all-defaults v1 byte-identity still guarded.
- `model/tests/test_parity_fixture_v21.py` — freshness guard (§6).
- Full-data runs (backtest, report) are execution-phase steps on the local
  stack, not pytest.

## 8. Error handling summary

- Insufficient/degenerate training data for a position-GW → intercept-only
  fallback, never a crash (§2).
- Missing minutes prediction at join time (should be impossible for rows
  with ≥1 prior GW) → raise loudly; it indicates a precompute/join bug, not
  a data condition to paper over.
- Probabilities clipped to [1e-6, 1 − 1e-6] before log-loss.
- `write_report_v21` refuses to write if its marker appears more than once.

## 9. Sequencing & consequences

1. Spec (this doc) → plan → execution via subagent-driven development on a
   `feat/xpts-v21-minutes` branch. Pure-Python tasks first (spec/model/
   features/backtest/train/tests), then the full-data walk-forward + report
   on the local stack (2025/26 data is already backfilled + team_id-repaired;
   runtime ≈ v2.0's ~40 min).
2. **Gate PASS** → revive #128/#130 for THIS candidate (Deno port of the
   minutes chain + shadow serving + prospective eval), then the ≥6-GW rule.
3. **Gate FAIL** → documented finding in `docs/xpts-model.md`; the minutes
   model remains reusable infra (it is the natural appearance/CS leg of
   #129's event decomposition); arc proceeds to #126 external xG.
4. Either way, #131 later adds the snapshot-fed live tier (status/news/
   chance) on top of whichever minutes model exists.

## 10. Honest risks (recorded up front)

- The gate population (heuristic `xmin ≥ 0.5`, regular starters) and the
  captaincy metric (nailed-on picks) are where minutes signal matters least.
  The standalone log-loss/Brier and the uncapped MAE exist precisely so a
  "gate tight but minutes model clearly better" outcome is visible and
  actionable rather than lost.
- v2.0's captaincy failure mode (184 vs 185 — one pick) can recur from any
  feature change; the gate is deliberately strict and the ship policy makes
  a near-miss cheap (nothing serves either way).
- 2025/26 has no mid-season manager-change or promoted-team minutes quirks
  the features can see beyond raw starts/minutes patterns — the live tier
  (#131) is the designed remedy, not this iteration.

## 11. Invariants

- v1 `feature_spec.py` stays FROZEN; v2 spec untouched; v2.1 declares its
  own contract in `feature_spec_v21.py`.
- `FEATURE_COLUMNS_V21` and `MINUTES_FEATURE_COLUMNS` order = serving
  contract once frozen.
- Eval filter = heuristic `xmin ≥ 0.5`, identical to v1/v2.0 runs.
- The `projections` client contract never changes; nothing in this cycle
  touches serving or the app.
- All-defaults `train.py` output stays byte-identical to v1.
