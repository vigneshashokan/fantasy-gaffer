// src/api/fixtures.ts
//
// useCurrentGameweek() reads FPL bootstrap-static.events; it's the canonical
// current-event lookup. useFixturesByGw(gw) reads from supabase.fixtures.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import type { ClubCode, Fixture } from '@/types/fpl';

interface BootstrapEvent {
  id: number;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  data_checked?: boolean;
  average_entry_score?: number;
  highest_score?: number | null;
}

interface BootstrapResponse {
  events: BootstrapEvent[];
}

export interface CurrentGameweek {
  gw: number;
  avgPoints: number;
  highestPoints: number;
  finished: boolean;
  dataChecked: boolean;
}

export function currentGwFromEvents(events: BootstrapEvent[]): number {
  const current = events.find((e) => e.is_current);
  if (current) return current.id;
  const next = events.find((e) => e.is_next);
  if (next) return next.id;
  return 1;
}

export function eventStatsFromEvents(events: BootstrapEvent[], gw: number): CurrentGameweek {
  const event = events.find((e) => e.id === gw);
  return {
    gw,
    avgPoints: event?.average_entry_score ?? 0,
    highestPoints: event?.highest_score ?? 0,
    finished: event?.finished ?? false,
    dataChecked: event?.data_checked ?? false,
  };
}

export function currentGameweekFromEvents(events: BootstrapEvent[]): CurrentGameweek {
  return eventStatsFromEvents(events, currentGwFromEvents(events));
}

function useBootstrap() {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: () => fplGet<BootstrapResponse>('/bootstrap-static/'),
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
}

export function useCurrentGameweek() {
  const q = useBootstrap();
  return {
    data: q.data ? currentGameweekFromEvents(q.data.events) : undefined,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    isSuccess: q.isSuccess,
  };
}

export function useEventStats(gw: number) {
  const q = useBootstrap();
  const enabled = Number.isFinite(gw) && gw > 0;
  return {
    data: q.data && enabled ? eventStatsFromEvents(q.data.events, gw) : undefined,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    isSuccess: q.isSuccess && enabled,
  };
}

interface LiveElement {
  id: number;
  stats: { total_points: number };
}

interface LiveResponse {
  elements: LiveElement[];
}

export function livePointsById(elements: LiveElement[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of elements) out.set(e.id, e.stats.total_points);
  return out;
}

export function useEventLive(gw: number) {
  return useQuery({
    queryKey: queryKeys.eventLive(gw),
    queryFn: async () => {
      const data = await fplGet<LiveResponse>(`/event/${gw}/live/`);
      return livePointsById(data.elements);
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Number.isFinite(gw) && gw > 0,
  });
}

interface FixtureRow {
  event: number | null;
  team_h: number;
  team_a: number;
}

export function fixturesFromRows(
  rows: FixtureRow[],
  clubByTeamId: Record<number, string>,
): Partial<Record<ClubCode, Fixture>> {
  const out: Partial<Record<ClubCode, Fixture>> = {};
  for (const row of rows) {
    const home = clubByTeamId[row.team_h] as ClubCode | undefined;
    const away = clubByTeamId[row.team_a] as ClubCode | undefined;
    if (home && away) {
      out[home] = { opp: away, h: true };
      out[away] = { opp: home, h: false };
    }
  }
  return out;
}

export function useFixturesByGw(gw: number) {
  return useQuery({
    queryKey: queryKeys.fixtures(gw),
    queryFn: async () => {
      const [fxRes, clubsRes] = await Promise.all([
        supabase.from('fixtures').select('event, team_h, team_a').eq('event', gw),
        supabase.from('clubs').select('id, short_name'),
      ]);
      if (fxRes.error)    throw fxRes.error;
      if (clubsRes.error) throw clubsRes.error;
      const clubByTeamId: Record<number, string> = {};
      for (const c of clubsRes.data ?? []) clubByTeamId[c.id] = c.short_name;
      return fixturesFromRows((fxRes.data ?? []) as FixtureRow[], clubByTeamId);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Number.isFinite(gw) && gw > 0,
  });
}
