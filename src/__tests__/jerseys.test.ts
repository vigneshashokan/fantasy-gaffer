import { jerseyForClub } from '@/constants/jerseys';

describe('jerseyForClub', () => {
  it('returns a require()-style image asset for clubs that have a kit PNG', () => {
    // Sample a handful that ship with assets. The numeric return is RN's
    // module id for require() — non-zero, finite.
    for (const code of ['ARS', 'LIV', 'MCI', 'CHE', 'MUN', 'TOT'] as const) {
      const v = jerseyForClub(code);
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('returns undefined for PL clubs we have no kit asset for', () => {
    // WOL and WHU have no PNG in assets/jerseys/. UI falls back to color disc.
    expect(jerseyForClub('WOL')).toBeUndefined();
    expect(jerseyForClub('WHU')).toBeUndefined();
  });

  it('returns undefined for missing / nullable input', () => {
    expect(jerseyForClub(undefined)).toBeUndefined();
  });
});
