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
