import { jerseyForClub } from '@/constants/jerseys';
import { CLUB_COLORS } from '@/constants/clubColors';
import type { ClubCode } from '@/types/fpl';

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

  // The guard that would have caught #218. CLUB_COLORS is a non-Partial
  // Record<ClubCode, ...>, so tsc already forces it complete against the union
  // — iterating its runtime keys therefore walks the WHOLE league, and this
  // fails the moment a promoted club gets a colour but no kit. Both maps being
  // non-Partial is what makes "wired up" mean the same thing in both files;
  // for a season and a half it did not, and 26% of players rendered blank.
  it('every club with colours also has a kit asset', () => {
    const codes = Object.keys(CLUB_COLORS) as ClubCode[];
    expect(codes.length).toBe(20); // a Premier League season
    for (const code of codes) {
      const v = jerseyForClub(code);
      expect(`${code}:${typeof v}`).toBe(`${code}:number`);
    }
  });

  it('degrades to undefined for a club outside the current league', () => {
    // Codes reach the app as plain strings from Supabase, so a club promoted
    // before we ship its art is reachable at runtime whatever the type says.
    // AvatarDisc renders a club disc rather than crashing on this.
    expect(jerseyForClub('WOL' as ClubCode)).toBeUndefined();
  });

  it('returns undefined for missing / nullable input', () => {
    expect(jerseyForClub(undefined)).toBeUndefined();
  });
});
