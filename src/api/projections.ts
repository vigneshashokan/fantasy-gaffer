// src/api/projections.ts
//
// useProjections(gw) reads the projections table (written by the fpl-project
// cron) for one gameweek. Returns Map<String(playerId), {p25,p50,p75}>.
// Absent rows are the cold-start / off-season case; consumers fall back to
// ep_next.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './queryKeys';

export interface ProjectionStat {
  p25: number;
  p50: number;
  p75: number;
}

interface ProjectionRow {
  player_id: number;
  p25: number;
  p50: number;
  p75: number;
}

export function projectionsFromRows(rows: ProjectionRow[]): Map<string, ProjectionStat> {
  const out = new Map<string, ProjectionStat>();
  for (const r of rows) {
    out.set(String(r.player_id), { p25: r.p25, p50: r.p50, p75: r.p75 });
  }
  return out;
}

export function useProjections(gw: number) {
  return useQuery({
    queryKey: queryKeys.projections(gw),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projections')
        .select('player_id, p25, p50, p75')
        .eq('gw', gw);
      if (error) throw error;
      return projectionsFromRows((data ?? []) as ProjectionRow[]);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Number.isFinite(gw) && gw > 0,
  });
}
