import { assertEquals } from '@std/assert';
import { isInTransferWindow, isPLSeasonActive } from '../lib/calendar.ts';

Deno.test('isPLSeasonActive: true on the start boundary', () => {
  assertEquals(isPLSeasonActive(new Date('2026-08-15T00:00:00Z')), true);
});

Deno.test('isPLSeasonActive: true on the end boundary', () => {
  assertEquals(isPLSeasonActive(new Date('2027-05-25T00:00:00Z')), true);
});

Deno.test('isPLSeasonActive: false the day before season starts', () => {
  assertEquals(isPLSeasonActive(new Date('2026-08-14T23:59:59Z')), false);
});

Deno.test('isPLSeasonActive: false the day after season ends', () => {
  assertEquals(isPLSeasonActive(new Date('2027-05-26T00:00:00Z')), false);
});

Deno.test('isInTransferWindow: true inside summer window', () => {
  assertEquals(isInTransferWindow(new Date('2026-07-04T12:00:00Z')), true);
});

Deno.test('isInTransferWindow: true on summer window edges', () => {
  assertEquals(isInTransferWindow(new Date('2026-06-15T00:00:00Z')), true);
  assertEquals(isInTransferWindow(new Date('2026-09-01T00:00:00Z')), true);
});

Deno.test('isInTransferWindow: true inside winter window', () => {
  assertEquals(isInTransferWindow(new Date('2027-01-15T12:00:00Z')), true);
});

Deno.test('isInTransferWindow: false outside both windows', () => {
  assertEquals(isInTransferWindow(new Date('2026-11-01T12:00:00Z')), false);
  assertEquals(isInTransferWindow(new Date('2027-03-15T12:00:00Z')), false);
});

Deno.test('isInTransferWindow: false the day before summer opens', () => {
  assertEquals(isInTransferWindow(new Date('2026-06-14T23:59:59Z')), false);
});

Deno.test('isInTransferWindow: false the day after winter closes', () => {
  assertEquals(isInTransferWindow(new Date('2027-02-02T00:00:00Z')), false);
});
