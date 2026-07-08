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
