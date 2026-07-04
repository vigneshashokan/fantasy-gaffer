# xPts v2.0 — Match Engine + Prospective Capture (design)

**Date:** 2026-07-04 · **Issue:** #107 (xPts model v2) · **Status:** approved design
**Predecessor:** v1 (#30, shipped PRs #100–#102) — per-position linear quantile regression,
Approach A (Python trains → committed dot-product artifact → Deno `fpl-project` cron serves
`projections`). v1 gate: MAE 2.063 vs 2.444 form baseline (−15.6%).

## 1. Context, destination, and this iteration

The ultimate v2 destination (decided in brainstorming) is a **decomposed match→player
architecture**: model the fixture first (expected goals for/against, clean-sheet
probability from dynamic team ratings), then the player's share of those events, then
convert events to points with FPL's actual scoring rules. This mirrors how points causally
happen, keeps teammates consistent with one match forecast, makes position-dependent
scoring exact, and yields intermediate probabilities that are product surface in their own
right. It is delivered **iteratively, each stage gated on the walk-forward backtest** —
never as a big bang.

**This spec covers iteration v2.0 plus the deadline-bound capture infrastructure:**

1. **Match engine** (Python, `model/`) — dynamic venue-split team ratings + independent
   Poisson fixture model; outputs feed a v2 quantile regression as new features.
2. **Shadow serving** (Deno, extend `fpl-project`) — nightly scores v1 *and* v2;
   v1 keeps writing `projections` (the frozen client contract), v2 writes a new
   `projections_shadow` table nobody reads yet.
3. **Snapshotter** (Deno, extend `fpl-ingest`) — `?source=snapshot` + 6-hourly cron
   capturing live-only FPL fields (`ep_next`, ownership, set-piece order, …) into
   `player_gw_snapshots`. These fields are overwritten weekly by FPL and are
   **unrecoverable if not captured** — this is the only deadline-bound piece
   (must be live before 2026/27 GW1, ~mid-August).
4. **Prospective eval harness** (Python, `model/prospective.py`) — the running
   scoreboard v2-shadow vs v1-live vs real `ep_next`, and the promotion rule.

**Zero client changes.** The `projections` table remains the frozen serving contract.

### Decisions log (from brainstorming)

- **Ship policy: hold until prospectively validated.** Even if v2.0 passes the backtest
  gate, v1 keeps serving; v2.0 runs shadow-only until the promotion rule (§5) is met.
- **Approach 1 (in-stack shadow)** over a Python batch job or manual eval: the Deno cron
  scores both artifacts. Rationale: fully automated, honestly frozen pre-deadline, zero
  new infra, and the TS port is exercised + parity-tested all shadow season, so promotion
  day carries no port risk. Approach A holds throughout (v2.0 is still a dot product).
- **FPL-data-only for v2.0.** Team-level match xG is derivable by summing our own
  `player_gw_history` per fixture-team. External xG (Understat/FBref) stays a v2.1 lever.
- **Model family: independent Poisson** on multiplicative venue-split ratings.
  Dixon-Coles-style refinements (low-score dependence, time-decayed fitting) are v2.2.
- **Riding along:** the xGI collinearity fix — v2's feature set drops
  `form_expected_goal_involvements`. v1's artifact and spec are untouched.
- **Dropped in v2:** static bootstrap `opp_strength_def/att` features (superseded by the
  λs); the backtest ablation (§2) verifies the substitution.

## 2. Match engine + v2 model (Python, `model/`)

### Team-xG aggregation

From the already-loaded `player_gw_history` frame: team T's **attack sample** for fixture
f = Σ `expected_goals` over T's players in f; its **defence sample** = the opponent's sum
(xG conceded). Pure pandas groupby; no new data loading, no external sources.

### Ratings (per team, venue-split, exp-decay, shrunk)

Four streams per team, each an exp-decay weighted mean (most-recent-first) over that
team's last `RATING_WINDOW` matches *at that venue, within the current season*:

- `att_home(T)` / `att_away(T)` — xG created per home/away match
- `def_home(T)` / `def_away(T)` — xG conceded per home/away match

**Shrinkage / cold start:** with `k` venue matches observed,
`rating = (k·raw + m·L) / (k + m)` where `m = PRIOR_WEIGHT` and `L` is the league-average
for that stream. A promoted team at GW1 (k=0) starts exactly league-average and earns its
true rating within weeks; slumps/streaks flow in via the decay. When the season has no
data at all, `L` falls back to the constant `LEAGUE_XG_PRIOR` (set from the 2025/26 mean).
Cross-season seeding (discounted prior-season ratings) is deliberately **deferred to
v2.2** — a documented GW1–4 weakness.

### Fixture model (independent Poisson)

League baselines: `L_home` = league mean home-team xG per match, season-to-date (note:
the league mean of `def_away` across teams equals `L_home`, since every home xG is an
away concession); `L_away` symmetric. Early-season, `L_*` are shrunk toward
`LEAGUE_XG_PRIOR` by match count using the same `(k·raw + m·L)/(k+m)` form as the
team ratings. For team T at home vs O:

```
λ_for     = att_home(T) · def_away(O) / L_home
λ_against = def_home(T) · att_away(O) / L_away
p_clean_sheet(T) = exp(−λ_against)
```

Both-league-average teams reproduce the league baseline (sanity invariant, unit-tested).
Away fixtures are the mirror image.

### v2 feature set

```
FORM_STATS_V2 = [expected_goals, expected_assists, threat, creativity,
                 influence, bps, defensive_contribution, total_points]   # xGI dropped
FEATURE_COLUMNS_V2 = [form_<s> for s in FORM_STATS_V2]
                   + [xmin, was_home, value_scaled]                      # kept from v1
                   + [team_lambda_for, team_lambda_against, p_clean_sheet]  # new
```

`was_home` is retained (venue is inside the λs, but residual venue effects on player
stats remain free to capture). Training rows stay **per-fixture** — DGWs need no special
handling; serving sums fixtures per GW exactly as v1 does today.

### Artifacts and parallel specs

v1 keeps serving, so `feature_spec.py` is frozen. New `feature_spec_v2.py`
(`MODEL_VERSION = "v2.0.0"`, `FEATURE_COLUMNS_V2`, rating hyperparams) → `train.py` grows
a v2 path → `model/artifacts/xpts-v2.json`. The scorer (Python `predict` and Deno
`predict`) is already generic over the artifact's own `feature_columns`; only the feature
*builder* needs a v2 variant. `emit_parity_fixture.py` is extended to emit a v2 chain:
raw history rows → team ratings → λs → feature rows → scores.

**Retrain-recopy invariant (now four files):** re-run `train.py` +
`emit_parity_fixture.py`, then re-copy `xpts-v1.json`, `xpts-v2.json`, and
`parity-fixture.json` from `model/artifacts/` into
`supabase/functions/fpl-project/artifacts/`.

### Hyperparameters and the gate

`RATING_WINDOW ∈ {6, 10, 19}`, `RATING_ALPHA ∈ {0.8, 0.9, 1.0}`, `PRIOR_WEIGHT ∈ {2, 4}`
selected by walk-forward MAE (2025/26, GW8→38, eval among `xmin ≥ 0.5`); final
values frozen into `feature_spec_v2.py` and documented. *Honest caveat:* tuning on the
gating backtest is mild leakage — acceptable because the ship policy makes the shadow
season the real judge.

**Gate to proceed to serving (§3):** v2.0 beats v1 on walk-forward MAE and is not worse
on cumulative captaincy; interval coverage stays within 0.50 ± 0.10. The backtest report
gains: **(a) an ablation** — v1 · v1+match-features · full v2 (isolates where gains come
from and verifies dropping static strengths costs nothing); **(b) standalone match-engine
metrics** — clean-sheet Brier score and per-match xG MAE vs a static-strengths baseline;
**(c) a hot-streak diagnostic** — mean signed error among players whose last-3-GW actual
points sit in the top decile, confirming the xG-based form features regress hot streaks
to the mean rather than over-predicting them (the model's core anti-recency bet, made
explicit). Results appended to `docs/xpts-model.md`.

## 3. Shadow serving (Deno, `fpl-project`)

New files mirroring the v1 pattern: `feature-spec-v2.ts` (byte-parity mirror of
`feature_spec_v2.py`), `lib/features-v2.ts` (team-xG aggregation → ratings → λs → feature
row), `artifacts/xpts-v2.json`.

- **Refactor:** `buildProjections()` takes the feature builder as a parameter instead of
  hard-importing v1's. v1 path stays byte-identical (existing tests + parity fixture).
- **Fetch widening:** the cron currently loads each player's recent-window history;
  ratings need the current season's `player_gw_history` (~26k rows max, paginated —
  trivial nightly). Aggregation happens **in TS, not SQL**, so the parity fixture covers
  the whole chain to 1e-6.
