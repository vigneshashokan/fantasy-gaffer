# Maestro E2E Suite (#48) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hermetic local E2E suite — 3 Maestro flows driving the dev-client app on the iOS simulator against local Supabase + a local FPL fixture server — runnable end-to-end via `./e2e/run.sh`.

**Architecture:** One app-code seam (env-overridable FPL base URL via `Constants.expoConfig.extra`, mirroring the supabase pattern) + `testID` anchors; everything else lives under `e2e/`: committed gzipped raw FPL captures, a run-time transform that pins a synthetic "live GW", a zero-dep fixture server, an idempotent seeder for the local stack, Maestro YAML flows, and a bash runner. Spec: `docs/superpowers/specs/2026-07-07-maestro-e2e-design.md`.

**Tech Stack:** Maestro (YAML flows), Node ≥ 20 ESM scripts (`node:*` modules only, zero npm deps), `node --test`, bash, supabase CLI local stack, jest/tsc for the app-code seam.

## Global Constraints

- **No new npm dependencies.** `e2e/*.mjs` use only `node:*` built-ins; tests run via `node --test`.
- **Production behavior unchanged:** with `EXPO_PUBLIC_FPL_BASE_URL` unset, `fpl-client.ts` must resolve to `https://fantasy.premierleague.com/api` (unit-tested).
- **The suite never touches the outside world:** seeder refuses non-localhost URLs; flows/scripts must not reference `fantasy.premierleague.com` (capture script excepted); PostHog/Sentry env forced empty by the runner.
- **testID naming:** kebab-case; anchors for interaction, visible text for content assertions.
- **`e2e/**` is excluded from jest and tsc** (like `supabase/functions/`); `e2e/.artifacts/` is gitignored; raw captures are committed as `*.json.gz`.
- Test users: `e2e-a@fantasygaffer.test` / `e2e-b@fantasygaffer.test`, password `e2e-password-1` (local-stack-only, not secrets).
- Jest note (repo gotcha): if jest hangs locally, run `watchman shutdown-server` then `npx jest --watchman=false --runInBand --forceExit`. `npx tsc --noEmit` has ~20 pre-existing errors on main (3 test files + Plan-1 Deno files) — check for NEW errors only.

---

### Task 1: FPL base-URL seam + testID anchors (all app-code changes)

