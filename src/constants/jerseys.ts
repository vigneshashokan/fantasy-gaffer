import type { ClubCode } from '@/types/fpl';

// One kit per PL club. Keyed by ClubCode — every Arsenal player wears
// the same shirt, so player-name keys would just duplicate data.
// WOL and WHU have no shipped asset; consumers fall back to a club-color disc.
const JERSEY_BY_CLUB: Partial<Record<ClubCode, number>> = {
  ARS: require('@/assets/jerseys/arsenal.png'),
  LIV: require('@/assets/jerseys/liverpool.png'),
  MCI: require('@/assets/jerseys/manchester_city.png'),
  CHE: require('@/assets/jerseys/chelsea.png'),
  MUN: require('@/assets/jerseys/manchester_united.png'),
  NEW: require('@/assets/jerseys/newcastle.png'),
  TOT: require('@/assets/jerseys/tottenham.png'),
  AVL: require('@/assets/jerseys/aston_villa.png'),
  NFO: require('@/assets/jerseys/nottingham_forest.png'),
  BHA: require('@/assets/jerseys/brighton.png'),
  BOU: require('@/assets/jerseys/bournemouth.png'),
  BRE: require('@/assets/jerseys/brentford.png'),
  CRY: require('@/assets/jerseys/crystal_palace.png'),
  EVE: require('@/assets/jerseys/everton.png'),
  FUL: require('@/assets/jerseys/fulham.png'),
};

export function jerseyForClub(code: ClubCode | undefined): number | undefined {
  return code ? JERSEY_BY_CLUB[code] : undefined;
}
