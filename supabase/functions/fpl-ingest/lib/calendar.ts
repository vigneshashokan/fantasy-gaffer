// Season + transfer-window dates. Bumped via PR at season rollover.
//
// Dates are compared as half-open UTC intervals: `[start, end)`. The end
// constant is the FIRST EXCLUDED instant (start of the day after the last
// in-window day) so millisecond-precision comparisons work correctly.

const PL_SEASON_START = new Date('2026-08-15T00:00:00Z');
const PL_SEASON_END   = new Date('2027-05-26T00:00:00Z'); // first excluded instant

const TRANSFER_WINDOWS: ReadonlyArray<{ start: Date; end: Date }> = [
  { start: new Date('2026-06-15T00:00:00Z'), end: new Date('2026-09-02T00:00:00Z') }, // ends are first-excluded
  { start: new Date('2027-01-01T00:00:00Z'), end: new Date('2027-02-02T00:00:00Z') },
];

export function isPLSeasonActive(d: Date): boolean {
  return d >= PL_SEASON_START && d < PL_SEASON_END;
}

export function isInTransferWindow(d: Date): boolean {
  return TRANSFER_WINDOWS.some((w) => d >= w.start && d < w.end);
}

// PL seasons span Aug–May; before August the current season started the prior
// calendar year. UTC-based (this runs in a UTC cron). E.g. 2026-09 → "2026/27".
export function currentSeasonLabel(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? y : y - 1; // month 7 = August (0-indexed)
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}