**Files:**
- Modify: `app.config.ts` (extra block, after `sentryDsn`)
- Modify: `src/api/fpl-client.ts:7`
- Modify: `src/components/forms/Field.tsx` (add `testID` prop)
- Modify: `src/components/ui/PillBtn.tsx` (add `testID` prop)
- Modify: `src/app/(onboarding)/index.tsx:76` (sign-in link anchor)
- Modify: `src/app/(onboarding)/signin.tsx` (Field/PillBtn testIDs)
- Modify: `src/app/(onboarding)/connect-team.tsx` (submit/confirm anchors)
- Modify: `src/app/(home)/(tabs)/_layout.tsx` (tab bar + account anchors)
- Modify: `src/components/nav/AccountMenu.tsx` (settings/sign-out rows)
- Modify: `src/components/team/LinkTeamCta.tsx:26` (connect CTA)
- Modify: `src/app/(home)/(tabs)/top-picks.tsx` (root container)
- Modify: `src/app/(home)/(tabs)/transfer.tsx` (suggestions container)
- Modify: `src/components/team/GameweekScreen.tsx` (chips section — the chips UI lives
  on the Team tab since PR #61, not the Transfer tab)
- Test: `src/__tests__/api/fpl-client.test.ts` (extend)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `extra.fplBaseUrl` config key; `testID`s used verbatim by Task 4 flows: `onboarding-signin-link`, `signin-email`, `signin-password`, `signin-submit`, `tab-top-picks`, `tab-team`, `tab-transfer`, `tab-account`, `account-menu-settings`, `account-menu-signout`, `connect-team-cta`, `connect-team-submit`, `connect-team-confirm`, `top-picks-list`, `transfer-suggestions`, `chip-tips` (plus existing `team-id-input`, `gw-carousel`).

- [ ] **Step 1: Write the failing seam test.** Append to `src/__tests__/api/fpl-client.test.ts` (read the file first; it will already mock `fetch` — follow its local style):

```ts
describe('FPL_BASE resolution (E2E seam)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-constants');
  });

  it('uses the production base URL when extra.fplBaseUrl is unset', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
    let base = '';
    jest.isolateModules(() => {
      base = require('@/api/fpl-client').FPL_BASE;
    });
    expect(base).toBe('https://fantasy.premierleague.com/api');
  });

  it('uses extra.fplBaseUrl when set', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { fplBaseUrl: 'http://127.0.0.1:4004' } } },
    }));
    let base = '';
    jest.isolateModules(() => {
      base = require('@/api/fpl-client').FPL_BASE;
    });
    expect(base).toBe('http://127.0.0.1:4004');
  });
});
```

- [ ] **Step 2: Run it — must fail** (`FPL_BASE` is not exported yet):

Run: `npx jest src/__tests__/api/fpl-client.test.ts --watchman=false --runInBand --forceExit`
Expected: FAIL (`FPL_BASE` undefined / not exported).

- [ ] **Step 3: Implement the seam.** In `src/api/fpl-client.ts`, replace line 7:

```ts
const FPL_BASE = 'https://fantasy.premierleague.com/api';
```

with:

```ts
import Constants from 'expo-constants';

// E2E/proxy seam: overridable via EXPO_PUBLIC_FPL_BASE_URL (forwarded through
// app.config.ts extra — app code cannot read EXPO_PUBLIC_* directly).
export const FPL_BASE: string =
  Constants.expoConfig?.extra?.fplBaseUrl ?? 'https://fantasy.premierleague.com/api';
```

(The `import` goes at the top of the file with the other imports; keep the existing header comment.) In `app.config.ts`, add to `extra` after `sentryDsn`:

```ts
    fplBaseUrl: process.env.EXPO_PUBLIC_FPL_BASE_URL,
```

- [ ] **Step 4: Run the test again — must pass**, then the full suite + tsc:

Run: `npx jest src/__tests__/api/fpl-client.test.ts --watchman=false --runInBand --forceExit` → PASS
Run: `npx jest --watchman=false --runInBand --forceExit` → all suites pass
Run: `npx tsc --noEmit` → no NEW errors vs main

- [ ] **Step 5: Add `testID` support to the two shared components.**

`src/components/forms/Field.tsx` — add to `FieldProps` and destructuring:

```ts
  testID?: string;
```

and forward it on the `<TextInput>`:

```tsx
      <TextInput
        testID={testID}
```

`src/components/ui/PillBtn.tsx` — add `testID?: string;` to `PillBtnProps`, destructure it, and forward on the `<Pressable>`:

```tsx
    <Pressable
      testID={testID}
      onPress={onPress}
```

- [ ] **Step 6: Place the anchors.** Exact placements (all are prop additions, no behavior change):

1. `src/app/(onboarding)/index.tsx:76` — the `<Pressable onPress={goSignIn} …>`: add `testID="onboarding-signin-link"`.
2. `src/app/(onboarding)/signin.tsx` — email `<Field icon="mail" …>`: `testID="signin-email"`; password `<Field icon="lock" …>`: `testID="signin-password"`; the submit `<PillBtn onPress={onSubmit} …>`: `testID="signin-submit"`.
3. `src/app/(home)/(tabs)/_layout.tsx` — in the custom tab bar, on the per-tab `<Pressable key={tab.name} …>`: add `` testID={`tab-${tab.name}`} ``; on the Account `<Pressable accessibilityLabel="Account" …>`: `testID="tab-account"`.
4. `src/components/nav/AccountMenu.tsx` — the Settings row `<Pressable onPress={onSettings} …>` (line ~110): `testID="account-menu-settings"`; the sign-out row `<Pressable>` (line ~118, red "Sign out"): `testID="account-menu-signout"`.
5. `src/components/team/LinkTeamCta.tsx:26` — the `<Pressable onPress={() => router.push('/(onboarding)/connect-team')}>`: `testID="connect-team-cta"`.
6. `src/app/(onboarding)/connect-team.tsx` — the button that submits the entered team ID (the one guarded by `disabled={validating}`, around line 157): `testID="connect-team-submit"`; the confirming-stage button (`onPress={onContinue}`, around line 178): `testID="connect-team-confirm"`. Read the file to place these on the actual pressable elements (they may be `PillBtn`s — which now accept `testID`).
7. `src/app/(home)/(tabs)/top-picks.tsx` — the screen's root `<View>` (the outermost element returned by `TopPicksTab`): `testID="top-picks-list"`.
8. `src/app/(home)/(tabs)/transfer.tsx` — the `<View style={styles.suggestionsWrap}>` (line ~134): `testID="transfer-suggestions"`.
9. `src/components/team/GameweekScreen.tsx` — the container element wrapping the chips section (ChipsRow / "Play a Chip" area): `testID="chip-tips"`.

- [ ] **Step 7: Verify no regressions:**

Run: `npx jest --watchman=false --runInBand --forceExit` → PASS (testID additions are invisible to existing tests)
Run: `npx tsc --noEmit` → no NEW errors
Run: `npm run lint` → clean (do not commit any auto-generated `eslint.config.js`)

- [ ] **Step 8: Commit**

```bash
git add app.config.ts src/api/fpl-client.ts src/components/forms/Field.tsx src/components/ui/PillBtn.tsx "src/app/(onboarding)/index.tsx" "src/app/(onboarding)/signin.tsx" "src/app/(onboarding)/connect-team.tsx" "src/app/(home)/(tabs)/_layout.tsx" src/components/nav/AccountMenu.tsx src/components/team/LinkTeamCta.tsx "src/app/(home)/(tabs)/top-picks.tsx" "src/app/(home)/(tabs)/transfer.tsx" src/__tests__/api/fpl-client.test.ts
git commit -m "feat(e2e): FPL base-URL seam + testID anchors (#48)"
```

---

### Task 2: Fixture capture + transform (+ repo excludes)

**Files:**
- Create: `e2e/capture.mjs`, `e2e/transform.mjs`, `e2e/transform.test.mjs`
- Create: `e2e/fixtures/raw/*.json.gz` (by running capture — **requires network to the live FPL API; do this now, the data becomes uncapturable at season rollover**)
- Modify: `tsconfig.json` (exclude), `package.json` (jest `testPathIgnorePatterns`), `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `e2e/fixtures/raw/{bootstrap-static,fixtures,entry,entry-history,picks-gw<t-1>,picks-gw<t>,live-gw<t-1>,live-gw<t>,element-summary-<id>×15,meta}.json.gz`; `meta` = `{ entry, gw, templateElement, capturedAt }`. `transform.mjs` exports `transformBootstrap(bootstrap, t, nowMs)`, `transformFixtures(fixtures, transformedBootstrap, t)`, `run(rawDir?, outDir?, nowMs?) -> Promise<{t, entry}>`; CLI emits plain JSON into `e2e/.artifacts/fixtures/`.

- [ ] **Step 1: Repo excludes.** `tsconfig.json` → `"exclude": ["node_modules", "supabase/functions/**", "e2e/**"]`. `package.json` jest → `"testPathIgnorePatterns": ["/node_modules/", "/supabase/functions/", "/e2e/"]`. Append to `.gitignore`:

```
# E2E generated artifacts (transformed fixtures, cached app, logs)
e2e/.artifacts/
```

- [ ] **Step 2: Write `e2e/capture.mjs`:**

```js
// e2e/capture.mjs — one-time capture of raw FPL API responses for the E2E
// fixture dataset. Must run BEFORE the season rollover (after it, the old
// season's picks/live data are unrecoverable — docs/fpl-api.md).
// Usage: node e2e/capture.mjs [--entry <id>] [--gw <t>]
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const ENTRY = Number(args.get('--entry') ?? 1);
const GW = Number(args.get('--gw') ?? 30);
const OUT = 'e2e/fixtures/raw';
const BASE = 'https://fantasy.premierleague.com/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`FPL ${res.status} for ${path}`);
  return res.json();
}
async function save(name, data) {
  await writeFile(`${OUT}/${name}.json.gz`, gzipSync(JSON.stringify(data)));
  console.log(`[capture] ${name}`);
}

