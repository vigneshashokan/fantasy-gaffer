// src/api/clubs.ts
//
// Reference data: 20 PL clubs. Source = supabase.clubs.
// Joined against CLUB_COLORS to fill in design-time kit hex values.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CLUB_COLORS } from '@/constants/clubColors';
import { queryKeys } from './queryKeys';
import type { Club, ClubCode } from '@/types/fpl';

/**
 * One row as returned by `select('id, short_name, name')` against
 * `supabase.clubs`. `short_name` is the join key against `CLUB_COLORS`
 * — see `clubsFromRows` for how unknown codes are dropped.
 */
interface ClubRow {
  id: number;
  short_name: string;
  name: string;
}

const KNOWN_CODES = new Set<string>(Object.keys(CLUB_COLORS));

export function clubsFromRows(rows: ClubRow[]): Record<ClubCode, Club> {
  const out = {} as Record<ClubCode, Club>;
  for (const row of rows) {
    if (!KNOWN_CODES.has(row.short_name)) continue;
    const code = row.short_name as ClubCode;
    out[code] = { name: row.name, ...CLUB_COLORS[code] };
  }
  return out;
}

async function queryClubs(): Promise<Record<ClubCode, Club>> {
  const { data, error } = await supabase.from('clubs').select('id, short_name, name');
  if (error) throw error;
  return clubsFromRows(data ?? []);
}

export function useClubs() {
  return useQuery({
    queryKey: queryKeys.clubs,
    queryFn: queryClubs,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function clubCodeByTeamIdFromRows(rows: ClubRow[]): Record<number, ClubCode> {
  const out: Record<number, ClubCode> = {};
  for (const row of rows) {
    if (!KNOWN_CODES.has(row.short_name)) continue;
    out[row.id] = row.short_name as ClubCode;
  }
  return out;
}

async function queryClubsByTeamId(): Promise<Record<number, ClubCode>> {
  const { data, error } = await supabase.from('clubs').select('id, short_name, name');
  if (error) throw error;
  return clubCodeByTeamIdFromRows((data ?? []) as ClubRow[]);
}

export function useClubCodeByTeamId() {
  return useQuery({
    queryKey: queryKeys.clubsByTeamId,
    queryFn: queryClubsByTeamId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
