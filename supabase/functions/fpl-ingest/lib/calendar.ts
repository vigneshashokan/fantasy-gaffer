// Season + transfer-window dates. Bumped via PR at season rollover.
//
// Dates are inclusive on both ends and compared via UTC. Mid-day local
// drift around the boundary is fine — we run at 02:00 UTC so the
// boundary is crossed cleanly.

const PL_SEASON_START = new Date('2026-08-15T00:00:00Z');
const PL_SEASON_END   = new Date('2027-05-25T23:59:59Z');

const TRANSFER_WINDOWS: ReadonlyArray<{ start: Date; end: Date }> = [
  { start: new Date('2026-06-15T00:00:00Z'), end: new Date('2026-09-01T23:59:59Z') },
  { start: new Date('2027-01-01T00:00:00Z'), end: new Date('2027-02-01T23:59:59Z') },
];

export function isPLSeasonActive(d: Date): boolean {
  return d >= PL_SEASON_START && d <= PL_SEASON_END;
}

export function isInTransferWindow(d: Date): boolean {
  return TRANSFER_WINDOWS.some((w) => d >= w.start && d <= w.end);
}
