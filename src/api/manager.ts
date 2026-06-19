// src/api/manager.ts
//
// useManager() reads FPL /entry/{id}/ — manager profile + current-gw summary.
// useChips() reads /entry/{id}/history/ and joins against a static chip
// catalog to produce the UI Chip[] shape.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import { useProfile } from './profile';
import type { Chip, TeamInfo } from '@/types/fpl';

interface FplEntry {
  id: number;
  name: string;
  current_event: number;
  summary_event_points: number;
  summary_overall_points: number;
  summary_overall_rank: number;
  last_deadline_bank: number;
}

interface FplHistoryCurrent {
  event: number;
  points: number;
  total_points: number;
  rank: number;
}

interface FplHistory {
  current?: FplHistoryCurrent[];
  chips: Array<{ name: string; event: number }>;
}

export function managerFromEntry(entry: FplEntry): TeamInfo {
  return {
    name: entry.name,
    gw: entry.current_event,
    gwPoints: entry.summary_event_points,
    totalPoints: entry.summary_overall_points,
    rank: entry.summary_overall_rank,
    bank: (entry.last_deadline_bank ?? 0) / 10,
  };
}

const CHIP_CATALOG: Array<{ id: string; fplName: string; name: string; sub: string; icon: string }> = [
  { id: 'wc', fplName: 'wildcard',  name: 'Wildcard',       sub: 'Unlimited transfers',  icon: 'wildcard' },
  { id: 'fh', fplName: 'freehit',   name: 'Free Hit',       sub: 'One-week squad',       icon: 'freehit' },
  { id: 'bb', fplName: 'bboost',    name: 'Bench Boost',    sub: 'All 15 players score', icon: 'benchboost' },
  { id: 'tc', fplName: '3xc',       name: 'Triple Captain', sub: '3× captain points',    icon: 'triplecaptain' },
];

export function gwPointsFromHistory(history: FplHistory, gw: number): number {
  return history.current?.find((e) => e.event === gw)?.points ?? 0;
}

export function chipsFromHistory(history: FplHistory): Chip[] {
  const playedByFpl: Record<string, number> = {};
  for (const c of history.chips ?? []) playedByFpl[c.name] = c.event;
  return CHIP_CATALOG.map((entry) => {
    const played = playedByFpl[entry.fplName];
    return played !== undefined
      ? { id: entry.id, name: entry.name, sub: entry.sub, available: false, playedGW: played, icon: entry.icon }
      : { id: entry.id, name: entry.name, sub: entry.sub, available: true,  icon: entry.icon };
  });
}

const FPL_STALE = 15 * 60 * 1000;
const FPL_GC    = 30 * 60 * 1000;

export function useManager() {
  const profile = useProfile();
  const teamId = profile.data?.fplTeamId ?? null;
  return useQuery({
    queryKey: queryKeys.manager(teamId ?? 0),
    queryFn: async () => managerFromEntry(await fplGet<FplEntry>(`/entry/${teamId}/`)),
    enabled: teamId !== null,
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

export function useManagerHistory() {
  const profile = useProfile();
  const teamId = profile.data?.fplTeamId ?? null;
  return useQuery({
    queryKey: queryKeys.managerHistory(teamId ?? 0),
    queryFn: () => fplGet<FplHistory>(`/entry/${teamId}/history/`),
    enabled: teamId !== null,
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

export function useChips() {
  const history = useManagerHistory();
  return {
    data: history.data ? chipsFromHistory(history.data) : undefined,
    isPending: history.isPending,
    isError: history.isError,
    error: history.error,
    isSuccess: history.isSuccess,
  };
}
