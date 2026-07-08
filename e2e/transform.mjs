// e2e/transform.mjs — derive the run-time E2E dataset from the raw captures.
// Pins GW t (from meta) as the live gameweek: t's deadline is 3 days in the
// past, t+1's is 4 days ahead. GW t's FIXTURES are played (finished, real
// scores) while the EVENT keeps finished=false/data_checked=false — FPL's
// real in-progress-GW state (matches played, awaiting data check);
// event.finished only flips once FPL finalizes a gameweek.
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
  // Synthesize the UPCOMING gameweek's picks (t+1) from the live GW's. The team
  // carousel's upcoming page fetches /entry/{id}/event/{t+1}/picks/, but the
  // capture only holds the live + prior GW — so t+1 would 404 and that page
  // (with its chip-tips / captain advice, the only place isUpcoming decision
  // surfaces render) never leaves its loading skeleton. This is faithful to FPL:
  // once the current GW is finished, a future GW's squad carries over from it
  // (same 15, no auto-subs yet, no active chip) until transfers are made.
  const livePicks = await loadRaw(rawDir, `picks-gw${t}`);
  const upcomingPicks = {
    ...livePicks,
    active_chip: null,
    automatic_subs: [],
    entry_history: { ...livePicks.entry_history, event: t + 1 },
  };
  await writeFile(`${outDir}/picks-gw${t + 1}.json`, JSON.stringify(upcomingPicks));
  return { t, entry: meta.entry };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { t, entry } = await run();
  console.log(`[transform] dataset ready: entry ${entry}, live GW ${t}`);
}
