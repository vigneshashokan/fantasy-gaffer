// src/constants/clubColors.ts
//
// Design-time kit color palette per club code. Backend doesn't store these;
// they're product design tokens. The useClubs() hook joins rows fetched
// from Supabase against this table by short_name → ClubCode.

import type { ClubCode } from '@/types/fpl';

export const CLUB_COLORS: Record<ClubCode, { kit: string; kit2: string; ink: string }> = {
  ARS: { kit: '#EF0107', kit2: '#fff',    ink: '#fff' },
  LIV: { kit: '#C8102E', kit2: '#00B2A9', ink: '#fff' },
  MCI: { kit: '#6CABDD', kit2: '#fff',    ink: '#0a2d5e' },
  CHE: { kit: '#034694', kit2: '#fff',    ink: '#fff' },
  MUN: { kit: '#DA291C', kit2: '#000',    ink: '#fff' },
  NEW: { kit: '#1A1A1A', kit2: '#fff',    ink: '#fff' },
  TOT: { kit: '#F4F4F4', kit2: '#132257', ink: '#132257' },
  AVL: { kit: '#670E36', kit2: '#95BFE5', ink: '#95BFE5' },
  NFO: { kit: '#DD0000', kit2: '#fff',    ink: '#fff' },
  BHA: { kit: '#0057B8', kit2: '#fff',    ink: '#fff' },
  BOU: { kit: '#B50E12', kit2: '#000',    ink: '#fff' },
  BRE: { kit: '#E30613', kit2: '#fff',    ink: '#fff' },
  CRY: { kit: '#1B458F', kit2: '#C4122E', ink: '#fff' },
  EVE: { kit: '#003399', kit2: '#fff',    ink: '#fff' },
  FUL: { kit: '#F4F4F4', kit2: '#000',    ink: '#222' },
  COV: { kit: '#6CACE4', kit2: '#fff',    ink: '#0a2d5e' },
  HUL: { kit: '#F18A00', kit2: '#000',    ink: '#000' },
  IPS: { kit: '#0044A9', kit2: '#fff',    ink: '#fff' },
  LEE: { kit: '#F4F4F4', kit2: '#1D428A', ink: '#1D428A' },
  SUN: { kit: '#EB172B', kit2: '#fff',    ink: '#fff' },
};

// Mirrors jerseyForClub: the Record is complete against ClubCode, but club
// codes arrive from Supabase as plain strings, so a code from a club we have
// not shipped yet reaches this at runtime and resolves to undefined despite
// what the type says. Callers must handle that (#218).
export function clubColorsFor(
  code: ClubCode | undefined,
): { kit: string; kit2: string; ink: string } | undefined {
  return code ? CLUB_COLORS[code] : undefined;
}