- **Run order / failure isolation:** score v1 → upsert `projections` **first**; then the
  v2 pass inside its own try/catch → upsert `projections_shadow`. A shadow-path bug
  degrades to "no shadow rows tonight," never a broken live table.
- **`projections_shadow`** (new migration): same shape as `projections` —
  `PK (player_id, gw)`, `p25/p50/p75 numeric(4,1)`, `model_version`, `updated_at`;
  upsert `onConflict: 'player_id,gw'`. **RLS enabled, no client policies** — only the
  server-side eval harness reads it. Because the cron only writes future GWs, a GW's
  shadow rows freeze at its deadline automatically (same semantics `projections` has).

## 4. Snapshotter (Deno, `fpl-ingest ?source=snapshot`)

**New table `player_gw_snapshots`** — season-scoped like `player_gw_history` (no FK to
`players`; element ids reset each season), `PK (season, gw, player_id)`:

| Group | Columns |
|---|---|
| Benchmark | `ep_next`, `ep_this` |
| Future v2.1+ features (live-only) | `selected_by_percent`, `penalties_order`, `corners_and_indirect_freekicks_order`, `direct_freekicks_order` |
| Eval context | `now_cost`, `form`, `status`, `chance_of_playing_next_round`, `transfers_in_event`, `transfers_out_event` |
| Audit | `captured_at` |

