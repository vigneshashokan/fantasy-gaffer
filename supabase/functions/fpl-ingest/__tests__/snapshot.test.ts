import { assertEquals } from '@std/assert';
import {
  selectSnapshotGw,
  snapshotRows,
  type SnapshotElement,
  type SnapshotEvent,
} from '../sources/snapshot.ts';

// ---- selectSnapshotGw ------------------------------------------------------

const AUG_GW1: SnapshotEvent = { id: 1, is_next: true, deadline_time: '2026-08-15T10:00:00Z' };

Deno.test('selectSnapshotGw: is_next with a future deadline -> that gw', () => {
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-08-10T00:00:00Z'));
  assertEquals(out?.gw, 1);
});

Deno.test('selectSnapshotGw: season derives from the DEADLINE date, not now (July run -> 2026/27)', () => {
  // currentSeasonLabel(July 2026) would say "2025/26"; the August deadline says "2026/27".
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-07-10T00:00:00Z'));
  assertEquals(out, { gw: 1, season: '2026/27' });
});

Deno.test('selectSnapshotGw: no is_next event (off-season) -> null', () => {
  const events: SnapshotEvent[] = [{ id: 38, is_next: false, deadline_time: '2026-05-20T10:00:00Z' }];
  assertEquals(selectSnapshotGw(events, new Date('2026-06-20T00:00:00Z')), null);
});

Deno.test('selectSnapshotGw: is_next but deadline already passed -> null (freeze guard)', () => {
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-08-15T10:00:01Z'));
  assertEquals(out, null);
});

Deno.test('selectSnapshotGw: deadline exactly now -> null (frozen at the deadline instant)', () => {
  assertEquals(selectSnapshotGw([AUG_GW1], new Date('2026-08-15T10:00:00Z')), null);
});

Deno.test('selectSnapshotGw: null deadline_time -> null', () => {
  const events: SnapshotEvent[] = [{ id: 1, is_next: true, deadline_time: null }];
  assertEquals(selectSnapshotGw(events, new Date('2026-07-10T00:00:00Z')), null);
});

Deno.test('selectSnapshotGw: mid-season May deadline -> prior-year season label', () => {
  const events: SnapshotEvent[] = [{ id: 36, is_next: true, deadline_time: '2027-05-01T10:00:00Z' }];
  const out = selectSnapshotGw(events, new Date('2027-04-28T00:00:00Z'));
  assertEquals(out, { gw: 36, season: '2026/27' });
});

// ---- snapshotRows ----------------------------------------------------------

function element(over: Partial<SnapshotElement> = {}): SnapshotElement {
  return {
    id: 100,
    ep_next: '5.5',
    ep_this: '4.0',
    selected_by_percent: '32.1',
    now_cost: 75,
    form: '6.2',
    status: 'a',
    chance_of_playing_next_round: null,
    news: '',
    news_added: null,
    transfers_in_event: 12345,
    transfers_out_event: 678,
    penalties_order: 1,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: 2,
    ...over,
  };
}

Deno.test('snapshotRows: maps one row per element with PK fields + captured_at', () => {
  const rows = snapshotRows('2026/27', 1, [element(), element({ id: 200 })], '2026-08-10T06:15:00Z');
  assertEquals(rows.length, 2);
  assertEquals(rows[0].season, '2026/27');
  assertEquals(rows[0].gw, 1);
  assertEquals(rows[0].player_id, 100);
  assertEquals(rows[1].player_id, 200);
  assertEquals(rows[0].captured_at, '2026-08-10T06:15:00Z');
});

Deno.test('snapshotRows: parses string-typed ep/ownership/form to numbers', () => {
  const r = snapshotRows('2026/27', 1, [element()], '2026-08-10T06:15:00Z')[0];
  assertEquals(r.ep_next, 5.5);
  assertEquals(r.ep_this, 4.0);
  assertEquals(r.selected_by_percent, 32.1);
  assertEquals(r.form, 6.2);
  assertEquals(typeof r.ep_next, 'number');
});

Deno.test('snapshotRows: unparseable numeric strings coerce to 0', () => {
  const r = snapshotRows('2026/27', 1, [element({ ep_next: '', form: 'x' })], 't')[0];
  assertEquals(r.ep_next, 0);
  assertEquals(r.form, 0);
});

Deno.test('snapshotRows: preserves nullable set-piece order and chance fields', () => {
  const r = snapshotRows('2026/27', 1, [element()], 't')[0];
  assertEquals(r.penalties_order, 1);
  assertEquals(r.corners_and_indirect_freekicks_order, null);
  assertEquals(r.direct_freekicks_order, 2);
  assertEquals(r.chance_of_playing_next_round, null);
});

Deno.test('snapshotRows: passes through integer/status/news fields', () => {
  const r = snapshotRows('2026/27', 1, [element({
    status: 'd',
    chance_of_playing_next_round: 75,
    news: 'Hamstring injury - Expected back 22 Aug',
    news_added: '2026-08-01T10:30:00Z',
  })], 't')[0];
  assertEquals(r.now_cost, 75);
  assertEquals(r.status, 'd');
  assertEquals(r.chance_of_playing_next_round, 75);
  assertEquals(r.news, 'Hamstring injury - Expected back 22 Aug');
  assertEquals(r.news_added, '2026-08-01T10:30:00Z');
  assertEquals(r.transfers_in_event, 12345);
  assertEquals(r.transfers_out_event, 678);
});
