// e2e/fixture-server.mjs — static local FPL API over the transformed dataset.
// Unknown routes 404 loudly: a 404 in the run log means the app called a route
// the dataset doesn't model — extend the dataset, don't loosen the server.
//
// One 404 is NOT a gap and must not read like one: FPL keeps a squad private
// until its gameweek deadline passes, so /picks/ for any gw after the live one
// genuinely 404s. That is modelled, quiet, and load-bearing — the app carries
// the live squad forward when it sees it, which is the only way the decision
// surfaces render. See FPL_PRIVATE.
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

// Returned instead of a body when FPL would 404 *by design*. A Symbol so it can
// never collide with a response body, and so a caller that forgets to handle it
// fails visibly rather than serving the string.
export const FPL_PRIVATE = Symbol('fpl-squad-private-until-deadline');

export function lookup(url) {
  const p = url.replace(/\?.*$/, '').replace(/\/+$/, '');
  let m;
  if (p === '/bootstrap-static') return files.get('bootstrap-static');
  if (p === '/fixtures') return files.get('fixtures');
  if ((m = p.match(/^\/entry\/(\d+)$/)))
    return Number(m[1]) === meta.entry ? files.get('entry') : null;
  if ((m = p.match(/^\/entry\/(\d+)\/history$/)))
    return Number(m[1]) === meta.entry ? files.get('entry-history') : null;
  if ((m = p.match(/^\/entry\/(\d+)\/event\/(\d+)\/picks$/))) {
    if (Number(m[1]) !== meta.entry) return null;
    const captured = files.get(`picks-gw${m[2]}`);
    if (captured) return captured;
    // Modelled, not missing: a gameweek whose deadline has not passed. Any
    // OTHER absent gameweek stays null (loud) — that really is a dataset gap.
    return Number(m[2]) > meta.gw ? FPL_PRIVATE : null;
  }
  if ((m = p.match(/^\/event\/(\d+)\/live$/)))
    return files.get(`live-gw${m[1]}`) ?? JSON.stringify({ elements: [] });
  if ((m = p.match(/^\/element-summary\/(\d+)$/)))
    return files.get(`element-summary-${m[1]}`) ?? files.get(`element-summary-${meta.templateElement}`);
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer((req, res) => {
    const body = lookup(req.url ?? '');
    if (body === FPL_PRIVATE) {
      // Expected. Logged at info level, with FPL's own body, so a run log that
      // contains it does not look like a broken dataset.
      console.log(`[fixture-server] 404 ${req.url} (squad private until deadline)`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"detail":"Not found."}');
      return;
    }
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
