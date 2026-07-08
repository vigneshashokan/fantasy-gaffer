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
