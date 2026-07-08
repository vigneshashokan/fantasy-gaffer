# Maestro E2E Suite (#48) — Design

**Date:** 2026-07-07 · **Issue:** #48 · **Status:** approved design, v1 scope

## 1. Context & goal

The app's automated safety net today is jest + `tsc`. Both have repeatedly missed whole
classes of runtime failures: the persisted-cache `Map` crash (#117), the `tk.purpleD`
undefined-token bug, and the modal-behind-modal navigation defect — all invisible to unit
tests because none exercise the real app booting on a real runtime against real storage.

v1 delivers a **hermetic, deterministic end-to-end suite**: Maestro drives the actual
dev-client app on the iOS simulator, signed into a **local Supabase stack**, reading FPL
data from a **local fixture server**. One command runs everything: `./e2e/run.sh`.
Everything the suite touches is local; it is green in July and in January, during FPL API
downtime, and offline.

## 2. Scope — recalibrated from the stale issue body

The issue predates the advisory pivot. Three of its seven flows ("make a transfer →
confirm", "change captain → confirm", "use a chip → active banner") are **Phase 6
write-back features that do not exist in the app** and cannot be tested. The
`/dev/seed-test-user` endpoint and the "iOS and Android in CI" acceptance criteria are
likewise recalibrated below. Record this recalibration in an issue comment when the PR
lands.

**In scope (v1):**
- Three flows on the iOS simulator, run locally: sign-in → Team advice; connect-team
  import; tab sweep + sign-out (§8).
- The one app-code seam (env-overridable FPL base URL) + `testID` anchors (§5).
- Fixture capture from the live API **now, before the season rollover makes 2025/26
  data uncapturable** (same lesson as the history backfill).
- A runbook: `docs/e2e.md`.

**Out of scope (v1), recorded as follow-ups:**
- CI (§11 documents the designed path; follow-up issue on #48 close).
- Android (flows are platform-agnostic YAML; they transfer when Android tooling exists).
- Sign-up flow (feasible against the local stack — `enable_confirmations = false` — but
  deliberately excluded by user decision), password reset (email round-trip + deep link),
  Google/Apple OAuth (not automatable), biometric (#73, device-only), write-back flows
  (Phase 6).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Flow set | Sign-in→Team advice · connect-team import · tab sweep + sign-out |
| Backend | Local Supabase stack (`supabase start`) + idempotent seed script |
| FPL data | Local fixture server + env-overridable `FPL_BASE` |
| Platform/CI | iOS simulator locally now; CI designed-not-built (Android-on-Linux path) |
| Harness shape | Thin: Maestro YAML + one bash runner + small Node ESM scripts, no framework |

## 4. Architecture

```
Maestro CLI ──drives──► dev-client app (EAS dev-simulator artifact, iPhone 16 sim)
                            │  JS bundle from
                            ▼
                        Metro (npx expo start, e2e env vars)
                            │ app.config.ts → extra.*
              ┌─────────────┴──────────────┐
              ▼                            ▼
   local Supabase stack           fixture server (Node, :4004)
   (Docker, API :54321)           serves captured FPL JSON
   auth users A/B, profiles,      bootstrap / entry / picks /
   clubs, fixtures, projections   element-summary / event-live
              ▲                            ▲
              └── seed.mjs ── reads ───────┘
                  (one dataset feeds both: Postgres reference
                   tables and the FPL routes are derived from
                   the same captured+transformed JSON)
```

Key property: **the app under test is the production code path.** The only app-code
divergence between E2E and production is two env vars (Supabase URL/key already exist;
FPL base URL is the one new seam). PostHog and Sentry keys are unset in the e2e env, so
both egresses are no-ops by their existing design.

Directory layout:

```
e2e/
  run.sh                 # the one entry point
  flows/                 # Maestro YAML (signin-team, connect-team, tabs-signout)
  flows/subflows/        # shared steps (sign-in)
  fixtures/raw/          # committed: captured FPL API JSON (untouched)
  transform.mjs          # committed: pins a synthetic "live GW", run-relative dates
  transform.test.mjs     # node --test unit tests for the transform
  fixture-server.mjs     # committed: static server over the transformed dataset
  seed.mjs               # committed: resets/creates users + reference tables
  .artifacts/            # gitignored: transformed fixtures, cached .app artifact,
                         # service logs
```

(No committed `.env.e2e`: the runner reads the live stack's URL + keys from
`supabase status` at run time and exports them itself — they always match the
running stack, and nothing key-shaped is committed.)

```
docs/e2e.md              # runbook
```

`e2e/**` is excluded from jest and `tsc` (like `supabase/functions` and `model/`);
harness scripts are plain Node ESM tested via `node --test`.

## 5. App-code changes (the complete list)

**5.1 FPL base URL seam.** `src/api/fpl-client.ts` hardcodes `FPL_BASE`. Change, following
the exact pattern `src/lib/supabase.ts` uses (bundle-time env is readable **only** in
`app.config.ts`):

- `app.config.ts`: forward `EXPO_PUBLIC_FPL_BASE_URL` into `extra.fplBaseUrl` (alongside
  the existing supabase/posthog/sentry forwards).
- `fpl-client.ts`: `const FPL_BASE = Constants.expoConfig?.extra?.fplBaseUrl ??
  'https://fantasy.premierleague.com/api';`

Unset ⇒ byte-identical production behavior. This is the extension point the file's own
header comment already promised for the future `fpl-proxy`. Covered by a unit test
(default when `extra` lacks the key; override when present).

**5.2 `testID` anchors.** Selector policy: **`testID` for navigation/interaction anchors,
visible text for content assertions** (the assertion should prove the user *sees* the
content; anchors must survive copy changes). Naming: kebab-case, stable, no indices except
entity ids. Anchors to add (final list confirmed during implementation; existing ones —
`gw-carousel`, `gw-scroll`, `team-id-input`, `stats-{id}` — are kept):

- Sign-in screen: `signin-email`, `signin-password`, `signin-submit` (+
  `onboarding-signin-link` on the landing screen's sign-in affordance)
- Tab bar items: `tab-team`, `tab-top-picks`, `tab-transfer`, `tab-account`
- Team tab: `connect-team-cta` (the not-yet-linked empty state); `chip-tips` on the
  chips section in `GameweekScreen` (the chips UI lives on the Team tab since PR #61 —
  not the Transfer tab); the existing `gw-carousel`/`gw-scroll` anchor the pitch
- Connect-team: `connect-team-submit`, `connect-team-confirm`
- Account menu (sign-out and Settings live in the AccountMenu popup, not the Settings
  screen): `account-menu-settings`, `account-menu-signout`
- Top Picks / Transfer: container-level anchors only (`top-picks-list`,
  `transfer-suggestions`) — row content is asserted by text

`testID` additions are invisible to users, a11y, and snapshots; no behavior change.

## 6. Fixture dataset & server

**6.1 Capture (one-time, this week).** `e2e/fixtures/raw/` holds untouched responses
captured from the live API, which still serves coherent 2025/26 data. After rollover this
becomes uncapturable — capture is part of the implementation PR, not deferred. The set,
matching every `fplGet` call site in `src/api/`:

| Route (app call site) | Captured |
|---|---|
| `/bootstrap-static/` (`fixtures.ts`) | full |
| `/fixtures/` (not called by app; **seed input** for the Supabase `fixtures` table) | full season |
| `/entry/{E}/` (`manager.ts`, `teamPreview.ts`) | one real public entry `E` |
| `/entry/{E}/history/` (`manager.ts` — bank, chips, past GWs) | same entry |
| `/entry/{E}/event/{t±1}/picks/` (`squad.ts`, `teamPreview.ts`) | pinned GW `t`, plus `t−1` for carousel browsing |
| `/event/{t±1}/live/` (`fixtures.ts` — per-GW points) | GW `t` and `t−1` |
| `/element-summary/{id}/` (`playerSummary.ts`) | the 15 squad players of entry `E` |

`E` = a real public FPL entry (the founder's own team is fine); `t` = a mid-season GW
chosen at capture time (e.g. GW30 — no blanks/doubles, so the "no DGW yet" chip copy is
the expected assertion).

**6.2 Transform (`transform.mjs`, runs at suite start).** Pure function over the raw
captures, emitting `e2e/.artifacts/fixtures/`:

- Re-labels GW `t` as the live gameweek: `is_current = true`, `finished = false`,
  `data_checked = false`; every event after `t` becomes unstarted (`is_next` on `t+1`);
  every event before `t` stays finished.
- **Run-relative dates:** deadlines are rewritten so GW `t`'s deadline sits in the near
  future relative to `Date.now()` at transform time (later GWs spaced weekly after it).
  This keeps countdown/deadline UI in a sane, stable state forever. This is why the
  transformed output is generated per-run and gitignored, while raw + transform are
  committed: determinism lives in the inputs and the pure function, not a frozen output
  whose dates would rot.
- Leaves player/team data untouched (assertions reference real captured names).

`transform.test.mjs` (`node --test`) covers: event flags correct around `t`; deadlines
strictly increasing and future-relative; idempotence over the same raw input; player data
byte-identical.

**6.3 Server (`fixture-server.mjs`).** Zero-dependency `node:http` static router over the
transformed dataset, `:4004` (env-overridable). Routes mirror the table above;
`/element-summary/{id}/` falls back to a template response for ids outside the captured
set; unknown routes 404 loudly (a 404 in the Maestro run log = the app called something
the dataset doesn't model — extend the dataset, don't loosen the server).

## 7. Local backend & seeding (`seed.mjs`)

Targets the local stack only (`http://127.0.0.1:54321`, the well-known local
`service_role` demo key — no secrets; the script refuses to run if the URL is not
localhost). Idempotent reset-and-create on every suite run:

- **User A** `e2e-a@fantasygaffer.test` / fixed password: confirmed email
  (`enable_confirmations = false` locally, and the admin API creates confirmed users
  directly), `profiles` row (name/dob satisfying the COPPA CHECK), `fpl_team_id = E`.
- **User B** `e2e-b@fantasygaffer.test`: confirmed, `profiles` row, `fpl_team_id = NULL`
  — lands on the Team tab's connect-CTA state (per the `(onboarding)/_layout` gate,
  `complete` status with no team routes to the tabs).
- **Reference tables** `clubs` + `fixtures`: derived from the *transformed* dataset (same
  ids/GW numbering the fixture server serves) — these feed `useFixturesByGw`/
  `useAllFixtures` (chip advice, FDR).
- **`projections`**: rows for entry `E`'s 15 squad players at GWs `t..t+2`
  (`model_version 'e2e-fixture'`), so the advice path exercises model `p50`s rather than
  the `ep_next` fallback, with deterministic captain ordering.
- Deletes any prior E2E users first (by email), cascading profiles.

## 8. Flows

Every flow: `launchApp` with `clearState: true` (wipes AsyncStorage — no session or
persisted-query-cache bleed), then **`openLink` on the dev-client deep link**
(`fplgafferreactnativeapp://expo-development-client/?url=<metro-url>`) — the order
matters: clearing state also wipes the dev client's pinned Metro URL, so the attach must
happen inside the flow, after the wipe. Then `extendedWaitUntil` on the first app screen
(long enough to cover bundle compilation on the first flow). Shared
sign-in steps live in `flows/subflows/signin.yaml` (parameterized by email/password via
Maestro env).

1. **`signin-team.yaml`** — user A signs in → Team tab → assert: the GW carousel
   renders (`gw-carousel`), known captured player names are visible (a MID starter +
   the GK), and the chips section (`chip-tips`) is reachable by scrolling. This is the
   flow that would have caught the `Map`-persister cold-start crash class.
2. **`connect-team.yaml`** — user B signs in → Team tab shows `connect-team-cta` → tap →
   connect-team screen → enter `E` into `team-id-input` → submit → preview/confirm →
   populated My Team (same pitch assertions as flow 1).
3. **`tabs-signout.yaml`** — user A signs in → Top Picks tab: ranked rows render
   (`top-picks-list` + a captured player name) → Transfer tab: `transfer-suggestions`
   present → Account menu → Settings → open Privacy Policy (legal doc content visible;
   covers the modal-presentation regression class) → relaunch without clearing state
   (session + persisted cache survive a cold start) → sign out via
   `account-menu-signout` → assert onboarding landing screen.

Flake posture: assertions use Maestro's built-in wait semantics (`extendedWaitUntil` for
the two network-dependent screens, generous but bounded timeouts); no `sleep`-style fixed
waits; each flow is independently runnable (`maestro test e2e/flows/<one>.yaml`).

## 9. Runner (`e2e/run.sh`)

Sequential, fail-fast, one-line remediation printed per failed preflight:

1. **Preflight:** Docker daemon up; `maestro` on PATH; `supabase` CLI; jq/node present.
2. **Artifact:** if `e2e/.artifacts/app/FantasyGaffer.app` missing, resolve the latest
   finished `development-simulator` build via `eas build:list --json`, download + unzip,
   cache. `E2E_APP_PATH` env overrides.
3. **Services:** `supabase start` (no-op if running) → `node transform.mjs` →
   `node seed.mjs` → `node fixture-server.mjs &` → health-check `:4004` and `:54321`.
4. **Metro:** `npx expo start` in the background with the e2e env exported inline by the
   runner (`EXPO_PUBLIC_SUPABASE_URL` + anon key from `supabase status`,
   `EXPO_PUBLIC_FPL_BASE_URL=http://127.0.0.1:4004`, PostHog/Sentry forced empty —
   explicit env vars override any local `.env`); wait for the bundler to answer on
   `:8081`.
5. **Simulator:** boot `iPhone 16 Pro` (overridable `E2E_SIM_NAME`), `xcrun simctl
   install` the artifact, open the dev-client URL once as a warm-up so Metro compiles
   the bundle before the first flow's timeout starts (flows still re-attach themselves
   after each `clearState` — see §8).
6. **Run:** `maestro test e2e/flows/` (or a single flow passed as `$1`).
7. **Teardown:** kill fixture server + Metro (Supabase left running — it's the dev
   stack), propagate Maestro's exit code.

## 10. Testing the harness itself

- `transform.mjs` — `node --test e2e/transform.test.mjs` (also wired into the runner so a
  broken transform fails before any service starts).
- `fpl-client.ts` seam — jest unit test (default + override), plus the existing suite.
- `seed.mjs`/`fixture-server.mjs`/flows — validated by running the suite; that is their
  test. No mock-the-harness meta-testing (YAGNI).

## 11. CI — designed, not built (follow-up issue)

**Constraint that shapes everything:** GitHub's macOS runners have no Docker, so the
local-Supabase design cannot run there; iOS-sim-in-CI would force a hosted test backend.
The CI-viable combination is **Linux runners: Android emulator (KVM) + Docker Supabase +
the same fixture server, seeder, and YAML flows**. Path when picked up: an
`eas.json` `development-simulator`-equivalent Android profile (`.apk`), a
`workflow_dispatch`-only job first, promotion to PR-gating only after a flake-free week.
Nothing in v1's design blocks this — the flows, seeder, transform, and fixture server are
platform-independent; only `run.sh`'s simulator steps are iOS-specific (kept isolated at
the bottom of the script for that reason).

## 12. Risks & mitigations

- **Cleartext http from the app to localhost (ATS).** Dev-client debug builds ship with
  dev-friendly ATS, and the app already talks to local Supabase over http in dev, so this
  is expected to just work. If the sim build blocks it: add `NSAllowsLocalNetworking` to
  `ios.infoPlist` in `app.config.ts` and cut one new EAS dev-simulator build (~20 min).
- **Artifact staleness.** The cached 2026-07-02 artifact only contains *native* code; JS
  comes from Metro. It goes stale only when native deps change — the runbook says: after
  any dependency change that touches native modules, rebuild via
  `eas build --profile development-simulator` and clear `e2e/.artifacts/app/`.
- **Capture window.** Raw fixture capture must happen before the FPL season rollover
  (same failure mode as the history re-backfill). It is a task in the implementation
  plan, not a follow-up.
- **Metro attachment flakiness.** The dev client occasionally shows its launcher screen
  instead of auto-connecting. Mitigation: the runner opens the dev-client deep link
  explicitly after install; flows begin with an `extendedWaitUntil` on the first app
  screen, long enough to cover first-bundle compilation.
- **Maestro version drift.** Pin the Maestro version in the runbook + a
  `maestro --version` echo in the runner log; upgrade deliberately, not implicitly.

## 13. Acceptance criteria (v1)

1. `./e2e/run.sh` from a cold start (Docker running, nothing else prepared) reaches a
   green `maestro test` across all three flows on the iOS simulator.
2. A second consecutive run is also green (idempotent seed + clearState proven).
3. The suite makes zero requests to fantasy.premierleague.com, production Supabase,
   PostHog, or Sentry (fixture-server logs + env construction are the evidence).
4. `npm test` and `npx tsc --noEmit` stay green; production behavior of `fpl-client.ts`
   is unchanged with the env var unset (unit-tested).
5. `docs/e2e.md` lets a fresh machine run the suite from the runbook alone.
6. Issue #48 gets the recalibration comment + a follow-up issue for CI (Android-on-Linux
   path per §11).
