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
