jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { seasonStateFromEvents, currentSeasonLabel } from '@/api/fixtures';

const ev = (
  id: number,
  o: Partial<{ is_current: boolean; is_next: boolean; finished: boolean }> = {},
) => ({ id, is_current: false, is_next: false, finished: false, ...o });

describe('seasonStateFromEvents', () => {
  it('reports the live gameweek while it is in progress', () => {
    const events = [ev(1, { finished: true }), ev(2, { is_current: true }), ev(3, { is_next: true })];
    expect(seasonStateFromEvents(events)).toEqual({ kind: 'live', gw: 2 });
  });
  it('reports the next gameweek once the current one has finished', () => {
    const events = [
      ev(1, { finished: true }),
      ev(2, { is_current: true, finished: true }),
      ev(3, { is_next: true }),
    ];
    expect(seasonStateFromEvents(events)).toEqual({ kind: 'next', gw: 3 });
  });
  it('reports complete when the final gameweek is finished and none are upcoming', () => {
    const events = [ev(37, { finished: true }), ev(38, { is_current: true, finished: true })];
    expect(seasonStateFromEvents(events)).toEqual({ kind: 'complete' });
  });
  it('reports the first gameweek as next before the season starts', () => {
    const events = [ev(1, { is_next: true }), ev(2)];
    expect(seasonStateFromEvents(events)).toEqual({ kind: 'next', gw: 1 });
  });
  it('reports complete for an empty events list', () => {
    expect(seasonStateFromEvents([])).toEqual({ kind: 'complete' });
  });
});

describe('currentSeasonLabel', () => {
  it('uses the start year before August rolls over', () => {
    expect(currentSeasonLabel(new Date('2026-06-14'))).toBe('2025/26');
  });
  it('rolls to the new season from August', () => {
    expect(currentSeasonLabel(new Date('2026-09-01'))).toBe('2026/27');
  });
});
