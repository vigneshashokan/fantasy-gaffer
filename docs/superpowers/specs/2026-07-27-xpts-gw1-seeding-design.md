# xPts GW1 cold-start seeding — design

**Issue:** [#212](https://github.com/vigneshashokan/fantasy-gaffer/issues/212)
**Date:** 2026-07-27
**Status:** designed, not built
**Hard deadline:** 2026-08-21 (GW1 deadline). The value window extends to ~GW7.

---

## 1. Problem

At the start of a season `fpl-project` skips with `no-history-for-season`
(`supabase/functions/fpl-project/index.ts:147`). This is correct given v1's
feature set — every feature is an exp-decay average over recent gameweeks, and
there are none — so the client falls back to FPL's `ep_next`.

**That fallback is degenerate.** Measured against the live 2026/27 bootstrap on
2026-07-27 (563 elements):

| Field | Observation |
|---|---|
| `ep_next` | **23 distinct values** across 535 non-zero players, hard-capped at 4.0 |
| `ep_next` top | four-way tie, exactly one per position |
| `form` | `0.0` for all 563 |

An optimiser fed that buys Raya (£6.0m) over Haaland (£15.5m) — identical `ep`,
a third of the price — and captains the goalkeeper. Demonstrated in #211.

The window is wider than GW1. v1's `FORM_WINDOW` is 6, so through GW6 the model
serves projections built on 1–5 rows of history. That has never been measured
and is assumed noisy. **Seeding addresses GW1–6, not just GW1.**

## 2. The unlock

`element-summary/{id}.history_past` returns per-season aggregates 4 seasons back,
containing every stat in `FORM_STATS` plus `minutes`, `starts`, `start_cost`,
`end_cost` and `element_code`. Verified post-rollover on 2026-07-27 (element 411,
Haaland).

`element_code` is in the payload, so **no cross-season database join is
required.** The documented "element ids reset each season" blocker (which is why
`player_gw_history` has no FK) does not apply: `code` is stable.

### 2.1 Feature availability by season — depth cap

```
2022/23  defensive_contribution = 0    ← stat did not exist
2023/24  defensive_contribution = 0    ← stat did not exist
2024/25  defensive_contribution = 104  ✓
2025/26  defensive_contribution = 104  ✓
```

FPL returns the key with a zero rather than omitting it, so a 3+ season blend
would silently dilute that feature toward zero with **no error anywhere**. Two
seasons is the exact depth at which every v1 feature is real. This is the
binding reason for the depth cap, not merely a preference.

### 2.2 Do not read prior-season aggregates off the bootstrap

The pre-season 2026/27 bootstrap is *currently* serving last season's aggregates
on `elements` (`total_points` max 239, `minutes` max 3420, `starts` max 38,
`expected_goals` max 25.5 — all matching Haaland's `history_past` row exactly).

**Do not build on this.** FPL zeroes these at season start, so code reading them
would pass every test runnable before 2026-08-21 and return zeros on the one day
it matters. `history_past` is explicitly historical and unambiguous. The extra
cost is one `element-summary` call per player, paid once.

### 2.3 Measured population figures

State these with their provenance; do not conflate them.

| Measurement | Value | Source |
|---|---|---|
| Elements in 2026/27 bootstrap | 563 | live API, 2026-07-27 |
| Share a `code` with the 2025/26 E2E capture | 456 | committed capture |
| Of those, element id unchanged | 5 (1.1%) | ditto |
| Carry non-zero prior-season `minutes` in bootstrap | 400 | live API |

456 and 400 differ because a player can be in both seasons' games having played
zero minutes. **Exact seed coverage is not knowable until the ingest runs.** The
newcomer path must handle whatever the gap turns out to be; no number is assumed.

## 3. Ruled out

- **Pre-season friendlies** — absent from the FPL API entirely. Would require an
  external feed (#126, parked). Poor signal regardless: trialists, heavy
  rotation, uneven opposition.
- **International duty** — same absence, and weakly predictive of club returns
  (different teammates, role, opposition).

## 4. Mechanism: pseudo-fixtures

Rather than a blend function or a handover schedule, synthesize the prior season
as **6 pseudo-fixture rows** and prepend them to the player's real history.
`build_feature_row` (`model/features.py:50`) already sorts most-recent-first and
takes `head(FORM_WINDOW)`, so the existing exp-decay does all the work.

Prior weight by real gameweeks played, computed at `DECAY_ALPHA = 0.85`
normalised over the 6-row window:

| Real GWs played | Prior weight |
|---|---|
| 0 (GW1) | 100.0% |
| 1 | 75.9% |
| 2 | 55.4% |
| 3 | 38.0% |
| 4 | 23.3% |
| 5 | 10.7% |
| 6+ | 0.0% |

Consequences:

- No decay schedule, blend code, or handover logic is written.
- GW1 and GW20 are **one code path**; nothing is special-cased.
- The prior's disappearance is *structural*, not approximate (see §7, G3).
- `buildProjections` and the feature builders are **not modified**, so the
  existing parity fixture keeps covering the scoring chain unchanged.

### 4.1 Synthesis

Per stat `X` in `FORM_STATS`, per season `s`:

```
rate_X(s) = total_X(s) / 38
r_X       = 0.7 · rate_X(recent) + 0.3 · rate_X(prior)
xm        = 0.7 · (starts(recent)/38) + 0.3 · (starts(prior)/38)
```

Weights renormalise to 1.0 when only one season is available.

Emit 6 identical rows: `{gw: 0, fixture_id: -1..-6, starts: xm, form stats: r_X}`.
`gw: 0` sorts below every real gameweek under the existing
`sort_values(["gw","fixture_id"], ascending=False)`, so real rows always fill the
window first.

`starts` carries a **fraction** (0.79, not 0/1). Deliberate and correct: `xmin`
is `prior["starts"].mean()`, so a fractional pseudo-row yields the intended
availability with no separate handling.

### 4.2 Accepted approximation — the denominator

`history_past` gives no appearance count, so per-fixture rates use a fixed
denominator of 38. This matches v1's blank-inclusive semantics (`player_gw_history`
carries a row per player per gameweek regardless of minutes) but **under-rates
mid-season arrivals**: a January signing's `xmin` lands near `starts/38 ≈ 0.4`,
reading as "rotation risk" rather than "was not in the league yet".

Conservative rather than dangerous, and `xmin`'s own coefficient absorbs part of
it. Stage 0 (§7) measures this directly against the true blank structure; if a
better denominator is indicated, adopt it there **before** the gate is run, never
after.

### 4.3 Newcomers

Players with no `player_season_history` row in either season are seeded by
**k-nearest-by-price, k=10, within position**. Reference price is the prior
season's `end_cost` (closest proxy to current valuation); the newcomer is matched
on `now_cost`. No band boundaries to define and no empty-bucket edge case.

They inherit the neighbours' `xm` as well, so a £9.0m midfielder seeds at roughly
a £9.0m midfielder's minutes rather than at an unknown's.

Rationale over the alternatives: a flat positional prior rates a £9.0m signing
identically to a £4.5m academy player — the exact flattening that made `ep_next`
useless. Leaving form at zero and letting `value_scaled` carry it is worse still:
in training, form ≈ 0 means "player who has been blanking", so it reads "unknown"
as "in terrible form".

### 4.4 Explicitly not handled here

- **Availability.** v1 has never seen `status` or `chance_of_playing`; the
  decision layer applies `availabilityFactor` downstream (`src/utils/gafferAdvice.ts`).
  An injured player seeds at their true rate and is discounted downstream.
  Applying it in both places would double-discount.
- **Club transfers.** Rates travel with the player; opponent strength and
  home/away come from the *current* fixture at serve time, never from history.
  No special case. (#212 open question 3, resolved.)

## 5. Architecture

Nine changes. **No new edge function** — `season-history` is a *source* of
`fpl-ingest`, so the "deploy by name or it 404s in prod" trap does not apply.

### 5.1 Schema (one migration)

- `players.code integer` — the stable cross-season key. `clubs` already has one;
  `players` does not (`20260610010000_fpl_reference_data.sql:41-59`).
  **Added NULLABLE, deliberately.** `add column ... not null` fails on a
  populated table without a default, and defaulting to `0` would write a lie into
  the one column the whole design joins on. It is backfilled by the next
  `bootstrap` run; the seed join skips null-code rows, so the system self-heals
  after one ingest. Tightening to `not null` is a later migration, once
  saturation is confirmed.
- `player_season_history` — PK `(season, element_code)`, raw `history_past`
  aggregates, **no FK** (same season-scoped reasoning as `player_gw_history`),
  RLS enabled with no policies (service-role only).
- Widen the `ingestion_runs.source` CHECK to admit `'season-history'`.

Store **raw aggregates, not synthesized rows.** Synthesis is model logic that may
change; storing raw means the fetch is never repeated.

### 5.2 Ingest — `fpl-ingest`

- `sources/bootstrap.ts` writes `code`.
- `sources/season-history.ts` (new) fetches `element-summary/{id}` and upserts
  **every season the payload returns** (up to 4). **Incremental**: only players
  with no row at all are fetched, so the ~563-call cost is paid once and new
  signings trickle in thereafter. (#212 open question 5, resolved.)

  Storing all four rather than only the two used is deliberate: the Stage 1 gate
  predicts 2025/26 from 2023/24 + 2024/25, so a two-season ingest would not
  contain its own training input. Storage is trivial (~4 × 563 rows), and it
  keeps the §2.1 depth cap where it belongs — a **synthesis** decision in model
  code, not an ingest decision baked into the table.
- Daily cron; harmless once saturated.

### 5.3 Serving — `fpl-project`

- `lib/seed.ts` — synthesis per §4.1/§4.3.
- `index.ts` — prepend pseudo-rows to `historyByPlayer`; change the skip
  condition (§7).
- Seeded rows carry a `model_version` naming the **winning arm**: `'v1.0.0-seed'`
  if S wins, `'seed-h-1.0.0'` if H wins. It must never read `v1.0.0`, or
  `eval_prospective.py` will pool seeded and unseeded rows into one arm and the
  prospective comparison becomes meaningless.

### 5.4 Offline — `model/`

- `seed_spec.py` + `seed.py` mirroring `lib/seed.ts`, guarded by the parity
  fixture.
- `backtest_seed.py` — gate module with its own results marker.

### 5.5 Data flow at GW1

```
bootstrap-static ──→ players (id, code, position, now_cost)
element-summary/{id} ──→ player_season_history (season, element_code, totals)
                                    │
              players ⟕ psh ON code │  (id resets; code does not)
                                    ▼
                          6 pseudo-rows per player
                                    │
                    prepend to real history (empty at GW1)
                                    ▼
                  buildProjections ── UNCHANGED ──→ projections
```

### 5.6 Consequences

- `projections` receives rows during pre-season for the first time, so
  `fpl-project`'s stale-row sweep (`index.ts:202`) becomes active earlier. Safe:
  it is keyed on `computed_at` within the run.
- **The client needs zero changes.** `useProjections`/`useTopPicks` simply stop
  reaching the `ep_next` fallback.
- `eval_prospective.py` splits by `model_version`, so it picks up `v1.0.0-seed`
  for prospective confirmation against real `ep_next` with no modification.

### 5.7 Approach rejected: Python-side seeding

A `model/seed_gw1.py` on the `xpts-serve.yml` rails would let the backtest and
serving share literal code (zero skew by construction). Rejected because it
breaks `serve_v3.py`'s stated *"DB-only by design — zero FPL API calls"*
invariant, adds a second writer racing `fpl-project`'s stale-row sweep, and can
only cover GW1–5 before handing off at a cliff — **losing the window blend**, so
GW2–6 stay noisy.

The duplication that Approach A costs is a solved problem here: `feature-spec.ts`
↔ `feature_spec.py` already runs this discipline under a golden parity fixture.

## 6. Candidates

Under the user decision *"best available ships"*, the heuristic is a real
candidate, not merely a yardstick.

| Arm | Definition |
|---|---|
| **S** | seeded pseudo-rows → frozen v1 coefficients |
| **H** | `0.7·(total_points(recent)/38) + 0.3·(total_points(prior)/38)` — i.e. exactly `r_total_points` from §4.1 |
| **V** | real v1 on its 1–4 rows of history — *what ships today*, GW2–5 only |

H is deliberately defined against the §4.1 rate rather than as
`points_per_game × min(1, minutes/900)`. Two reasons: `history_past` gives no
appearance count, so a per-appearance ppg is not derivable at all; and dividing
by 38 **already** shrinks for missed games, so an additional minutes term would
double-shrink. This makes the comparison exactly the right question — *does the
full model add anything over last season's points per fixture?*

Availability is excluded from all three: it is unrecoverable retrospectively and
is applied identically downstream by `availabilityFactor`.

Arm V is included to test the claim that this fixes GW2–6, not only GW1.

**Conditional cost.** `projections.p25/p50/p75` are `not null` and H produces a
single number. If H wins, it needs interval synthesis — position-level empirical
quantile ratios measured off 2025/26 actuals. Costed; **not built unless the gate
calls for it.**

## 7. Validation

### Stage 0 — smoke test (go/no-go, before any serving code)

Build pseudo-rows from 2025/26 GW1–19 aggregates, score GW20–24 with frozen v1,
compare against real v1 running on full history. Uses
`model/data/player_gw_history_2025-26.csv.gz` — no API calls, no survivorship.

Not a gate. A distribution check: are outputs plausible, are position-level means
near v1's, is ranking correlation sane. Its purpose is to discover a broken
feature synthesis **before** the ingest, migration and harness are built.

It also validates §4.2's denominator directly, because it has the true blank
structure available.

### Stage 1 — the gate

Seed from 2024/25 (0.7) + 2023/24 (0.3) → predict 2025/26 GW1–5 → score against
`player_gw_history` actuals.

**Registered before any candidate number exists. Do not tune against these and
re-register** (the #144 discipline).

- **G0 (floor)** — the winner must beat a per-position constant predictor. That
  constant is the position's mean per-fixture points computed **strictly from the
  prior seasons** (2024/25 + 2023/24), never from the 2025/26 evaluation window —
  otherwise the floor leaks its own answer and is unbeatable by construction. If
  the winner does not clear it, seeding adds nothing over a lookup table: ship
  nothing.
- **G1 (binding)** — MAE among players with prior-season `starts ≥ 10`;
  uncapped-population MAE reported alongside per #144. The lower-MAE arm of
  {S, H} ships. **Ties go to H** as the simpler artifact.
- **G2 (guard)** — across GW1–5 the top-ranked pick is never a goalkeeper, and
  always has prior-season `starts ≥ 20`. These encode exactly the two failures
  observed in #211 (Raya over Haaland; the two-appearance £4.5m keeper).
  Deliberately no third criterion invented. A pathology check, not a points
  comparison: n=5 gameweeks cannot power the #144 paired bootstrap, and claiming
  otherwise would be false precision.

#### G3 dissolves into a unit test

`player_gw_history` carries a row per player per gameweek regardless of minutes
(captured from `event/{gw}/live/`, which returns all elements). Therefore every
player has 6 real rows by GW7, and `head(6)` **provably cannot see a pseudo-row**.

The prior does not decay out approximately within a tolerance — it is gone
deterministically. G3 is an assertion, not a backtest metric.

### Known limitation — survivorship

The cross-season backtest needs `history_past` from *today's* bootstrap, so its
population is filtered by surviving **two** summers where serving requires only
one. This skews toward better and younger players and inflates both arms.

It is expected to inflate them roughly equally and so not to flip the ranking,
which is what the gate tests. Report it with the verdict; do not treat it as
disqualifying.

### Prospective confirmation

The retrospective gate cannot test against live `ep_next` — 2025/26's is
unrecoverable from the API, which is why #123's snapshotter exists. That
snapshotter is deployed and armed, so the true head-to-head runs through
`eval_prospective.py` on 2026/27 GW1 onward.

**Retrospective decides whether to build; prospective decides whether it was right.**

## 8. Testing

- `seed.test.ts` + Python mirror — blend weights, single-season renormalisation,
  k-NN newcomer path, pseudo-below-real ordering, and the G3 structural assertion.
- **`seed` block in `parity-fixture.json`** — Deno synthesis == Python to 1e-6.
  This is the skew guard; keep it green. Same discipline as
  `feature-spec.ts` ↔ `feature_spec.py`.
- `index.test.ts` — the changed skip condition: skip only when there is **neither**
  history **nor** seeds, so an unsaturated cron on first deploy fails safe.
- `season-history.test.ts` — incremental behaviour (does not refetch existing
  rows), season labelling.
- Full `fpl-ingest` suite needs `deno test --allow-read` (two pre-existing
  fixture-reading suites); bare `deno test` shows NotCapable failures that are
  not regressions.

## 9. Rollout — data first, serving last

1. Migration + `code` + season-history ingest → merge, deploy, let the cron
   saturate. Verify row count ≈ 2 × players. **Land early**, so saturation is well
   clear of the deadline.
2. Stage 0 smoke test → go/no-go **before any serving code is written**.
3. Stage 1 gate → verdict into `docs/xpts-model.md` under its own marker.
4. Serving change → merged **only** on a pass.
5. Verify on the local stack via `./e2e/dev.sh` before 2026-08-21.

`db push` must precede `functions deploy` (the `deploy-supabase.yml` job already
orders them correctly) — deploying the function first would 500 every run on the
`ingestion_runs.source` CHECK.

**If the gate fails:** step 1 still stands (the data is captured and permanent),
nothing reaches serving, `ep_next` holds. That outcome costs a day, not the
project.

## 10. Non-goals

- Not changing the serving model. This alters **feature construction at season
  start**, nothing else.
- Not touching the v3.1 shadow arrangement or the promotion runbook.
- Not #126 (external xG) — no new data provider.
- v1 only, since that is what users see. Applying the same seeding to v3.1 is a
  follow-up.
- Not a paywall or monetization change. Per the standing stance, model accuracy
  is free.

## 11. Resolved open questions from #212

| # | Question | Resolution |
|---|---|---|
| 1 | Decay schedule — linear or exponential? | Neither. Pseudo-fixtures ride the existing `FORM_WINDOW`/`DECAY_ALPHA` (§4). |
| 2 | How many prior seasons? | Two, weighted 0.7/0.3 — capped by `defensive_contribution` availability (§2.1). |
| 3 | Club transfers? | Accept, no special case — fixture context is current-season (§4.4). |
| 4 | Promoted-club / newcomer prior? | k-nearest-by-price within position, k=10 (§4.3). |
| 5 | Rate limiting on ~563 calls? | Incremental ingest; full cost paid once (§5.2). |

## 12. Follow-up levers (not in scope)

- Derive a true appearance denominator instead of 38 (§4.2), if Stage 0 indicates
  it matters.
- Apply the same seeding to v3.1's `rates_v3.py` per-90 rates.
- Revisit the 0.7/0.3 split empirically once two seasons of prospective data exist.