await mkdir(OUT, { recursive: true });

const bootstrap = await get('/bootstrap-static/');
const finished = bootstrap.events.filter((e) => e.finished).length;
if (finished < GW + 1) throw new Error(`need GW ${GW}+1 finished; bootstrap has ${finished}. Pass --gw <= ${finished - 1}`);
await save('bootstrap-static', bootstrap);
await save('fixtures', await get('/fixtures/'));
await save('entry', await get(`/entry/${ENTRY}/`));
await save('entry-history', await get(`/entry/${ENTRY}/history/`));

let picksAtT = null;
for (const gw of [GW - 1, GW]) {
  const picks = await get(`/entry/${ENTRY}/event/${gw}/picks/`);
  if (!picks.picks?.length) throw new Error(`entry ${ENTRY} has no picks at GW ${gw} — pass --entry <an entry active all season>`);
  await save(`picks-gw${gw}`, picks);
  await save(`live-gw${gw}`, await get(`/event/${gw}/live/`));
  if (gw === GW) picksAtT = picks;
}
for (const p of picksAtT.picks) {
  await save(`element-summary-${p.element}`, await get(`/element-summary/${p.element}/`));
}
await save('meta', {
  entry: ENTRY,
  gw: GW,
  templateElement: picksAtT.picks[0].element,
  capturedAt: new Date().toISOString(),
});
console.log(`[capture] done: entry ${ENTRY}, GW ${GW}`);
```

- [ ] **Step 3: Run the capture.** Pick a mid-season GW with no blanks/doubles (GW30 default; if the chosen entry errors, try another public entry id — verify the entry played all season):

Run: `node e2e/capture.mjs --entry 1 --gw 30`
Expected: `[capture] …` lines for ~24 files, ending `[capture] done: entry 1, GW 30`. If entry 1 fails validation, retry with another id and record which one was used. Sanity: `ls e2e/fixtures/raw | wc -l` ≈ 24; total size `du -sh e2e/fixtures/raw` ≈ 1–3 MB.

- [ ] **Step 4: Write `e2e/transform.mjs`:**

```js
// e2e/transform.mjs — derive the run-time E2E dataset from the raw captures.
// Pins GW t (from meta) as the live gameweek: t's deadline is 3 days in the
// past (its matches played, awaiting data-check), t+1's is 4 days ahead.
// Dates are run-relative, which is why output is generated per-run
// (e2e/.artifacts/fixtures/, gitignored) instead of committed.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export function transformBootstrap(bootstrap, t, nowMs) {
  const events = bootstrap.events.map((e) => {
    const deadline = new Date(nowMs + (e.id - t) * WEEK - 3 * DAY);
    return {
      ...e,
      deadline_time: deadline.toISOString(),
      deadline_time_epoch: Math.floor(deadline.getTime() / 1000),
      finished: e.id < t,
      data_checked: e.id < t,
      is_previous: e.id === t - 1,
      is_current: e.id === t,
      is_next: e.id === t + 1,
    };
  });
  return { ...bootstrap, events };
}

export function transformFixtures(fixtures, transformedBootstrap, t) {
  const deadlineByEvent = new Map(
    transformedBootstrap.events.map((e) => [e.id, Date.parse(e.deadline_time)]),
  );
  return fixtures.map((f) => {
    if (f.event == null) return f;
    const played = f.event <= t;
    return {
      ...f,
      kickoff_time: new Date(deadlineByEvent.get(f.event) + DAY).toISOString(),
      started: played,
      finished: played,
      finished_provisional: played,
      team_h_score: played ? f.team_h_score : null,
      team_a_score: played ? f.team_a_score : null,
    };
  });
}

async function loadRaw(dir, name) {
  return JSON.parse(gunzipSync(await readFile(`${dir}/${name}.json.gz`)).toString('utf8'));
}

export async function run(
  rawDir = 'e2e/fixtures/raw',
  outDir = 'e2e/.artifacts/fixtures',
  nowMs = Date.now(),
) {
  const meta = await loadRaw(rawDir, 'meta');
  const t = meta.gw;
  const bootstrap = transformBootstrap(await loadRaw(rawDir, 'bootstrap-static'), t, nowMs);
  const fixtures = transformFixtures(await loadRaw(rawDir, 'fixtures'), bootstrap, t);
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/bootstrap-static.json`, JSON.stringify(bootstrap));
  await writeFile(`${outDir}/fixtures.json`, JSON.stringify(fixtures));
  for (const f of await readdir(rawDir)) {
    if (!f.endsWith('.json.gz')) continue;
    const name = f.replace(/\.json\.gz$/, '');
    if (name === 'bootstrap-static' || name === 'fixtures') continue;
    await writeFile(`${outDir}/${name}.json`, JSON.stringify(await loadRaw(rawDir, name)));
  }
  return { t, entry: meta.entry };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { t, entry } = await run();
  console.log(`[transform] dataset ready: entry ${entry}, live GW ${t}`);
}
```

- [ ] **Step 5: Write `e2e/transform.test.mjs`:**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { transformBootstrap, transformFixtures } from './transform.mjs';

const NOW = Date.parse('2026-07-07T12:00:00Z');
const T = 30;
const rawEvents = () =>
  Array.from({ length: 38 }, (_, i) => ({
    id: i + 1,
    name: `Gameweek ${i + 1}`,
    deadline_time: '2025-08-16T10:00:00Z',
    deadline_time_epoch: 0,
    finished: true,
    data_checked: true,
    is_previous: false,
    is_current: false,
    is_next: false,
  }));
const rawBootstrap = (elements = []) => ({ events: rawEvents(), elements, teams: [] });

test('event flags pivot around t', () => {
  const b = transformBootstrap(rawBootstrap(), T, NOW);
  const byId = new Map(b.events.map((e) => [e.id, e]));
  assert.equal(byId.get(T - 1).finished, true);
  assert.equal(byId.get(T - 1).is_previous, true);
  assert.equal(byId.get(T).is_current, true);
  assert.equal(byId.get(T).finished, false);
  assert.equal(byId.get(T).data_checked, false);
  assert.equal(byId.get(T + 1).is_next, true);
  assert.equal(byId.get(T + 1).finished, false);
  assert.equal(b.events.filter((e) => e.is_current).length, 1);
});

test('deadlines strictly increasing; t past, t+1 future', () => {
  const b = transformBootstrap(rawBootstrap(), T, NOW);
  const ds = b.events.map((e) => Date.parse(e.deadline_time));
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i] > ds[i - 1]);
  assert.ok(ds[T - 1] < NOW, 'GW t deadline must be in the past');
  assert.ok(ds[T] > NOW, 'GW t+1 deadline must be in the future');
});

