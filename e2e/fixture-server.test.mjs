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
