import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

let lookup, FPL_PRIVATE, meta;
before(async () => {
  execFileSync('node', ['e2e/transform.mjs'], { stdio: 'inherit' });
  ({ lookup, FPL_PRIVATE } = await import('./fixture-server.mjs'));
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
  assert.equal(lookup('/element-summary/999999/'), lookup('/element-summary/' + meta.templateElement + '/'));
});

// The dataset must not invent a squad FPL would not serve. transform.mjs used
// to synthesize picks for t+1 so the carousel's upcoming page had something to
// render; the app now handles the real 404 by carrying the live squad forward,
// and the suite has to exercise THAT, not a fabrication.
test('upcoming gameweeks are a modelled 404, distinguishable from a dataset gap', () => {
  assert.equal(lookup(`/entry/${meta.entry}/event/${meta.gw + 1}/picks/`), FPL_PRIVATE);
  assert.equal(lookup(`/entry/${meta.entry}/event/${meta.gw + 5}/picks/`), FPL_PRIVATE);
  // Not null — the server logs this one quietly, and a null here would print
  // "route not modelled" on every run of the suite.
  assert.notEqual(lookup(`/entry/${meta.entry}/event/${meta.gw + 1}/picks/`), null);
  // The live gameweek is still really served.
  assert.ok(typeof lookup(`/entry/${meta.entry}/event/${meta.gw}/picks/`) === 'string');
  // A PAST gameweek we simply did not capture stays a loud null: that is a
  // genuine dataset gap, not FPL's privacy rule.
  assert.equal(lookup(`/entry/${meta.entry}/event/1/picks/`), null);
  // Privacy rule never overrides the entry check.
  assert.equal(lookup(`/entry/${meta.entry + 1}/event/${meta.gw + 1}/picks/`), null);
});

test('the upcoming gameweek is not written to the dataset at all', () => {
  assert.equal(
    existsSync(`e2e/.artifacts/fixtures/picks-gw${meta.gw + 1}.json`),
    false,
    'transform.mjs must not synthesize picks the real API never serves',
  );
});

test('unknown routes are null (404)', () => {
  assert.equal(lookup('/my-team/1/'), null);
  assert.equal(lookup('/'), null);
});
