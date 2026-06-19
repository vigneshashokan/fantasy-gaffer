import { assertEquals } from '@std/assert';
import { selectMissingGws, type HistoryEvent } from '../sources/history.ts';

const EVENTS: HistoryEvent[] = [
  { id: 1, finished: true, data_checked: true },
  { id: 2, finished: true, data_checked: true },
  { id: 3, finished: true, data_checked: false }, // bonus not settled yet
  { id: 4, finished: false, data_checked: false }, // not played
];

Deno.test('selectMissingGws: only finished+data_checked GWs not already present', () => {
  assertEquals(selectMissingGws(EVENTS, [1]), [2]);
});

Deno.test('selectMissingGws: empty when everything settled is already captured', () => {
  assertEquals(selectMissingGws(EVENTS, [1, 2]), []);
});

Deno.test('selectMissingGws: returns all uncaptured settled GWs, ascending', () => {
  assertEquals(selectMissingGws(EVENTS, []), [1, 2]);
});

Deno.test('selectMissingGws: excludes finished-but-not-data_checked GWs', () => {
  const out = selectMissingGws(EVENTS, []);
  assertEquals(out.includes(3), false);
});
