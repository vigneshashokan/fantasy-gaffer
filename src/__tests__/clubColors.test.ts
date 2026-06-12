// src/__tests__/clubColors.test.ts
import { CLUB_COLORS } from '@/constants/clubColors';
import type { ClubCode } from '@/types/fpl';

const ALL_CODES: ClubCode[] = [
  'ARS','LIV','MCI','CHE','MUN','NEW','TOT',
  'AVL','NFO','BHA','BOU','BRE','CRY','EVE',
  'WOL','FUL','WHU',
];

describe('CLUB_COLORS', () => {
  it('covers every ClubCode', () => {
    for (const code of ALL_CODES) {
      expect(CLUB_COLORS[code]).toBeDefined();
    }
  });

  it('every entry uses hex strings for kit/kit2/ink', () => {
    for (const code of ALL_CODES) {
      const c = CLUB_COLORS[code];
      expect(c.kit).toMatch(/^#/);
      expect(c.kit2).toMatch(/^#/);
      expect(c.ink).toMatch(/^#/);
    }
  });
});