- **Semantics — upsert until the deadline freezes it:** each run reads the FPL bootstrap
  once, resolves the next upcoming GW from `events` (`is_next`), and upserts one row per
  player for that GW. When the deadline passes, `is_next` advances and the prior GW's
  rows are never touched again — the frozen value is the last pre-deadline capture.
  The post-deadline freeze is enforced by an explicit deadline check, not by trusting
  FPL's `is_next` flip. Season label via `currentSeasonLabel(deadline_time)` — derived
  from the GW's **deadline date** (definitionally in-season), never from `now()`: a
  July run capturing the August GW1 must label it 2026/27.
- **Cadence: every 6 hours** (`pg_cron`, reusing the existing vault-secret invocation
  pattern). A missed snapshot is unrecoverable, so **frequency is the redundancy**: one
  failed run costs ~6h staleness, not a gameweek. `ep_next` moves most on injury news in
  the final ~24h pre-deadline; 6-hourly stays well inside that. ~700-row upsert per run.
- **Off-season no-op:** no `is_next` event → `{ ok: true, skipped }`. So the snapshotter
  is **deployed immediately and arms itself** when FPL publishes the 2026/27 calendar —
  defusing the GW1 deadline. (If FPL publishes GW1 weeks early, rows are harmlessly
  upserted until the deadline freezes them.)
- **Wiring:** `sources/snapshot.ts`; `'snapshot'` added to the `Source` union in
  `index.ts`; `ingestion_runs.source` CHECK widened (new migration, same pattern as the
  `'history'` widening); cron migration. **No CI change** — `fpl-ingest` is already in
  the deploy list; `snapshot` is a query param, not a new function.

## 5. Prospective eval + promotion (Python, `model/prospective.py`)

