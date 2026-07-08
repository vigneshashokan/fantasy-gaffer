# End-to-end testing (Maestro)

This is the runbook for Fantasy Gaffer's Maestro E2E suite (#48): a hermetic, deterministic
black-box suite that drives the real dev-client app on the iOS simulator, signed into a
**local** Supabase stack, reading FPL data from a **local** fixture server. It exists
because jest + `tsc` have repeatedly missed whole classes of runtime failure that only show
up when the real app boots against real storage and a real navigator — the persisted-cache
`Map` crash (#117), the `tk.purpleD` undefined-token bug, and a modal-behind-modal
navigation defect. One command runs the whole thing: `./e2e/run.sh`. Design rationale lives
in `docs/superpowers/specs/2026-07-07-maestro-e2e-design.md`; read it before changing the
harness's shape.

## Prerequisites

Install these once per machine:

- **Docker Desktop**, running. The local Supabase stack is Docker-backed; `supabase start`
  will hang or fail without it.
- **Xcode**, with an iPhone 16-class simulator runtime installed (`iPhone 16 Pro` is the
  default; open Xcode → Settings → Platforms if it's missing, or set `E2E_SIM_NAME` to a
  simulator you do have).
- **The `supabase` CLI** (`brew install supabase/tap/supabase`).
- **A JDK** — the Maestro CLI is JVM-based and will not run without one. macOS ships only a
  Java *stub* (`/usr/bin/java` prints "Unable to locate a Java Runtime"), so install a real
  JDK, e.g. `brew install openjdk` (keg-only). Because it's keg-only, every shell that runs
  Maestro (or `./e2e/run.sh`) needs it on `PATH`:
  ```bash
  export JAVA_HOME="$(brew --prefix openjdk)"
  export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
  ```
  Verified working with **OpenJDK 26.0.1** (any modern JDK 17+ should do). Newer JDKs print a
  wall of `WARNING: … has been mutated reflectively …` lines from Maestro's bundled libs —
  those are harmless noise, not errors.
- **Maestro**, via the official installer (installs to `~/.maestro/bin`):
  ```bash
  curl -Ls "https://get.maestro.mobile.dev" | bash
  ```
  Record the version you install (the runner echoes `maestro --version` at the top of every
  run) — upgrade deliberately, not as a side effect of some other `brew upgrade`. Maestro
  version drift is a known flake source for this kind of suite. Verified working with
  **Maestro 2.6.1**.
- **`jq`** (`brew install jq`) — the runner uses it to parse `eas build:list --json` output.
- **`eas-cli`** (`npm i -g eas-cli`) + `eas login`, but only the *first* time you run the
  suite on a machine with no cached app artifact. Once `e2e/.artifacts/app/*.app` exists,
  the runner reuses it and `eas` is never invoked again unless you delete that cache.

Node and the project's own dependencies (already needed for everything else in this repo)
round out the list; there is nothing E2E-specific to `npm install`.

## Run it

```bash
./e2e/run.sh
```

runs preflight checks, resolves (or downloads) the app artifact, regenerates the fixture
dataset, starts/seeds the local Supabase stack, starts the fixture server and Metro,
boots the simulator, and runs all three flows under `e2e/flows/`. A clean run ends with:

```
[e2e] GREEN — all flows passed
```

A failure stops at the first broken step and prints a one-line fix (missing Docker,
missing `maestro`, a service that never came up, etc.) — see **Troubleshooting** below for
the ones that aren't self-explanatory. Because `set -euo pipefail` is on, `maestro test`'s
own exit code propagates: a failed assertion inside a flow fails the whole script, not just
a log line.

To iterate on a single flow instead of the whole suite, pass its path as the one positional
argument:

```bash
./e2e/run.sh e2e/flows/signin-team.yaml
./e2e/run.sh e2e/flows/connect-team.yaml
./e2e/run.sh e2e/flows/tabs-signout.yaml
```

Everything else about the run (services, seeding, simulator boot) is identical — only the
`maestro test` target narrows from the whole `e2e/flows/` directory to the one file. This
is the fast loop while writing or debugging a flow: full stack cost, but one Maestro run
instead of three.

**Where logs land.** The runner's own service logs are per-run files under
`e2e/.artifacts/`: `fixture-server.log` and `metro.log` (both gitignored, overwritten each
run). Maestro keeps its own, richer artifacts — a screenshot and a step-by-step log per
flow run — under `~/.maestro/tests/<timestamp>/`; that's the first place to look when a
flow fails on a specific step, since it shows exactly what was on screen at the point of
failure.

## How it stays hermetic

Every network call the app makes during a run stays on `127.0.0.1`: Supabase is the local
Docker stack (`supabase start`, not the production project), and FPL reads go through
`e2e/fixture-server.mjs` on `:4004` instead of `fantasy.premierleague.com` — the app's only
awareness of this is one env var, `EXPO_PUBLIC_FPL_BASE_URL`, which `fpl-client.ts` reads
through the same `??`-fallback seam `supabase.ts` already used for its own URL/key. PostHog
and Sentry are neutralised by starting Metro with **`EXPO_NO_DOTENV=1`**: that skips loading
`.env` entirely, so a developer's real PostHog key / Sentry DSN never enter the run, and the
analytics config resolves to `undefined` — the app's own disabled-no-op path
(`new PostHog(KEY ?? 'phc_disabled', { disabled: !KEY })` / `Sentry.init({ enabled: !!DSN })`).
The runner supplies the Supabase + FPL vars it *does* need inline, so nothing is lost by
skipping `.env`. (Handing PostHog an empty *string* key instead — the earlier approach — did
not work: its constructor rejects `""` with a `console.error`, which the dev bundle renders as
a full-screen LogBox that blocks every flow's first tap.) The practical effect: the suite is
green in July and in January, during FPL API downtime, and fully offline once the app artifact
and Docker images are cached locally. See the design spec's §4 (Architecture) and §12 (Risks &
mitigations) for the full picture, including how ATS/cleartext-to-localhost is handled if it
ever becomes a problem.

## Test accounts

Two Supabase auth users, re-created idempotently by `e2e/seed.mjs` at the start of every
run (deleted-then-recreated by email, so state never drifts between runs):

| Account | Password | State |
|---|---|---|
| `e2e-a@fantasygaffer.test` | `e2e-password-1` | Has a linked FPL team — lands straight on a populated My Team. |
| `e2e-b@fantasygaffer.test` | `e2e-password-1` | No linked team — lands on the Team tab's connect-team empty state. |

Both are always freshly seeded, so a flow never depends on state a *previous* run left
behind, and running the suite twice in a row is expected to be green both times.

## Adding a flow

Anchor policy (from the design spec's §5.2, keep following it): **`testID` for
navigation/interaction anchors, visible text for content assertions.** An anchor should be
stable across copy changes; a content assertion should prove the user actually *sees* the
right thing, so it targets the real rendered text, not a testID standing in for it.
Kebab-case, no indices except real entity ids (e.g. `stats-{id}`).

To add a flow:

1. If the screen you're targeting doesn't have the anchors you need yet, add `testID`s in
   the app code first (they're invisible to users, a11y, and jest snapshots — no behavior
   change). Check the anchor doesn't already exist under a different name before adding a
   duplicate.
2. Write the new `.yaml` under `e2e/flows/` (or `e2e/flows/subflows/` for steps meant to be
   shared via `runFlow`). Use `extendedWaitUntil`/`scrollUntilVisible` for anything that
   depends on a network round-trip or off-screen content — never a fixed `sleep`.
3. Iterate with the single-flow runner invocation above rather than the full three-flow
   suite; it's the same stack cost either way, but only running your flow.
4. If a new Maestro env var is needed beyond the existing `DEV_CLIENT_URL`/`EMAIL_A`/
   `EMAIL_B`/`PASSWORD`/`ENTRY_ID`/`PLAYER_NAME`/`GK_NAME`, add it to both the flow's
   `${VAR}` reference and the `maestro test -e VAR=...` list in `e2e/run.sh` — Maestro fails
   fast on an unresolved `${VAR}`, so a mismatch surfaces immediately.

## Re-capturing fixtures

The dataset under `e2e/fixtures/raw/` is a one-time capture from the live FPL API,
committed and replayed forever after via `transform.mjs`. To recapture against a different
entry or gameweek:

```bash
node e2e/capture.mjs --entry <id> --gw <t>
```

`<id>` should be a real public FPL entry active for the whole season; `<t>` a mid-season
gameweek with no blanks/doubles (so the "no double/blank gameweek scheduled yet" chip copy
stays the expected assertion — see this project's `CLAUDE.md` "Decision layer" section on
chip-advice heuristics if you change this).

**Season-rollover warning:** capture is only possible while the FPL API still serves the
season you're capturing. Once a new season rolls over, `/api/fixtures/` and the per-GW
endpoints become current-season-only and last season's data is no longer fetchable from the
live API — this is the same failure mode that made the xPts model's historical backfill a
race against the calendar. If you need to recapture after a rollover, you're capturing the
*new* season's data, not re-fetching the old one.

## Refreshing the app artifact

`e2e/run.sh` caches the downloaded `.app` under `e2e/.artifacts/app/` and reuses it
indefinitely — it only goes stale when a **native** dependency changes (JS always comes
fresh from Metro on every run, so ordinary app-code changes need no new artifact). After any
change that touches native modules (a new native package, an Expo SDK bump, a config-plugin
change), rebuild and clear the cache:

```bash
eas build --profile development-simulator --platform ios
rm -rf e2e/.artifacts/app
```

The next `./e2e/run.sh` will notice the empty cache and download the newest finished
`development-simulator` build automatically.

## Troubleshooting

- **The dev client shows its launcher screen instead of the app.** This means it never
  auto-attached to Metro. Check `e2e/.artifacts/metro.log` for a bundler crash first; if
  Metro looks healthy, check that the `DEV_CLIENT_URL` deep link the runner injects
  (`fplgafferreactnativeapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>`,
  built in `e2e/run.sh` from the run's Metro port) reaches the flows — every flow issues
  `openLink: ${DEV_CLIENT_URL}` itself after `launchApp: {clearState: true}`, because wiping
  state also wipes the dev client's pinned Metro URL, so the re-attach has to live inside
  the flow, not just in the runner's simulator-warm-up step.
- **`FATAL: port 8081 is already in use by …` — another project's dev server is running.**
  Don't kill it; run the suite beside it: `E2E_METRO_PORT=8082 ./e2e/run.sh`. The preflight
  exists because the silent version of this failure is nasty: a taken port makes
  non-interactive `expo start` *skip* launching Metro ("Use port X instead?" needs input),
  while the runner's health check passes against the *foreign* Metro — the observed result
  was the dev client loading the other project's bundle and RedBoxing mid-suite. For the
  same reason the runner's cleanup only kills its own process tree, never
  "whatever holds the port" (that once took out an unrelated project's dev server).
- **A RedBox citing a file from a different repo.** Same root cause as above — the dev
  client is attached to a foreign Metro. Check who owns the port (`lsof -i tcp:8081`), then
  re-run with `E2E_METRO_PORT` set to a free port.
- **A request to the app fails with an ATS/cleartext error.** Dev-client debug builds ship
  with dev-friendly App Transport Security, and the app already talks to local Supabase over
  plain `http` in normal dev use, so this is not expected to occur — but if it does, add
  `NSAllowsLocalNetworking` under `ios.infoPlist` in `app.config.ts` (see the design spec's
  §12) and cut one new `development-simulator` build.
- **All three flows fail waiting for "Maybe later".** The sign-in subflow assumes the
  simulator's notification permission is `undetermined` (a fresh sim's default), which makes
  the push soft-ask sheet appear after every `clearState` sign-in. Tapping "Maybe later"
  never *decides* the permission, so the suite is self-sustaining — but if you manually
  granted/denied notifications on that simulator, the sheet stops appearing and the wait
  times out. Reset with `xcrun simctl privacy "iPhone 16 Pro" reset notifications
  com.fantasygaffer.app` (or erase the sim).
- **jest hangs after running this suite, or vice versa.** They don't interact — Maestro
  drives a compiled simulator app over its own protocol and never touches jest, watchman, or
  the haste map. If jest hangs, that's the pre-existing `npm start`-leaves-watchman-recrawling
  gotcha documented in this project's `CLAUDE.md`, unrelated to E2E.
- **A `text:`/`assertVisible:` on a name that's clearly on screen "fails to be visible".**
  Maestro text selectors are **full-string** regexes — they must match the element's *entire*
  accessibility label, not a substring. Anything wrapped in a `Pressable`/touchable groups its
  children into one label: a pitch card reads `"1, Elanga"`, a Top Picks row groups its stats
  with the name, and a legal paragraph is one long sentence. So assert `".*Elanga.*"`, never
  `"Elanga"`. Bare text only works when the element's label is exactly that string (e.g. a
  `SettingsRow`, which sets an explicit `accessibilityLabel`). When in doubt, dump what Maestro
  actually sees with `maestro hierarchy` (the app must be foregrounded on the screen) and grep
  for the name's `accessibilityText`.
- **A first-run modal (the push-notification soft-ask) blocks the first assertion.** Every flow
  `clearState`s, which wipes `pushStore.primingShown`, so the `PushPrimingSheet` re-appears on
  each run once you land on the home layout. It's a native RN `Modal`, so it renders in its own
  window and **occludes the entire hierarchy beneath it** — even an element that's visually
  behind it reads as not-visible. The shared `subflows/signin.yaml` dismisses it (`tapOn
  "Maybe later"`) right after sign-in; any new modal that can auto-appear needs the same
  treatment before the flow asserts on what's underneath.
- **Maestro runs the three top-level flows, not the subflow.** `maestro test e2e/flows`
  (directory mode, used by the default `./e2e/run.sh`) is **non-recursive** — it discovers
  `*.yaml` in that directory but not in `subflows/`. That's why `subflows/signin.yaml` (which
  references `${EMAIL}`, supplied only via `runFlow: env:`) is never executed standalone. Keep
  shared `runFlow` fragments under `subflows/` and they stay out of the suite automatically; no
  workspace `config.yaml` is needed.
- **The team carousel's upcoming-GW page (and its chip/captain advice) 404s / stays a skeleton.**
  Each carousel page fetches `/entry/{id}/event/{gw}/picks/` for *its* gameweek, including the
  upcoming one (`liveGw+1`). The capture only holds the live + prior GW, so `transform.mjs`
  **synthesizes `picks-gw{t+1}`** from the live GW's picks (faithful to FPL: a future GW's squad
  carries over until transfers). If you re-capture a different GW `t`, this stays automatic. A
  404 for a *past* off-screen GW (`picks-gw28` etc., pre-rendered by FlatList windowing) is
  harmless — those pages are never asserted on.
