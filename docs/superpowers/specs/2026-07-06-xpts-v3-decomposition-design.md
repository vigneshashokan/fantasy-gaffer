# xPts v3 — player event decomposition (#129): generative simulator + gate

**Issue:** #129 · **Parent arc:** #107 (xPts v2) · **Date:** 2026-07-06
**Prior art:** `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md` (the match
engine — stage 1, pre-built), `2026-07-05-xpts-v21-minutes-model-design.md` (#127 — the minutes
hurdle, pre-built + validated standalone), `docs/xpts-model.md` (all four gate verdicts to date).

## 1. Context & goal

Three consecutive cycles (#125, #127, #138) died at the same place: an additive linear head
cannot *gate* output by minutes probability or exploit match-level structure — it can only add
terms. The minutes model is validated standalone (p60 log-loss 0.2625 vs 0.6519 heuristic); the
match engine produces sane per-fixture `λ_for/λ_against`; both are merged, reusable infra. This
cycle integrates them **multiplicatively**: model *what happens in the match*, allocate it to the
player, and convert events to points with FPL's actual rules.

**The model is a generative Monte Carlo simulator, not a fitted regression.** Per player-fixture
it draws N simulated matches from component distributions and scores each draw with the points
table. Almost nothing is trained: engine ratings and per-player rates are walk-forward exp-decay
calculators; the only fitted piece is the (frozen) minutes hurdle. Consequences we want:
minutes-gating by construction, guaranteed quantile coherence (p25 ≤ p50 ≤ p75 always — the raw
p-value/crossing hazard dies structurally), and intermediate probabilities (P(goal), P(clean
sheet), P(haul)) as free by-products — the premium "depth" surface #129 names.

**Naming:** `model_version = "v3"`, file family `*_v3.py`. The arc docs call this stage "v2.1";
v2/v21 version strings are burned by failed candidates and this is an architecture break, so the
code says v3. The spec notes the alias once, here.

**User decisions (2026-07-06), not to be relitigated:**
- **Gate-first, verdict-only.** This cycle ends at the verdict. The A→C serving design is §9 of
  this spec (pinned now), but its build only executes on a PASS, as the #128 revival.
- **FPL-only data.** The gate runs entirely on `player_gw_history`. #126 (external xG) is
  re-scoped as a post-verdict upgrade lever for the engine seam (§10).
- **Two pre-registered candidates.** Primary = pure v3; secondary = 50/50 Vincentized blend with
  v1 (§2). Anything else in the output is diagnostic-only.
- **Insurance backfill done first** (PR #142): saves / penalties_saved / penalties_missed /
  yellow_cards / red_cards / own_goals captured for all of 2025/26 before the API rollover
  window closed; the points table is empirically verified — recomputing `total_points` from
  components matches on **all 29,747 rows, 0 mismatches**. Durable snapshot committed at
  `model/data/player_gw_history_2025-26.csv.gz`.

## 2. Pre-registration (this section IS the registration — frozen before the run)

- **PRIMARY candidate ("v3"):** the simulator of §3–§5. Point estimate for MAE and captaincy =
  the **simulated mean** (continuous); contract quantiles = interpolated simulation quantiles
  (`np.quantile(..., method="linear")`). The mean-not-median choice is deliberate and declared:
  simulated medians are integer-granular (draws are integer point totals), and each model is
  judged on its shipped best point estimate — v1's is its p50, v3's is its mean.
- **SECONDARY candidate ("v3-ens"):** Vincentized 50/50 blend with in-run v1:
  `p_k_ens = 0.5·(p_k_v3 + p_k_v1)` for k ∈ {25, 50, 75}; point estimate
  `= 0.5·(mean_v3 + p50_v1)`. Nothing is fit; the blend weight is fixed here.
- **Benchmark:** v1 (`FEATURE_COLUMNS`), fit in the same run on the same data (same per-step
  refit path as #127/#138).
- **Walk-forward:** 2025/26, GW 8→38, components built strictly from `gw < t` — unchanged.
- **Eval population:** heuristic `xmin ≥ 0.5` — unchanged, for comparability with every prior
  gate.
- **Gate (all three must hold, judged per candidate):**
  1. candidate MAE < in-run v1 MAE;
  2. candidate cumulative captaincy ≥ in-run v1 captaincy;
  3. coverage of the candidate's [p25, p75] within 0.50 ± 0.10.
- **Judging precedence:** primary first. If primary passes, primary is the #128-revival
  candidate and secondary is recorded as diagnostic. If primary fails and secondary passes,
  secondary is promotable (it was registered). If both fail: documented finding; #128 stays
  parked.
- **Simulation size & determinism:** `N_SIMS = 8000` draws per player-fixture; RNG =
  `numpy.random.default_rng(V3_SEED_BASE + gw)` with `V3_SEED_BASE = 20260706`. MC noise on the
  mean ≈ σ/√N ≈ 0.03 pts; the verdict is deterministic given the seed.
- **In-run comparison only.** `load_team_strengths()` (v1's feature input) drifts at the 4th
  decimal place across runs; both models see identical data within a run.
- **No post-hoc variants.** Any other configuration that looks good in the output gets its own
  issue and its own pre-registered run.

## 3. Component models

All per-player quantities at walk-forward step t are computed from that player's rows with
`gw < t` only. Constants live in `model/feature_spec_v3.py`.

### 3a. Inputs (pre-built, untouched)

- **Minutes:** #127's `precompute_minutes_predictions(history)` → leakage-safe `(p_play, p60)`
  per (player, gw). Rows with no minutes prediction (first appearances) are excluded from the
  results frame, as in #127.
- **Match engine:** v2.0 `MatchEngine` on `build_team_fixtures(history)`, default hyperparams
  (window 10, α 0.9, m 4 — retained from the #125 grid). Per target fixture it supplies
  `λ_for`, `λ_against` (via `lambdas(team, opp, was_home, before_gw=t)`) and the league
  baselines.

### 3b. Per-player exp-decay rates (`model/rates_v3.py`)

Weights `w_i = RATE_ALPHA^i` over the player's last `RATE_WINDOW` prior **played** rows
(minutes ≥ 1; i = 0 most recent), `RATE_WINDOW = 6`, `RATE_ALPHA = 0.85` — v1's validated
form-window family. 0-minute rows are excluded: rates measure production while on the pitch;
availability is the minutes model's job.

- **Per-90 event rates** (xG, xA, saves, yellow_cards, red_cards, own_goals, penalties_missed,
  penalties_saved): `rate90 = 90 · (Σ w_i·x_i) / (Σ w_i·m_i)` where `m_i` = minutes. **Fallback:**
  if `Σ w_i·m_i < MIN_DECAYED_MINUTES = 60`, use the position-mean rate90 computed from all
  `gw < t` rows (pooled, unweighted). This guards cameo-noise (20 decayed minutes with one xG
  spike → absurd rate) without deflating regulars.
- **DC hit rate:** `p_dc` = decayed mean of the indicator `defensive_contribution ≥ threshold`
  (DEF ≥ 10; MID/FWD ≥ 12) over the player's last `RATE_WINDOW` prior rows **with minutes ≥ 60**.
  Fallback when no qualifying prior rows: position mean among qualifying `gw < t` rows. GKP:
  `p_dc = 0` (not DC-eligible — consistent with the 0-mismatch validation, which used no GKP DC
  term).
- **Bonus distribution:** per-player decayed counts of `bonus ∈ {0, 1, 2, 3}` over the last
  `RATE_WINDOW` prior **played** rows, smoothed with `BONUS_PSEUDO = 2` pseudo-observations of the position-level
  distribution (from all played `gw < t` rows), then normalized.
- **Safety clip:** every final per-fixture component λ (after fixture adjustment and minutes
  scaling) is clipped to `[0, LAMBDA_CAP = 3.0]`.

### 3c. Fixture coupling (where the engine enters)

For the player's team T vs opponent O at venue v, step t:

- **Attack multiplier:** `m_att = λ_for / att(T, v, t)` — algebraically the opponent's defensive
  weakness relative to league (≈ 1 vs an average opponent). Applied to xG90 and xA90.
- **Defensive stream:** `λ_against` is used directly for goals conceded (and via `exp(−λ)` logic
  implicitly through the draws — no separate p_cs input is needed; CS emerges from the GC draw).
- **Saves multiplier:** `m_sav = λ_against / league_baseline(ov, t)` where ov is the opponent's
  venue — save volume scales with how much attack the keeper faces relative to league average.

### 3d. The draw (per player-fixture, vectorized over N_SIMS)

1. **Minutes bucket** ~ Categorical(absent `1 − p_play`, partial `p_play − p60`, full `p60`);
   minutes value `M_PART = 30` or `M_FULL = 85`; absent → 0 points, skip. `f = mins / 90`.
2. **Attacking:** `goals ~ Poisson(xG90 · m_att · f)`, `assists ~ Poisson(xA90 · m_att · f)`.
3. **Defensive:** `gc_on ~ Poisson(λ_against · f)` — one draw feeds both:
   clean sheet = (bucket == full) AND (gc_on == 0) — matching FPL's ≥60′-and-none-while-on rule;
   GKP/DEF concede penalty = `−floor(gc_on / 2)`.
4. **Saves (GKP):** `saves ~ Poisson(saves90 · m_sav · f)` → `+floor(saves / 3)`;
   `pen_saved ~ Poisson(ps90 · m_sav · f)` → `+5` each.
5. **Discipline / misc:** `yc ~ Bernoulli(min(yc90 · f, 1))`, `rc ~ Bernoulli(min(rc90 · f, 1))`,
   `og ~ Poisson(og90 · f)`, `pen_missed ~ Poisson(pm90 · f)`.
6. **DC points:** `+2 · Bernoulli(p_dc)` in the full bucket only.
7. **Bonus:** drawn from the player's smoothed multinomial (played buckets only) — drawn, not
   added as a mean, so quantiles stay honest.
8. **Score the draw** with the points table (§3e). Total is an integer per draw.

### 3e. Points table (`model/points_rules.py`) — empirically verified

| Component | GKP | DEF | MID | FWD |
|---|---|---|---|---|
| Appearance 1–59′ / 60+′ | 1 / 2 | 1 / 2 | 1 / 2 | 1 / 2 |
| Goal | 10\* | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (60+′ req.) | 4 | 4 | 1 | 0 |
| Per 2 conceded (on pitch) | −1 | −1 | — | — |
| Per 3 saves | +1 | — | — | — |
| Penalty save | +5 | +5 | +5 | +5 |
| Penalty miss | −2 | −2 | −2 | −2 |
| Yellow / red | −1 / −3 | −1 / −3 | −1 / −3 | −1 / −3 |
| Own goal | −2 | −2 | −2 | −2 |
| DC threshold (10 / 12) | — | +2 | +2 | +2 |
| Bonus | +bonus | +bonus | +bonus | +bonus |

Verified by recomputation against all 29,747 rows of 2025/26 (0 mismatches). \*The GKP-goal
value is the one unexercised cell (no GKP scored in 2025/26); 10 is the 2025/26 rule-book value.
A standing regression test recomputes the full committed snapshot and asserts 0 mismatches — the
table can never silently rot.

### 3f. Outputs per (player, gw)

From the N draws: `mean_v3`, `p25_v3 / p50_v3 / p75_v3` (linear-interpolated), and the
intermediate probabilities `p_goal = P(goals ≥ 1)`, `p_assist`, `p_cs_pts = P(CS points > 0)`,
`p_haul = P(total ≥ 10)`. Probabilities are **diagnostic columns this cycle**; they become the
product surface only via §9.

## 4. Walk-forward integration (`model/backtest_v3.py`)

- Reuses the established harness pieces: per-step v1 refit (as in `backtest_v21.py`), `xmin`
  heuristic for the eval filter, `metrics.py` (`captaincy_points`, `interval_coverage`),
  per-(player, gw) aggregation of `actual = Σ total_points`.
- **DGW:** simulate each fixture separately (same `p_play/p60` per #127's per-GW prediction —
  documented approximation), then **sum draws elementwise** across the player's fixtures before
  taking quantiles/mean — a coherent GW-level distribution, not a sum of quantiles. (v1 keeps its
  existing summed-quantile aggregation; that asymmetry favors no one and is declared.) Minutes
  draws across the two fixtures are independent — declared approximation.
- **Blank GW:** no fixture → no row (existing behavior).
- Results frame columns (superset): `player_id, gw, position, actual, xmin, hot3`, v1
  `p25/p50/p75`, v3 `mean_v3/p25_v3/p50_v3/p75_v3/p_goal/p_assist/p_cs_pts/p_haul`, ensemble
  `point_ens/p25_ens/p50_ens/p75_ens`.
- `evaluate_v3(results, min_xmin=0.5) -> dict`: n_eval, the three MAEs (v1/v3/ens) +
  form-baseline MAE, three captaincies, both coverages, per-candidate gate booleans,
  `passes_gate_primary`, `passes_gate_secondary`, uncapped MAEs, hot-streak signed errors.
  Raises a clear `ValueError` on an empty frame.
- `write_report_v3(metrics, path)`: appends under its own marker `<!-- xpts-v3-results -->`,
  own-marker truncation + duplicate-marker guard (the established pattern; the inherited hazard
  stands — never run an earlier cycle's report writer as `__main__`).
- `run_gate(history, team_strengths, report_path, dump_path=None, start_gw=8, end_gw=38) ->
  dict`: runs the walk-forward, dumps the results frame + the minutes frame **before**
  evaluating (the #138 seam — diagnostics must analyze the exact gate run), then evaluate +
  report. `__main__` loads full local data and calls it.
- **Runtime:** the per-step v1 refits + minutes precompute dominate (~40 min known envelope);
  the vectorized simulator adds single-digit minutes. Budget ≤ ~1 h; detached-ops protocol
  (absolute paths, `echo "EXITED rc=$?"` sentinel, alive-check ~30 s after launch).

## 5. Declared v3.0 approximations (each a named v2.2 lever, none blocks the architecture test)

Independent Poisson everywhere (no Dixon-Coles); player attacking draws uncoupled from a team
goals draw (no teammate/XI share model — the fixture multiplier carries opponent context);
bonus independent of the draw's own events (BPS-conditional model later); fixed bucket minutes
(30′/85′); xG-only attacking rates (no finishing-skill blend); penalties inside xG (no separate
taker model — #131's set-piece data feeds that later); DGW minutes independence.

## 6. Pre-committed diagnostics (run whatever the gate says)

1. **Captain-flip vs v1** (the #127/#138 script pattern, reading the dumped frames — no re-run):
   flip count, per-flip deltas, pathological picks (wrong-position captain; captain with
   `p60 < 0.5` — which v3 should make structurally impossible; that claim gets checked).
2. **Component calibration:** P(CS) deciles vs realized CS rate; P(goal) deciles vs realized;
   simulated-mean goals vs actual total goals by GW (drift check).
3. **GKP-only MAE, v3 vs v1** — the first model that prices save points; measure it.
4. If the gate FAILS, these localize *which leg* failed — the whole reason the decomposition is
   diagnosable where three additive heads were not.

Findings land in the report section as a hand-written subsection (re-add-if-regenerated, as
before). Scripts stay scratch; findings are durable.

## 7. Files & tests

New (all under `model/`, Python toolchain, excluded from repo TS/jest tooling):

- `feature_spec_v3.py` — constants: `RATE_WINDOW=6, RATE_ALPHA=0.85, MIN_DECAYED_MINUTES=60,
  M_PART=30, M_FULL=85, BONUS_PSEUDO=2, LAMBDA_CAP=3.0, N_SIMS=8000, V3_SEED_BASE=20260706`,
  DC thresholds, and the points-table constants imported by `points_rules.py`.
- `points_rules.py` — the table + `points_from_events(position, events) -> int` (vectorized
  variant for the simulator).
- `rates_v3.py` — walk-forward per-player rate/distribution builders (§3b) incl. fallbacks.
- `simulate_v3.py` — the vectorized simulator: (rates, minutes preds, engine λs, rng) → draws →
  outputs (§3d–§3f).
- `backtest_v3.py` — §4.
- Tests (`model/tests/`): `test_points_rules.py` (unit cases per component **+ the
  full-snapshot 0-mismatch regression test** reading
  `model/data/player_gw_history_2025-26.csv.gz` — no DB/network), `test_rates_v3.py`
  (hand-computed decay case; both fallback paths exercised — synthetic data must produce BOTH
  the normal and fallback branches per position, the #127 lesson), `test_simulate_v3.py`
  (seed determinism; quantile monotonicity; minutes gating — p_play=0 → all-zero draws;
  **analytic-mean parity**: closed-form E[points] for a hand-built player vs simulated mean
  within 4·σ/√N), `test_backtest_v3.py` (evaluate gate fields on synthetic pass/fail frames
  for BOTH candidates; report-marker semantics; run_gate dumps before evaluate; no-leakage:
  an outlier row at gw=t must not move step-t rates; walk-forward shapes incl. the aggregate
  quantile-ordering assert `results["p25_v3"].mean() < results["p75_v3"].mean()`).
- Modified: `data.py` (`_HISTORY_COLUMNS` + the six new columns, numeric coercion for none —
  they're smallint), `tests/conftest.py` fixtures extended with the six columns.
- **Triaged minors from #140 (landed in passing):** the same aggregate quantile-ordering assert
  added to the v21 shapes test (`p25_aug`/`p75_aug`); `evaluate_aug` empty-frame guard
  (mirroring `evaluate_v21`'s). The `grid_v2.py` 4-dp tie-break stays as declared-in-comment
  (accepted, no action).
- **NOT in this cycle:** serving artifact, `train.py` branch, parity-fixture block, Deno
  changes, client changes, minutes-model changes (frozen), v1 spec/artifact changes.

## 8. Error handling

- Player with no prior rows → no minutes prediction → excluded from the frame (existing #127
  behavior; also ineligible for eval).
- `Σ w·m < 60` decayed minutes → position-mean rate fallback (§3b); no qualifying DC rows →
  position mean; empty position pool (degenerate synthetic data) → rate 0.
- Engine with no current-season data → league priors (existing v2.0 behavior).
- All rates coerced finite; final λs clipped to `[0, 3]`; assert no NaN in draws before
  quantiles.
- `evaluate_v3` raises `ValueError` naming the input on an empty results frame.
- A missing minutes prediction for a row that *should* have one remains a crash (invariant
  violation), inherited from #127.

## 9. A→C serving migration (fully designed here; BUILT ONLY ON A PASS, as the #128 revival)

- **Runtime home: GitHub Actions scheduled workflow** (`.github/workflows/xpts-serve.yml`),
  nightly `30 4 * * *` UTC — after the 03:00 bootstrap and 03:30 history crons. Python 3.12 +
  pip cache; expected ≤ ~5 min/run. Chosen over pg_cron/Edge Functions because the simulator
  needs numpy/pandas/statsmodels (no Deno mirror is possible — this is the honest A→C trigger),
  and over a VPS because the repo is already GitHub-native and the job is stateless.
- **Entry point `model/serve_v3.py`:** psycopg via `DATABASE_URL` secret (Supabase pooled
  connection string) → read current-season `player_gw_history`, `fixtures`, `players` → rebuild
  minutes precompute + engine + rates on current-season data → simulate the next 3 GWs (DGW:
  summed draws; blank: no row) → upsert **`projections_shadow`** (new migration): contract
  columns (`player_id, gw, p25, p50, p75, model_version='v3'`) **plus nullable depth columns**
  (`mean, p_goal, p_assist, p_cs, p_haul, p60`) — the premium surface piggybacks on the shadow
  table; client exposure is a separate post-promotion product decision.
- **Champion/challenger unchanged (#128/#130):** v1's Deno `fpl-project` keeps writing
  `projections`; promotion after ≥6 evaluated live GWs = table swap (Python writes
  `projections`, dethroned v1 writes shadow — its writer ignores the extra nullable columns);
  rollback = swap back; eval attribution by `model_version`; the client contract never changes.
- **Failure modes:** a failed workflow run → stale shadow rows + GitHub failure email; v1
  serving unaffected. Off-season → no upcoming fixtures → clean no-op. GW1 cold start: engine
  league-average priors for promoted teams (existing), minutes fallback rates, position-mean
  player rates — same graceful early-season weakness v1 has.

## 10. #126 re-scope (a deliverable of this design)

The engine's data seam is `build_team_fixtures` → one row per (fixture, team) with
`xg_for/xg_against`. Therefore external xG needs only **team-level per-fixture xG mapped to FPL
fixture ids and team ids** — a 20-row/season team-name mapping, maintained by hand.
**The player-identity mapping (FPL↔Understat/FBref names, transfers, loans) drops out of #126
v1 entirely**; it returns only if player-level external stats ever feed shares or finishing
skill (v2.2, #131 territory). #126 remains parked until the v3 verdict says whether the engine
leg is the binding constraint (the §6 calibration diagnostics answer that). This re-scope gets
recorded on issue #126 at bookkeeping time.

## 11. Out of scope (deliberate)

Serving/client/Deno changes (until PASS → #128); minutes-model changes; external data;
Dixon-Coles, GBM stages, quantile calibration, cross-season seeding (v2.2); teammate/XI share
model and set-piece/ownership factors (#131); exposing intermediate probabilities in the app;
prod backfill of the six new columns (prod 2025/26 rows keep 0 — the model trains locally).

## 12. Process & sequencing

1. Spec commits on `feat/xpts-v3-decomposition` (this branch). **PR #142 must merge before
   execution starts** — Task 1's snapshot regression test reads
   `model/data/player_gw_history_2025-26.csv.gz`, which lives on #142, and `data.py` selects
   the six columns #142's migration adds. The local DB is already backfilled either way.
2. Plan via writing-plans; execution via subagent-driven-development (sonnet implementers —
   haiku banned per arc gotcha). Expected task shape: Task 1 `points_rules.py` + snapshot
   regression test + `data.py` columns → Task 2 `rates_v3.py` → Task 3 `simulate_v3.py` →
   Task 4 `backtest_v3.py` + evaluate/report/run_gate → Task 5 triaged minors → Task 6
   controller-run full-data gate + diagnostics + report + hand-written subsection.
3. The gate run follows the detached-ops protocol; preconditions include the API-season check
   only for context (the gate reads the local DB, which is frozen — rollover no longer
   invalidates this cycle).
4. Verdict → `docs/xpts-model.md` section + diagnostic subsection → PR → on merge: close/update
   #129 with the finding, update #107's index, #126 re-scope comment, CLAUDE.md record.
   On PASS: #128 revival (build §9) is the designated next cycle, then #130's live eval.

## 13. Success criteria

- `pytest` green in `model/` (including the full-snapshot points regression test and both
  fallback paths).
- One full-data gate run recorded under `<!-- xpts-v3-results -->` with per-candidate gate
  booleans and the verdict; results + minutes frames dumped before evaluation.
- Captain-flip + calibration + GKP diagnostics recorded regardless of verdict.
- Triaged minors landed (or re-triaged with reasons).
- #129 updated with the finding; #107 index updated; #126 re-scoped.
- On PASS: #128 revival is next (build §9 exactly). On FAIL: v1 keeps serving; the calibration
  diagnostics name the failing leg and the finding routes to the corresponding v2.2 lever.
