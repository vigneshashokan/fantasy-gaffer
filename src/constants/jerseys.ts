import type { ClubCode } from '@/types/fpl';

// One kit per PL club. Keyed by ClubCode — every Arsenal player wears
// the same shirt, so player-name keys would just duplicate data.
//
// NOT Partial: every club in ClubCode must have a kit, so tsc fails the build
// if a newly promoted club is added to the union without its asset. All five
// of COV/HUL/IPS/LEE/SUN shipped in assets/jerseys/ on 2026-06-03 and were
// simply never mapped here — 26% of the league rendered blank for it (#218).
const JERSEY_BY_CLUB: Record<ClubCode, number> = {
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
  COV: require('@/assets/jerseys/coventry_city.png'),
  HUL: require('@/assets/jerseys/hull_city.png'),
  IPS: require('@/assets/jerseys/ipswich_town.png'),
  LEE: require('@/assets/jerseys/leeds.png'),
  SUN: require('@/assets/jerseys/sunderland.png'),
};

// Returns undefined for a club we have no kit for. The Record above is complete
// against ClubCode, but codes arrive from Supabase as plain strings — a club
// promoted into the league before we ship its art lands here at runtime and
// must degrade, not crash. AvatarDisc renders a club disc in that case.
export function jerseyForClub(code: ClubCode | undefined): number | undefined {
  return code ? JERSEY_BY_CLUB[code] : undefined;
}