test('player data untouched', () => {
  const elements = [{ id: 1, web_name: 'Haaland', now_cost: 151 }];
  const b = transformBootstrap(rawBootstrap(elements), T, NOW);
  assert.deepEqual(b.elements, elements);
});

test('deterministic for fixed now', () => {
  assert.deepEqual(
    transformBootstrap(rawBootstrap(), T, NOW),
    transformBootstrap(rawBootstrap(), T, NOW),
  );
});

test('fixtures: past keep scores, future lose them; kickoff after deadline', () => {
  const b = transformBootstrap(rawBootstrap(), T, NOW);
  const fx = transformFixtures(
    [
      { id: 1, event: T, kickoff_time: 'x', started: true, finished: true, finished_provisional: true, team_h_score: 2, team_a_score: 1 },
      { id: 2, event: T + 1, kickoff_time: 'x', started: true, finished: true, finished_provisional: true, team_h_score: 3, team_a_score: 0 },
      { id: 3, event: null, kickoff_time: null, started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null },
    ],
    b,
    T,
  );
  assert.equal(fx[0].finished, true);
  assert.equal(fx[0].team_h_score, 2);
  assert.equal(fx[1].finished, false);
  assert.equal(fx[1].team_h_score, null);
  const d31 = Date.parse(b.events.find((e) => e.id === T + 1).deadline_time);
  assert.ok(Date.parse(fx[1].kickoff_time) > d31);
  assert.deepEqual(fx[2], { id: 3, event: null, kickoff_time: null, started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null });
});
```

- [ ] **Step 6: Run the tests + the CLI:**

Run: `node --test e2e/transform.test.mjs` → all pass
Run: `node e2e/transform.mjs` → `[transform] dataset ready: entry <E>, live GW 30`; `ls e2e/.artifacts/fixtures/ | wc -l` ≈ 24
Run: `npx jest --watchman=false --runInBand --forceExit` and `npx tsc --noEmit` → unaffected (excludes work; no NEW errors)

- [ ] **Step 7: Commit**

```bash
git add e2e/capture.mjs e2e/transform.mjs e2e/transform.test.mjs e2e/fixtures/raw .gitignore tsconfig.json package.json
git commit -m "feat(e2e): FPL fixture capture + run-time transform (#48)"
```

---

### Task 3: Fixture server + local-stack seeder

**Files:**
- Create: `e2e/fixture-server.mjs`, `e2e/fixture-server.test.mjs`, `e2e/seed.mjs`

**Interfaces:**
- Consumes: `e2e/.artifacts/fixtures/*.json` (Task 2 `run()`), `meta.json` shape `{entry, gw, templateElement}`.
- Produces: `lookup(urlPath) -> string|null` (exported for tests); server listens on `E2E_FPL_PORT` (default 4004) when run as main. `seed.mjs` reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env; creates users `e2e-a@fantasygaffer.test` (profile + `fpl_team_id = meta.entry`) and `e2e-b@fantasygaffer.test` (profile, no team), upserts `clubs`/`players`/`fixtures`, replaces `model_version='e2e-fixture'` projections for the GW-t squad at GWs t..t+3.

- [ ] **Step 1: Write `e2e/fixture-server.mjs`:**

```js
// e2e/fixture-server.mjs — static local FPL API over the transformed dataset.
// Unknown routes 404 loudly: a 404 in the run log means the app called a route
// the dataset doesn't model — extend the dataset, don't loosen the server.
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIR = process.env.E2E_FIXTURES_DIR ?? 'e2e/.artifacts/fixtures';
const PORT = Number(process.env.E2E_FPL_PORT ?? 4004);

const files = new Map();
for (const f of readdirSync(DIR)) {
  if (f.endsWith('.json')) files.set(f.replace(/\.json$/, ''), readFileSync(`${DIR}/${f}`, 'utf8'));
}
const meta = JSON.parse(files.get('meta'));

export function lookup(url) {
  const p = url.replace(/\?.*$/, '').replace(/\/+$/, '');
  let m;
  if (p === '/bootstrap-static') return files.get('bootstrap-static');
  if (p === '/fixtures') return files.get('fixtures');
  if ((m = p.match(/^\/entry\/(\d+)$/)))
    return Number(m[1]) === meta.entry ? files.get('entry') : null;
  if ((m = p.match(/^\/entry\/(\d+)\/history$/)))
    return Number(m[1]) === meta.entry ? files.get('entry-history') : null;
  if ((m = p.match(/^\/entry\/(\d+)\/event\/(\d+)\/picks$/)))
    return Number(m[1]) === meta.entry ? (files.get(`picks-gw${m[2]}`) ?? null) : null;
  if ((m = p.match(/^\/event\/(\d+)\/live$/)))
    return files.get(`live-gw${m[1]}`) ?? JSON.stringify({ elements: [] });
  if ((m = p.match(/^\/element-summary\/(\d+)$/)))
    return files.get(`element-summary-${m[1]}`) ?? files.get(`element-summary-${meta.templateElement}`);
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer((req, res) => {
    const body = lookup(req.url ?? '');
    if (body == null) {
      console.error(`[fixture-server] 404 ${req.url}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"route not modelled - extend e2e fixtures"}');
      return;
    }
    console.log(`[fixture-server] 200 ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  }).listen(PORT, '127.0.0.1', () =>
    console.log(`[fixture-server] listening on 127.0.0.1:${PORT} (dataset: ${DIR})`),
  );
}
```

- [ ] **Step 2: Write `e2e/fixture-server.test.mjs`** (regenerates the dataset first so it runs standalone):

```js
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let lookup, meta;
before(async () => {
  execFileSync('node', ['e2e/transform.mjs'], { stdio: 'inherit' });
  ({ lookup } = await import('./fixture-server.mjs'));
  meta = JSON.parse(readFileSync('e2e/.artifacts/fixtures/meta.json', 'utf8'));
});

test('bootstrap served with a pinned current GW', () => {
  const boot = JSON.parse(lookup('/bootstrap-static/'));
  assert.equal(boot.events.filter((e) => e.is_current).length, 1);
  assert.equal(boot.events.find((e) => e.is_current).id, meta.gw);
});

test('entry routes only answer for the captured entry', () => {
  assert.ok(lookup(`/entry/${meta.entry}/`));
  assert.equal(lookup(`/entry/${meta.entry + 1}/`), null);
  assert.ok(lookup(`/entry/${meta.entry}/event/${meta.gw}/picks/`));
  assert.equal(lookup(`/entry/${meta.entry}/event/1/picks/`), null);
});

test('live falls back to empty elements; element-summary falls back to template', () => {
  assert.deepEqual(JSON.parse(lookup('/event/2/live/')), { elements: [] });
  assert.ok(lookup(`/event/${meta.gw}/live/`).length > 100);
  assert.ok(lookup('/element-summary/999999/'));
});

test('unknown routes are null (404)', () => {
  assert.equal(lookup('/my-team/1/'), null);
  assert.equal(lookup('/'), null);
});
```

- [ ] **Step 3: Run it:**

Run: `node --test e2e/fixture-server.test.mjs` → all pass. Then smoke the server: `node e2e/fixture-server.mjs & sleep 1 && curl -s http://127.0.0.1:4004/bootstrap-static/ | head -c 80; kill %1` → JSON prefix printed.

- [ ] **Step 4: Write `e2e/seed.mjs`:**

```js
// e2e/seed.mjs — idempotent seeding of the LOCAL Supabase stack for E2E.
// Hard-refuses non-localhost targets. Run via e2e/run.sh (which exports
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from `supabase status`).
import { readFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — run via e2e/run.sh');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(URL_))
  throw new Error(`[seed] REFUSING non-local Supabase URL: ${URL_}`);

const DIR = process.env.E2E_FIXTURES_DIR ?? 'e2e/.artifacts/fixtures';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8'));
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { ...HEADERS, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`[seed] ${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const meta = load('meta');
const bootstrap = load('bootstrap-static');
const POS = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

const clubs = bootstrap.teams.map((t) => ({
  id: t.id, name: t.name, short_name: t.short_name, code: t.code,
  strength_overall_home: t.strength_overall_home, strength_overall_away: t.strength_overall_away,
  strength_attack_home: t.strength_attack_home, strength_attack_away: t.strength_attack_away,
  strength_defence_home: t.strength_defence_home, strength_defence_away: t.strength_defence_away,
}));

// element_type 5 = assistant managers — the players table CHECK only allows GKP/DEF/MID/FWD.
const players = bootstrap.elements
  .filter((e) => e.element_type >= 1 && e.element_type <= 4)
  .map((e) => ({
    id: e.id, web_name: e.web_name, full_name: `${e.first_name} ${e.second_name}`,
    team_id: e.team, position: POS[e.element_type], now_cost: e.now_cost,
    form: num(e.form), total_points: e.total_points, status: e.status,
    news: e.news ?? '', news_added: e.news_added,
    chance_of_playing_next_round: e.chance_of_playing_next_round,
    ep_next: num(e.ep_next), ep_this: num(e.ep_this),
    selected_by_percent: num(e.selected_by_percent), ict_index: num(e.ict_index),
    bps: e.bps, transfers_in_event: e.transfers_in_event,
  }));

const fixtures = load('fixtures')
  .filter((f) => f.event != null)
  .map((f) => ({
    id: f.id, event: f.event, kickoff_time: f.kickoff_time,
    team_h: f.team_h, team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty, team_a_difficulty: f.team_a_difficulty,
    team_h_score: f.team_h_score, team_a_score: f.team_a_score,
    started: f.started, finished: f.finished, finished_provisional: f.finished_provisional,
  }));

// Projections: squad players dominate every position so Top Picks and the
// captain pick are deterministic. Values are position-based + pick-order jitter.
const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
const BASE_P50 = { 1: 7.0, 2: 7.5, 3: 9.0, 4: 9.5 };
const picks = load(`picks-gw${meta.gw}`).picks;
const projections = [];
picks.forEach((p, i) => {
  const el = byId.get(p.element);
  if (!el || el.element_type > 4) return;
  const p50 = BASE_P50[el.element_type] + (15 - i) * 0.05;
  for (const gw of [meta.gw, meta.gw + 1, meta.gw + 2, meta.gw + 3]) {
    projections.push({
      player_id: p.element, gw,
      p25: Number((p50 - 1.5).toFixed(1)),
      p50: Number(p50.toFixed(1)),
      p75: Number((p50 + 2.0).toFixed(1)),
      model_version: 'e2e-fixture',
    });
  }
});

const USERS = [
  { email: 'e2e-a@fantasygaffer.test', last: 'UserA', team: meta.entry },
  { email: 'e2e-b@fantasygaffer.test', last: 'UserB', team: null },
];

async function resetUser({ email, last, team }) {
  const list = await rest('GET', '/auth/v1/admin/users?page=1&per_page=1000');
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) await rest('DELETE', `/auth/v1/admin/users/${existing.id}`); // cascades profiles etc.
  const created = await rest('POST', '/auth/v1/admin/users', {
    email, password: 'e2e-password-1', email_confirm: true,
  });
  await rest('POST', '/rest/v1/profiles', [{
    user_id: created.id, first_name: 'E2E', last_name: last, dob: '1990-01-01', fpl_team_id: team,
  }]);
  await rest('POST', '/rest/v1/notification_prefs', [{ user_id: created.id }]);
  return created.id;
}

await rest('POST', '/rest/v1/clubs?on_conflict=id', clubs, { Prefer: 'resolution=merge-duplicates' });
await rest('POST', '/rest/v1/players?on_conflict=id', players, { Prefer: 'resolution=merge-duplicates' });
await rest('POST', '/rest/v1/fixtures?on_conflict=id', fixtures, { Prefer: 'resolution=merge-duplicates' });
await rest('DELETE', '/rest/v1/projections?model_version=eq.e2e-fixture');
await rest('POST', '/rest/v1/projections?on_conflict=player_id,gw', projections, { Prefer: 'resolution=merge-duplicates' });
for (const u of USERS) await resetUser(u);
console.log(`[seed] ok: ${clubs.length} clubs, ${players.length} players, ${fixtures.length} fixtures, ${projections.length} projections, ${USERS.length} users`);
```

- [ ] **Step 5: Validate the seeder against the running local stack:**

Run: `supabase start` (if not already up), then:

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node e2e/seed.mjs
```

Expected: `[seed] ok: 20 clubs, ~700 players, 380 fixtures, 60 projections, 2 users`. Run it **twice** — the second run must succeed identically (idempotence). Safety check: `SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=x node e2e/seed.mjs` must exit with `REFUSING non-local`.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixture-server.mjs e2e/fixture-server.test.mjs e2e/seed.mjs
git commit -m "feat(e2e): local FPL fixture server + idempotent stack seeder (#48)"
```

---

### Task 4: Maestro flows + runner + runbook

**Files:**
- Create: `e2e/dataset-info.mjs`, `e2e/flows/subflows/signin.yaml`, `e2e/flows/signin-team.yaml`, `e2e/flows/connect-team.yaml`, `e2e/flows/tabs-signout.yaml`, `e2e/run.sh` (chmod +x), `docs/e2e.md`

**Interfaces:**
- Consumes: Task 1 testIDs (list in Task 1 Produces), Task 2 `transform.mjs` + dataset, Task 3 server/seeder.
- Produces: `./e2e/run.sh [flow-file]` — the suite entry point. Maestro env vars provided by the runner: `EMAIL_A`, `EMAIL_B`, `PASSWORD`, `ENTRY_ID`, `PLAYER_NAME` (a squad MID starter's `web_name`), `GK_NAME` (squad GK's `web_name`).

- [ ] **Step 1: Write `e2e/dataset-info.mjs`** (runner helper — extracts flow parameters from the transformed dataset):

```js
// e2e/dataset-info.mjs — print dataset facts for the runner (--sh emits exports).
import { readFileSync } from 'node:fs';

const DIR = process.env.E2E_FIXTURES_DIR ?? 'e2e/.artifacts/fixtures';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8'));

const meta = load('meta');
const bootstrap = load('bootstrap-static');
const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
const picks = load(`picks-gw${meta.gw}`).picks;

const starters = picks.filter((p) => p.position <= 11).map((p) => byId.get(p.element));
const mid = starters.find((e) => e?.element_type === 3) ?? starters[1];
const gk = starters.find((e) => e?.element_type === 1) ?? starters[0];

const info = {
  entry: meta.entry,
  gw: meta.gw,
  playerName: mid.web_name,
  gkName: gk.web_name,
};
if (process.argv.includes('--sh')) {
  console.log(`export E2E_ENTRY_ID=${info.entry}`);
  console.log(`export E2E_GW=${info.gw}`);
  console.log(`export E2E_PLAYER_NAME=${JSON.stringify(info.playerName)}`);
  console.log(`export E2E_GK_NAME=${JSON.stringify(info.gkName)}`);
} else {
  console.log(JSON.stringify(info, null, 2));
}
```

- [ ] **Step 2: Write the shared sign-in subflow `e2e/flows/subflows/signin.yaml`:**

```yaml
# Shared: cold-start the app (cleared state), attach to Metro, sign in.
# clearState wipes the dev client's pinned Metro URL too — the openLink
# re-attach below MUST come after launchApp (spec §8).
appId: com.fantasygaffer.app
---
- launchApp:
    clearState: true
- openLink: "fplgafferreactnativeapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
- extendedWaitUntil:
    visible:
      id: "onboarding-signin-link"
    timeout: 180000
- tapOn:
    id: "onboarding-signin-link"
- tapOn:
    id: "signin-email"
- inputText: ${EMAIL}
- tapOn:
    id: "signin-password"
- inputText: ${PASSWORD}
- hideKeyboard
- tapOn:
    id: "signin-submit"
```

- [ ] **Step 3: Write `e2e/flows/signin-team.yaml`:**

```yaml
# Flow 1 — sign-in → My Team renders squad + advice from the fixture dataset.
appId: com.fantasygaffer.app
---
- runFlow:
    file: subflows/signin.yaml
    env:
      EMAIL: ${EMAIL_A}
      PASSWORD: ${PASSWORD}
- extendedWaitUntil:
    visible:
      id: "gw-carousel"
    timeout: 90000
- assertVisible: ${PLAYER_NAME}
- assertVisible: ${GK_NAME}
# Chips section lives on the Team tab (GameweekScreen), below the pitch.
- scrollUntilVisible:
    element:
      id: "chip-tips"
    direction: DOWN
```

- [ ] **Step 4: Write `e2e/flows/connect-team.yaml`:**

```yaml
# Flow 2 — fresh account connects an FPL team and sees the populated squad.
appId: com.fantasygaffer.app
---
- runFlow:
    file: subflows/signin.yaml
    env:
      EMAIL: ${EMAIL_B}
      PASSWORD: ${PASSWORD}
- extendedWaitUntil:
    visible:
      id: "connect-team-cta"
    timeout: 90000
- tapOn:
    id: "connect-team-cta"
- tapOn:
    id: "team-id-input"
- inputText: ${ENTRY_ID}
- hideKeyboard
- tapOn:
    id: "connect-team-submit"
- extendedWaitUntil:
    visible:
      id: "connect-team-confirm"
    timeout: 60000
- tapOn:
    id: "connect-team-confirm"
- extendedWaitUntil:
    visible:
      id: "gw-carousel"
    timeout: 90000
- assertVisible: ${PLAYER_NAME}
```

- [ ] **Step 5: Write `e2e/flows/tabs-signout.yaml`:**

```yaml
# Flow 3 — tab sweep, legal doc, session persistence across relaunch, sign-out.
appId: com.fantasygaffer.app
---
- runFlow:
    file: subflows/signin.yaml
    env:
      EMAIL: ${EMAIL_A}
      PASSWORD: ${PASSWORD}
- extendedWaitUntil:
    visible:
      id: "gw-carousel"
    timeout: 90000
- tapOn:
    id: "tab-top-picks"
- extendedWaitUntil:
    visible:
      id: "top-picks-list"
    timeout: 60000
- assertVisible: ${GK_NAME}
- tapOn:
    id: "tab-transfer"
- extendedWaitUntil:
    visible:
      id: "transfer-suggestions"
    timeout: 60000
- tapOn:
    id: "tab-account"
- tapOn:
    id: "account-menu-settings"
# Settings is a ScrollView; the More card with Privacy Policy sits below the
# Appearance/Preferences cards and is off-screen on launch.
- scrollUntilVisible:
    element:
      text: "Privacy Policy"
    direction: DOWN
- tapOn: "Privacy Policy"
- extendedWaitUntil:
    visible: "Fantasy Gaffer"
    timeout: 30000
# Relaunch WITHOUT clearState: session + persisted cache must survive a cold
# start (regression net for the Map-persister crash class), then sign out.
- launchApp
- openLink: "fplgafferreactnativeapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
- extendedWaitUntil:
    visible:
      id: "gw-carousel"
    timeout: 120000
- tapOn:
    id: "tab-account"
- tapOn:
    id: "account-menu-signout"
- extendedWaitUntil:
    visible:
      id: "onboarding-signin-link"
    timeout: 60000
```

Note for the implementer: the two plain-text assertions ("Privacy Policy" row label, "Fantasy Gaffer" in the legal doc body) target real rendered copy from `src/app/(home)/settings.tsx` and `src/content/legal/privacyPolicy.ts`. If a text assertion proves ambiguous at runtime, Task 5 adjusts it — do not change app copy for the test's sake.

- [ ] **Step 6: Write `e2e/run.sh`:**

```bash
#!/usr/bin/env bash
# e2e/run.sh — one-command local E2E (spec §9).
# Usage: ./e2e/run.sh [e2e/flows/<one>.yaml]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SIM_NAME="${E2E_SIM_NAME:-iPhone 16 Pro}"
FPL_PORT="${E2E_FPL_PORT:-4004}"
ART="e2e/.artifacts"
APP_DIR="$ART/app"
FLOW="${1:-e2e/flows}"

say() { printf '\n[e2e] %s\n' "$*"; }
die() { printf '\n[e2e] FATAL: %s\n' "$*" >&2; exit 1; }

# ---------- preflight ----------
command -v docker >/dev/null || die "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker Desktop"
command -v maestro >/dev/null || die 'maestro not found — install: curl -Ls "https://get.maestro.mobile.dev" | bash'
command -v supabase >/dev/null || die "supabase CLI not found — brew install supabase/tap/supabase"
command -v node >/dev/null || die "node not found"
command -v jq >/dev/null || die "jq not found — brew install jq"
say "maestro version: $(maestro --version 2>&1 | head -1)"

# ---------- app artifact ----------
APP_PATH="${E2E_APP_PATH:-$(find "$APP_DIR" -maxdepth 3 -name '*.app' -print -quit 2>/dev/null || true)}"
if [ -z "$APP_PATH" ]; then
  say "no cached app — downloading latest development-simulator build from EAS"
  command -v eas >/dev/null || die "eas CLI needed once for the download — npm i -g eas-cli"
  URL=$(eas build:list --platform ios --profile development-simulator --status finished --limit 1 --json --non-interactive | jq -r '.[0].artifacts.buildUrl')
  [ -n "$URL" ] && [ "$URL" != "null" ] || die "no finished development-simulator build on EAS — run: eas build --profile development-simulator --platform ios"
  mkdir -p "$APP_DIR"
  curl -fsSL "$URL" -o "$ART/app.tar.gz"
  tar -xzf "$ART/app.tar.gz" -C "$APP_DIR"
  APP_PATH=$(find "$APP_DIR" -maxdepth 3 -name '*.app' -print -quit)
fi
[ -n "$APP_PATH" ] || die "could not resolve a .app artifact"
say "app artifact: $APP_PATH"

# ---------- dataset ----------
node --test e2e/transform.test.mjs >/dev/null || die "transform self-test failed"
node e2e/transform.mjs
eval "$(node e2e/dataset-info.mjs --sh)"
say "dataset: entry $E2E_ENTRY_ID, live GW $E2E_GW, players: $E2E_PLAYER_NAME / $E2E_GK_NAME"

# ---------- supabase + seed ----------
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${API_URL:-}" ] && [ -n "${ANON_KEY:-}" ] && [ -n "${SERVICE_ROLE_KEY:-}" ] \
  || die "could not parse 'supabase status -o env' (CLI format changed?) — inspect its output and adjust the grep above"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node e2e/seed.mjs

# ---------- fixture server + metro ----------
node e2e/fixture-server.mjs >"$ART/fixture-server.log" 2>&1 &
FIX_PID=$!
EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
EXPO_PUBLIC_FPL_BASE_URL="http://127.0.0.1:$FPL_PORT" \
EXPO_PUBLIC_POSTHOG_KEY="" \
EXPO_PUBLIC_SENTRY_DSN="" \
CI=1 npx expo start --port 8081 >"$ART/metro.log" 2>&1 &
METRO_PID=$!
cleanup() { kill "$FIX_PID" "$METRO_PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$FPL_PORT/bootstrap-static/" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "fixture server failed to start (see $ART/fixture-server.log)"
  sleep 1
done
for i in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:8081/status" >/dev/null 2>&1 && break
  [ "$i" = 90 ] && die "metro failed to start (see $ART/metro.log)"
  sleep 1
done
say "services up (fixture :$FPL_PORT, metro :8081)"

# ---------- simulator ----------
xcrun simctl bootstatus "$SIM_NAME" -b || die "could not boot simulator '$SIM_NAME' (E2E_SIM_NAME to override)"
open -a Simulator
xcrun simctl install "$SIM_NAME" "$APP_PATH"
say "pre-bundling JS (first compile can take 1-2 min)…"
curl -fsS "http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true&minify=false" -o /dev/null || true

# ---------- run ----------
say "running maestro: $FLOW"
maestro test \
  -e EMAIL_A="e2e-a@fantasygaffer.test" \
  -e EMAIL_B="e2e-b@fantasygaffer.test" \
  -e PASSWORD="e2e-password-1" \
  -e ENTRY_ID="$E2E_ENTRY_ID" \
  -e PLAYER_NAME="$E2E_PLAYER_NAME" \
  -e GK_NAME="$E2E_GK_NAME" \
  "$FLOW"
say "GREEN — all flows passed"
```

Then: `chmod +x e2e/run.sh`.

- [ ] **Step 7: Static validation** (full execution is Task 5):

Run: `bash -n e2e/run.sh` → no output (syntax OK)
Run: `node --check e2e/dataset-info.mjs` → OK
Run: `node e2e/dataset-info.mjs` → prints `{ entry, gw, playerName, gkName }` JSON from the Task 2 dataset
YAML validity is checked by `maestro test` itself in Task 5 (no npm YAML dep — Global Constraints); here, eyeball-verify indentation only.

- [ ] **Step 8: Write `docs/e2e.md`** — the runbook. Contents (write real prose, not an outline): **Prerequisites** (Docker Desktop, supabase CLI, Xcode + an iPhone 16-class simulator, `maestro` install one-liner with a note to record the version used, `eas-cli` + `eas login` only for the first artifact download, `jq`); **Run it** (`./e2e/run.sh`, single flow variant `./e2e/run.sh e2e/flows/signin-team.yaml`, what green/red output looks like, where logs land — `e2e/.artifacts/*.log`, `~/.maestro/tests/` for Maestro's own screenshots/logs); **How it stays hermetic** (fixture server + local stack + disabled PostHog/Sentry, one paragraph, link to the spec); **Test accounts** (the two users, seeded fresh every run); **Adding a flow** (anchor policy: testID for interaction, text for content; add anchors in app code + YAML in `e2e/flows/`; run the single flow while iterating); **Re-capturing fixtures** (`node e2e/capture.mjs --entry <id> --gw <t>`; season-rollover warning: capture only possible for the live season); **Refreshing the app artifact** (after native-dep changes: `eas build --profile development-simulator --platform ios`, then `rm -rf e2e/.artifacts/app`); **Troubleshooting** (dev client shows launcher → check Metro log + the openLink URL; ATS/cleartext failure → the `NSAllowsLocalNetworking` fallback from spec §12; jest/watchman gotcha does not apply here — Maestro is independent of jest).

- [ ] **Step 9: Commit**

```bash
git add e2e/dataset-info.mjs e2e/flows e2e/run.sh docs/e2e.md
git commit -m "feat(e2e): maestro flows, one-command runner, runbook (#48)"
```

---

### Task 5: End-to-end shakeout — make the suite actually green

This is the integration task: install the Maestro CLI, execute `./e2e/run.sh`, and fix what breaks until the suite is green **twice consecutively**. Expected friction (all anticipated in spec §12): first-bundle timeouts, copy-dependent text assertions, dev-client launcher instead of the app, keyboard covering buttons.

**Files:**
- Modify (as needed): `e2e/flows/*.yaml`, `e2e/run.sh`, `e2e/*.mjs` — freely, that's the point of the task.
- Modify (only if evidence demands): Task 1 anchor placements (e.g. an anchor sits on a non-accessible wrapper and Maestro can't see it — move it to the touchable element).
- **Must not change:** app behavior/copy, `fpl-client.ts` semantics, seeded-data invariants (users, entry id, `model_version='e2e-fixture'`).

**Rules of engagement:**
1. Every change gets a one-line rationale in the task report (what failed → what changed). Copy-dependent assertion adjustments must quote the actual rendered copy they now target.
2. If the app cannot reach `http://127.0.0.1:4004` (ATS/cleartext block — spec §12 fallback): add `NSAllowsLocalNetworking` under `ios.infoPlist` in `app.config.ts`, report BLOCKED, and stop — the controller decides on the EAS rebuild (~20 min) before continuing.
3. Never point any config at production Supabase or fantasy.premierleague.com to "get it working".

- [ ] **Step 1: Install Maestro + record version:**

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version
```

Expected: a version prints (record it in the report and in `docs/e2e.md`'s prerequisites).

- [ ] **Step 2: First full run:**

Run: `./e2e/run.sh 2>&1 | tee e2e/.artifacts/first-run.log`
Expected on first attempt: failures. Triage each from the log + `~/.maestro/tests/` screenshots; iterate flow-by-flow with `./e2e/run.sh e2e/flows/signin-team.yaml` etc. (services stay up between runs; re-run reuses the cached artifact).

- [ ] **Step 3: Iterate until each flow passes individually**, in order: `signin-team`, `connect-team`, `tabs-signout`.

- [ ] **Step 4: Prove the acceptance criteria:**

Run: `./e2e/run.sh` → GREEN (all three flows)
Run: `./e2e/run.sh` again immediately → GREEN (idempotence: seed reset + clearState hold)
Run: `grep -c " 200 " e2e/.artifacts/fixture-server.log` → > 0 (the app really used the fixture server) and `grep -rn "premierleague" e2e/flows e2e/run.sh` → no matches
Run: `npx jest --watchman=false --runInBand --forceExit` and `npx tsc --noEmit` → still green / no NEW errors

- [ ] **Step 5: Commit**

```bash
git add -A e2e docs/e2e.md
git commit -m "test(e2e): shakeout — suite green twice consecutively (#48)"
```

---

### Controller wrap-up (not a subagent task)

After Task 5: final whole-branch review → PR referencing #48 → after merge: issue #48 recalibration comment (write-back flows are Phase 6; CI AC re-scoped) + a new follow-up issue for CI per spec §11 (Android-emulator-on-Linux, workflow_dispatch first) + CLAUDE.md/memory bookkeeping.