Connects via `DATABASE_URL` like `train.py`. For each finished 2026/27 GW, joins four
frozen sources: actuals (`player_gw_history`, kept fresh by the shipped #104 cron) ×
v1-live (`projections`) × v2-shadow (`projections_shadow`) × real `ep_next`
(`player_gw_snapshots`). Predictor attribution is by `model_version`, not table
identity, so the scoreboard stays correct across a promotion swap.

- **Eval slice:** pre-deadline `xmin ≥ 0.5` (starts share over the prior form window) —
  the backtest's convention, no hindsight.
- **Metrics** per-GW + cumulative, for all three predictors: MAE, captaincy points,
  `[p25, p75]` coverage, within-position Spearman. One run yields both the promotion
  evidence (v2 vs v1) and the honest `ep_next` head-to-head v1 never had.
- **Output:** a running scoreboard committed to `docs/xpts-prospective.md`. A GW missing
  shadow rows (outage) is excluded and flagged, never imputed.
- **Promotion rule:** after **≥ 6 evaluated GWs**, promote iff v2 leads v1 on cumulative
  MAE **and** is not behind on cumulative captaincy.
- **Promotion mechanics — champion/challenger swap:** the artifacts trade tables in
  `fpl-project` (v2 → `projections`, v1 → `projections_shadow`). The dethroned model
  keeps running as shadow; `model_version` records which is which; rollback is the same
  one-line swap back. The client contract never changes.

## 6. Testing

- **pytest (`model/`):** match-engine units (decay ratings golden cases, shrinkage math
  incl. promoted-team k=0, Poisson `p_clean_sheet`, league-average sanity invariant);
  v2 feature-row build; v2 train smoke; parity-fixture emission. Backtest: gate +
  ablation + standalone engine metrics.
- **Deno `fpl-project`:** `features-v2` unit tests sharing golden cases with pytest;
  extended parity test (raw rows → ratings → λs → features → scores == Python to 1e-6);
  `project.test` asserts both tables written and that a thrown v2 path still upserts v1;
  index wiring.
- **Deno `fpl-ingest`:** `snapshot.test` mirroring `history.test` — `is_next` resolution,
  off-season no-op, upsert shape, `ingestion_runs` logging.
- **Client:** none — zero client changes; jest and the app are untouched.

## 7. Error handling summary

| Failure | Behavior |
|---|---|
| Team with few/no venue matches (promoted, GW1) | Shrinkage → league average; never NaN |
| No current-season data at all | `LEAGUE_XG_PRIOR` constant fallback |
| v2 scoring throws in the nightly cron | Caught; v1 `projections` upsert unaffected |
| Snapshot run fails | Next run (≤6h) self-corrects; staleness visible via `captured_at`; run logged in `ingestion_runs` |
| No `is_next` event (off-season) | Clean no-op |
| GW missing shadow rows at eval time | Excluded from comparison, flagged in report |
| Blank GW / unknown position | Existing v1 behavior unchanged (no row / skip) |

## 8. Sequencing (~6 weeks to GW1)

1. **Snapshotter** — build + deploy immediately (the only deadline-bound piece).
2. **Match engine + v2 training + backtest gate** — offline, no deploy risk.
3. **Deno port + shadow serving** — after the gate passes; ideally live by GW1 so the
   6-GW promotion clock starts immediately (slippage costs clock time, never data).
4. **Eval harness** — any time before ~GW6; all its inputs persist.

## 9. Roadmap (recorded, not designed here)

- **v2.1 — player event decomposition:** minutes/rotation classifier, player shares of
  team goals (P(goal), P(assist)), hard-coded FPL points rules, bonus estimator; external
  xG ingestion; **planned A→C serving migration** (Python batch → same `projections`
  table). The snapshotter is already accumulating its ownership/set-piece features.
- **v2.2 — sharpening:** Dixon-Coles low-score dependence + time-decayed fitting,
  non-linear stage models (GBM), quantile calibration (preserving p25≤p50≤p75),
  cross-season rating seeding for GW1–4.
- **Parked:** manager/formation modelling (weak data, mostly subsumed by player-level
  form; cheapest future proxy = a "new manager" flag); AFCON/international availability
  (near-term already covered by FPL `status`/`news` via the decision layer).
- **Routed to the decision layer, not the model:** injury-proneness / substitution
  planning — tracked as issue #132 (the #123 snapshots accumulate its
  availability-history data automatically).

## 10. Invariants

- `projections` is the frozen client contract; the client never changes.
- `feature-spec-v2.ts` stays byte-identical to `feature_spec_v2.py`; the golden parity
  fixture is the skew guard for the **entire** v2 chain including team ratings.
- The retrain procedure re-copies **four** files (both artifacts + parity fixture) into
  the function dir.
- v1 spec/artifact are frozen until promotion; promotion/rollback is a table swap, and
  the losing model keeps running as shadow.
- Never edit applied migrations; the snapshotter and shadow table arrive as new
  timestamped migrations.
