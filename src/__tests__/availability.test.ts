import { availabilityState } from '@/utils/availability';

describe('availabilityState', () => {
  it('returns null for a fully available player', () => {
    expect(availabilityState('a', null)).toBeNull();
  });
  it('returns null when FPL tags a fit player chance=100', () => {
    expect(availabilityState('a', 100)).toBeNull();
  });
  it('flags an injured player as out', () => {
    expect(availabilityState('i', 0)).toEqual({ severity: 'out' });
  });
  it('flags a suspended player as out', () => {
    expect(availabilityState('s', null)).toEqual({ severity: 'out' });
  });
  it('flags a doubtful player as doubt', () => {
    expect(availabilityState('d', 75)).toEqual({ severity: 'doubt' });
  });
  it('flags an available player with a sub-100 chance as doubt', () => {
    expect(availabilityState('a', 50)).toEqual({ severity: 'doubt' });
  });
  it('flags an unavailable player as out', () => {
    expect(availabilityState('u', null)).toEqual({ severity: 'out' });
  });
  it('flags a not-in-squad player as out', () => {
    expect(availabilityState('n', null)).toEqual({ severity: 'out' });
  });
});
