# xPts serving revival (#128 + #130) design — A→C shadow serving + prospective eval for the v3.1 candidate

**Date:** 2026-07-07 · **Issues:** #128 (shadow serving), #130 (eval harness + promotion runbook) ·
**Arc index:** #107 · **Trigger:** #144's v3.1 candidate passed its gate (PR #146, `docs/xpts-model.md`
§`<!-- xpts-v31-results -->`) · **Base design:** the v3 spec §9
(`docs/superpowers/specs/2026-07-06-xpts-v3-decomposition-design.md`) — this spec turns §9 into a
build spec and adds the #130 machinery.

## 1. Context & goal

The ship policy (user decision, unchanged): even after a gate pass, **v1 keeps serving**; the passing
candidate writes a shadow table, and promotion requires **≥6 evaluated live GWs** of prospective
evidence. This cycle builds exactly that: (a) a GitHub Actions nightly Python batch serving the
**frozen registered v3.1 candidate** into a new `projections_shadow` table, and (b) an on-demand,
read-only eval script + promotion runbook with **pre-registered prospective semantics** (this spec is
the registration — frozen before the season starts, per arc discipline).

No model change anywhere. No client change anywhere. The `projections` contract is untouched.

## 2. What is served — the frozen v3.1 candidate (fidelity requirements)

The candidate is the registered configuration that passed (#146), reproduced byte-for-byte from the
merged modules — the serve path composes them, never reimplements them:

- **Rates:** `rates_v3.build_player_rates` + `position_rate_priors` on current-season history.
- **Assist multiplier:** `assist_scale.compute_assist_scale(history)` over ALL current-season rows
  (at serve time everything is strictly prior by construction), applied via the spec-§3 non-mutating
  scaled copy. Fallback 1.0 on zero denominator (early-season). **No clamp, no minimum-sample rule** —
  the serve semantics mirror the registered formula exactly; early-season noise is the same graceful
  weakness v1 has.
- **Minutes:** serve-mode composition of #127's primitives — `build_minutes_samples(history)` →
  `fit_minutes_models(samples)` once per run, then per player `build_minutes_feature_row(prior_rows)`
  → `predict_minutes(...)` (one `(p_play, p60)` per player, reused for all target GWs). Players with
  zero current-season rows are **skipped** (no shadow row — mirrors the backtest's skip; the client's
  `ep_next` fallback covers them).
- **Engine:** `match_engine.MatchEngine(build_team_fixtures(history))`; λs per target fixture with
  `before_gw = <next unfinished GW>` (all history is prior to every target GW, so one engine state
  serves all three).
- **Simulation:** `simulate_v3.simulate_player_fixture` per (player, fixture), `N_SIMS = 8000`;
  serving seeds **per target**: `default_rng((V3_SEED_BASE, gw, player_id, fixture_id))` (numpy
  accepts an int-sequence as entropy). Reproducible run-to-run AND robust to target-set composition
  — unlike the backtest's shared per-GW stream, one player entering or leaving the set cannot shift
  any other player's draws. (The registered candidate is the model — rates → λs → points table →
  8000 draws — not the stream partition; the backtest's per-GW seed was a verdict-determinism
  device.) DGW = elementwise draw-array summation per (player, gw); blank GW for a club → no rows
  for its players in that GW. `summarize_draws` supplies the outputs.
