// src/api/clubs.ts
//
// Reference data: 20 PL clubs. Source = supabase.clubs.
// Joined against CLUB_COLORS to fill in design-time kit hex values.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CLUB_COLORS } from '@/constants/clubColors';
import { queryKeys } from './queryKeys';
import type { Club, ClubCode } from '@/types/fpl';

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
