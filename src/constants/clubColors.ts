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
  WOL: { kit: '#FDB913', kit2: '#231F20', ink: '#231F20' },
  FUL: { kit: '#F4F4F4', kit2: '#000',    ink: '#222' },
  WHU: { kit: '#7A263A', kit2: '#1BB1E7', ink: '#fff' },
};
