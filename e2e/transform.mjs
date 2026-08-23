// e2e/transform.mjs — derive the run-time E2E dataset from the raw captures.
// Transforms only: it must never INVENT a response real FPL would not serve
// (see the note on t+1 picks at the end of run()).
// Pins GW t (from meta) as the live gameweek: t's deadline is 3 days in the
// past, t+1's is 4 days ahead. GW t's FIXTURES are played (finished, real
// scores) while the EVENT keeps finished=false/data_checked=false — FPL's
// real in-progress-GW state (matches played, awaiting data check);
// event.finished only flips once FPL finalizes a gameweek.
// Dates are run-relative, which is why output is generated per-run
// (e2e/.artifacts/fixtures/, gitignored) instead of committed.
import { mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
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
  // Wipe first. run() only ever ADDS files, so anything it stops emitting would
  // otherwise survive in a developer's existing .artifacts and keep being served
  // — which is how a deleted fixture goes on passing a suite. Safe: outDir is
  // the gitignored per-run output, rebuilt in full on the next four lines.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/bootstrap-static.json`, JSON.stringify(bootstrap));
  await writeFile(`${outDir}/fixtures.json`, JSON.stringify(fixtures));
  for (const f of await readdir(rawDir)) {
    if (!f.endsWith('.json.gz')) continue;
    const name = f.replace(/\.json\.gz$/, '');
    if (name === 'bootstrap-static' || name === 'fixtures') continue;
    await writeFile(`${outDir}/${name}.json`, JSON.stringify(await loadRaw(rawDir, name)));
  }
  // NOTE: picks for t+1 are deliberately NOT written. Real FPL 404s
  // /entry/{id}/event/{gw}/picks/ until that gameweek's deadline passes, and
  // the app now depends on that: useSquad carries the live squad forward when
  // the upcoming gameweek 404s, which is the ONLY way the decision surfaces
  // render. fixture-server models the 404 (see FPL_PRIVATE there).
  //
  // This file used to synthesize picks-gw{t+1} from the live GW's, so the suite
  // ran against a squad production could never obtain. That is exactly why the
  // suite stayed green for a season and a half while the upcoming page was a
  // dead empty state for every real user. A fixture that invents data the API
  // does not serve tests nothing.
  return { t, entry: meta.entry };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { t, entry } = await run();
  console.log(`[transform] dataset ready: entry ${entry}, live GW ${t}`);
}