- **Functionals:** `p50` = the **simulated median** (v3.1's registered MAE functional — the natural
  p50 column); the **simulated mean** is stored as a depth column (v3.1's registered ranking
  functional, which #130's captaincy eval reads). `model_version = 'v3.1'`.

## 3. `model/serve_v3.py` — the serving entry point (DB-only; no FPL API)

Deliberate property: **every input lives in our Postgres** (history, fixtures, positions, team
assignment; the engine uses its own ratings, not FPL strengths) — the nightly job makes zero calls
to the FPL API.

Flow, per run:

1. **Connect** via `DATABASE_URL` (reuses `data.load_history`'s psycopg path; same env-var contract).
2. **Target GWs:** from `fixtures` — the next 3 distinct `event` values having ≥1 fixture with
   `finished = false` (and non-null `event`). The fixtures table is current-season-only (replaced at
   rollover), so upcoming fixtures are always current-season.
3. **Season label:** derived from the **earliest upcoming fixture's `kickoff_time`** (month ≥ 7 →
   `YYYY/YY+1`, else `YYYY-1/YY`) — a Python port of the snapshotter's principle (label from the
   event's own date, never `now()`).
4. **No-op guards (exit 0, print `[serve-v31] skipped: <reason>`):** no unfinished fixtures
   (off-season) · zero current-season `player_gw_history` rows (pre-GW1: v1 is equally cold; the
   prospective eval simply starts when both models emit).
5. **Load** current-season history (`data.load_history(season=...)`), fit the run-level components
   (minutes models, engine, priors, `k_assist`).
6. **Targets:** for each target GW, each fixture, each player whose latest history row's `team_id`
   is `team_h` or `team_a` of that fixture (mid-season transfers ≈ last-played-for club — documented
   approximation; position also from the latest history row). Iteration order is irrelevant to the
   outputs (per-target seeding, §2) — sorted (player_id, fixture_id) for log readability.
7. **Simulate → aggregate → upsert** into the `XPTS_SERVE_TABLE` target (default
   `projections_shadow`; §6/§8), `on_conflict (player_id, gw)`, one row per (player, gw):
   `p25/p50/p75` (numeric(4,1) — round to 1 dp like v1's writer), `model_version='v3.1'`, depth
   columns `mean, p_goal, p_assist, p_cs, p_haul, p60` (always written by this writer; nullable only
   so v1's writer can share the table after a promotion swap).
8. **Summary line:** `[serve-v31] season=2026/27 gws=[2,3,4] players=... rows=...` — the workflow
   log is the observability surface.

**CLI (for the parity guard and local validation):** `--season <label>` and `--as-of-gw <t>`
overrides. **`--as-of-gw t` filters the loaded history to `gw < t` AND treats GWs ≥ t as the
"upcoming" window** — so every component (minutes fit, rates, engine, `k_assist`) sees exactly the
strictly-prior data the backtest saw at step t. In production the filter is vacuous (all history is
prior to every target GW). `--dry-run` computes everything, prints the summary + a sample, writes
nothing.

## 4. `projections_shadow` migration

New timestamped migration, mirroring `projections` plus depth:

- `player_id integer not null` (**no FK** — element ids are season-scoped; unlike `projections`,
  the shadow table must not break on a pre-bootstrap serve), `gw smallint not null`,
  `p25/p50/p75 numeric(4,1) not null`, `model_version text not null`,
  `computed_at timestamptz not null default now()`, PK `(player_id, gw)`.
- Depth columns, all nullable: `mean numeric(5,2)`, `p_goal numeric(4,3)`, `p_assist numeric(4,3)`,
  `p_cs numeric(4,3)`, `p_haul numeric(4,3)`, `p60 numeric(4,3)`.
- **RLS enabled, NO policies** (service-role only — like `player_gw_snapshots`). Client exposure of
  depth data is a separate post-promotion product decision (v3 spec §9).
- Grant nothing to `authenticated`. Index on `(gw)` to match `projections`.

## 5. The serve-path skew guard (this cycle's key test)

The serve loop re-implements the backtest's *orchestration* (window selection, target enumeration,
DGW aggregation, k computation) while composing the same frozen *model* modules. The guard proves the
orchestration matches the gate-validated code. Draw-for-draw parity is deliberately NOT the target —
the backtest shares one RNG stream across a GW's targets, so any target-set difference (e.g. a
mid-season transfer's team assignment) would shift every later player's draws and fail the test
spuriously. The honest, stronger decomposition:

- **Input-parity (exact):** against the local 2025/26 snapshot-restored DB, run
  `serve_v3.py --season 2025/26 --as-of-gw 30 --dry-run` capturing, per (player, fixture) target,
  the full `simulate_player_fixture` input tuple — `(position, p_play, p60, scaled rates dict,
  p_dc, bonus, lam_against, m_att, m_sav)` — and compare against the same tuples extracted from the
  backtest path at step 30 (a small instrumented harness importing both). Every tuple in the
  intersection must match **exactly** (these are deterministic and set-independent). The
  set-difference must be zero or consist solely of explainable rows (players whose latest-prior-club
  differs from their GW-30 club — reported with counts; expected ~0–5).
- **Distribution-parity (frozen module):** identical inputs + the untouched `simulate_v3` = the
  identical distribution by construction; as a belt-and-braces check, for a sample of ~20 targets
  re-run `simulate_player_fixture` with a shared per-target seed on both sides and require identical
  draws.
- Delivered as a pytest marked `local_db` (skipped when the DB is unreachable) so it runs on demand,
  not in the unit suite.
- **Unit tests (synthetic frames, no DB):** target-GW selection (incl. off-season → empty);
  season-label derivation (July boundary both sides); no-op guards; serve-mode minutes composition
  (fit-once, predict-per-player, zero-row skip); DGW summation in the serve loop; upsert payload
  shape + rounding; `--as-of-gw` window semantics. DB I/O is isolated in thin functions so
  everything else tests as pure pandas.

## 6. GitHub Actions workflow (`.github/workflows/xpts-serve.yml`)

- `schedule: '30 4 * * *'` UTC (after the 03:00 bootstrap, 03:30 history, and 04:00 `fpl-project`
  crons — v1 and v3.1 project the same night on the same data) + `workflow_dispatch` for manual runs.
- One job: checkout → `actions/setup-python` 3.12 with pip cache → `pip install -r
  model/requirements.txt` → `python model/serve_v3.py` with `DATABASE_URL:
  ${{ secrets.DATABASE_URL }}`. `timeout-minutes: 20`; `concurrency: xpts-serve` (no overlapping
  runs).
- **The secret is the Supabase session-pooler URI** (GitHub runners are IPv4-only; the direct DB
  host is IPv6) — an operator step (§9).
- Failure surface: a failed run → GitHub failure email + stale shadow rows; v1 serving unaffected.
  No Sentry/alerting beyond that (v3 spec §9 decision).
- The serving target table is provided as an env var `XPTS_SERVE_TABLE` defaulting to
  `projections_shadow` — the promotion swap (§8) flips this one line.

## 7. Prospective eval (#130) — `model/eval_prospective.py` + pre-registered semantics

**THIS SECTION IS THE PROSPECTIVE REGISTRATION** — frozen now, before the season starts. On-demand,
read-only; no new tables (every input is durable: shadow/`projections` rows freeze naturally once a
GW leaves the 3-GW writing window, actuals live in `player_gw_history`, the deadline-frozen `ep_next`
lives in `player_gw_snapshots`).

- **Evaluated GW:** a GW enters the scoreboard when its history rows exist (finished + captured) and
  both models have projection rows for it.
- **Join unit:** (player_id, gw) within the current season — shadow (v3.1) × `projections` (the v1
  family: `model_version like 'v1%'` — the Deno writer stamps `'v1.0.0'`) × summed actual points
  from history × snapshot `ep_next`.
- **MAE (the promotion metric):** each model's shipped point estimate — v1 `p50` vs v3.1 `p50`
  (= simulated median) — over the **full joint population** (rows where both models emitted and an
  actual exists, played or not). **Starters-only MAE** (actual minutes ≥ 60) reported as a
  diagnostic, never the criterion.
- **Captaincy:** per GW, each model's **ex-ante argmax over its own projected rows** — v1 by `p50`,
  v3.1 by `mean` (its registered ranking functional) — realized captain points summed. No hindsight
  filtering of the pick pool.
- **`ep_next` benchmark (context, not a gate):** MAE + captaincy of the deadline-frozen snapshot
  `ep_next` on the same pools; **rows with `ep_next = 0` are excluded from the benchmark** (known
  capture coercion — `num()` turns unparseable into 0).
- **Bootstrap (context, not a gate):** the #144-style paired bootstrap over per-GW captain deltas,
  reported so noise is visible; the promotion condition itself is strict.
- **Promotion condition (user decision 2026-07-07, strict):** `evaluated_gws >= 6` AND cumulative
  full-pool MAE(v3.1) < MAE(v1) AND cumulative captaincy(v3.1) ≥ captaincy(v1). The script prints
  **PROMOTE-ELIGIBLE** or **HOLD (reason)** and refreshes `docs/xpts-prospective.md` (committed
  manually with the run — no cron, no auto-commit).
- Attribution is by `model_version` in every query — never table identity (promotion swaps tables).

## 8. Promotion & rollback runbook (shipped as a section of `docs/xpts-prospective.md`)

- **Promote** (after PROMOTE-ELIGIBLE + a human decision): one PR that (a) sets the workflow's
  `XPTS_SERVE_TABLE` to `projections`, (b) flips `fpl-project`'s target-table constant to
  `projections_shadow` (its upsert payload is unchanged — the depth columns are nullable). Merge →
  CI deploys `fpl-project`; the next nightly runs swap roles. The dethroned v1 keeps running as
  shadow.
- **Rollback:** revert that PR. Nothing else moves.
- **Eval attribution unaffected** by the swap (`model_version` filters), and the client contract
  (`projections` shape) never changes — v3.1's writer emits the same contract columns.
- The runbook section also records the strict promotion condition verbatim and the ≥6-GW window.

## 9. Operator steps (documented in the runbook; not code)

1. Create the `DATABASE_URL` GitHub Actions secret (Supabase session-pooler URI, `postgres` role).
2. After merge: one manual `workflow_dispatch` run — expected result off-season is the clean no-op
   (`skipped: no unfinished fixtures`), which validates checkout/deps/secret/connectivity end to end.
3. When 2026/27 GW1 data exists, eyeball the first real rows
   (`select * from projections_shadow order by gw, p50 desc limit 20`).

## 10. Failure modes

- Workflow failure → GitHub email; stale shadow; v1 unaffected. Re-run via `workflow_dispatch`.
- Partial-season data (some GWs unfinished mid-week): target selection is by `finished = false`, so
  mid-GW runs re-project in-play GWs — same semantics as v1's nightly upsert; the eval reads the
  last row written before the GW left the window (identical treatment for both models — fair).
- Empty `players`/bootstrap tables are irrelevant (DB-only design reads history + fixtures).
- `eval_prospective.py` with zero evaluated GWs prints the empty scoreboard + HOLD (no crash).

## 11. Out of scope (deliberate)

Client changes of any kind; exposing depth columns to the app (post-promotion product decision); any
model/registration change (a v3.2 candidate = its own cycle); #126/#131; workflow alerting beyond
GitHub's failure email; auto-committing eval outputs.

## 12. Process & sequencing

Branch `feat/xpts-serving-revival` (this spec is its first commit) → implementation plan →
SDD execution → local parity run against the 2025/26 snapshot DB → PR → after merge: operator steps
(§9) → #128 closes when the dispatch no-op validates; #130 closes when `docs/xpts-prospective.md` +
runbook are committed (the scoreboard stays empty until 2026/27 GWs finish). Never run any
`backtest_*.py` as `__main__`.

## 13. Success criteria

1. The parity guard passes on 2025/26 GW30: exact input-tuple parity on the intersection, an
   explainable (≈0–5 row) set-difference, and the sampled shared-seed draw check identical.
2. The workflow's manual dispatch completes green off-season with the `skipped` no-op.
3. `eval_prospective.py` runs against the (empty) current season without error, printing HOLD, and
   `docs/xpts-prospective.md` + the promotion runbook exist with the §7 registration verbatim.
4. v1's serving and the client are provably untouched (no diff under `supabase/functions/fpl-project`
   or `src/`).
