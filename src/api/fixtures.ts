// src/api/fixtures.ts
//
// useCurrentGameweek() reads FPL bootstrap-static.events; it's the canonical
// current-event lookup. useFixturesByGw(gw) reads from supabase.fixtures.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fplGet } from './fpl-client';
import { liveStatsById, type LivePlayerStat, type RawLiveElement } from './liveStats';
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
  deadline_time?: string;
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

export type SeasonPhase =
  | { kind: 'live'; gw: number }
  | { kind: 'next'; gw: number }
  | { kind: 'complete' };

// live     — the current GW is in progress
// next     — the current GW has finished; `gw` is the upcoming one ("GW23 Next")
// complete — no upcoming GW remains (season over)
export function seasonStateFromEvents(events: BootstrapEvent[]): SeasonPhase {
  if (events.length === 0) return { kind: 'complete' };
  const current = events.find((e) => e.is_current);
  const next = events.find((e) => e.is_next);
  if (current && !current.finished) return { kind: 'live', gw: current.id };
  if (next) return { kind: 'next', gw: next.id };
  return { kind: 'complete' };
}

export interface NextDeadline {
  gw: number;
  /** Raw ISO-8601 UTC string, exactly as FPL serves it. */
  iso: string;
}

// The gameweek a manager can still act on: the FIRST event whose deadline has
// not passed.
//
// Deliberately NOT `currentGw + 1`, which is off by one in two live states:
// pre-season (nothing is_current, so currentGwFromEvents falls back to is_next
// = GW1, giving "GW2" while GW1 has not been played) and the window between a
// finished GW and the next deadline. Comparing deadlines to now has neither
// failure mode and needs no flag archaeology — same approach as the
// snapshotter's freeze check (fpl-ingest/sources/snapshot.ts).
//
// Returns null once the last deadline has passed (season over) — callers must
// treat that as "no deadline to show", not as zero.
export function nextDeadlineFromEvents(
  events: BootstrapEvent[],
  now: Date = new Date(),
): NextDeadline | null {
  const upcoming = events.find(
    (e) => e.deadline_time && new Date(e.deadline_time).getTime() > now.getTime(),
  );
  return upcoming?.deadline_time ? { gw: upcoming.id, iso: upcoming.deadline_time } : null;
}

// Rendered in the reader's OWN timezone: FPL publishes deadlines in UTC, but a
// deadline is only actionable in local time. No timeZone option, so the device
// decides — e.g. 2026-08-21T17:30:00Z reads "Fri 21 Aug, 6:30 PM" in London
// and "Fri 21 Aug, 10:30 AM" in Los Angeles.
export function formatDeadline(iso: string): string {
  return (
    new Date(iso)
      .toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      // en-GB renders the day period lowercase ("6:30 pm"); the mock's banner
      // reads "Sat 11:00 AM". No month or weekday abbreviation contains "am"
      // or "pm", so the word-boundary match can only hit the day period.
      .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
  );
}

// PL seasons span Aug–May, so before August the "current" season started the
// previous calendar year. Derives e.g. "2025/26" rather than hard-coding it.
export function currentSeasonLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  const start = now.getMonth() >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function useBootstrap() {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: () => fplGet<BootstrapResponse>('/bootstrap-static/'),
    staleTime: 60 * 60 * 1000,
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
    // Forwarded so composing hooks can offer Retry / pull-to-refresh (#167).
    isRefetching: q.isRefetching,
    refetch: q.refetch,
  };
}

export function useSeasonState() {
  const q = useBootstrap();
  return {
    data: q.data ? seasonStateFromEvents(q.data.events) : undefined,
    isPending: q.isPending,
    isError: q.isError,
  };
}

// Reads the bootstrap query that is already cached (staleTime 1h) — no extra
// network. Supplementary: callers fall back rather than gate rendering on it.
export function useNextDeadline() {
  const q = useBootstrap();
  return { data: q.data ? nextDeadlineFromEvents(q.data.events) : null };
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

interface LiveResponse {
  elements: RawLiveElement[];
}

export function useEventLive(gw: number) {
  return useQuery<Map<number, LivePlayerStat>>({
    queryKey: queryKeys.eventLive(gw),
    queryFn: async () => {
      const data = await fplGet<LiveResponse>(`/event/${gw}/live/`);
      return liveStatsById(data.elements);
    },
    staleTime: 60 * 1000,
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
    enabled: Number.isFinite(gw) && gw > 0,
  });
}

export interface ClubGwFixtures {
  count: number;
  fdrs: number[];
}
// gw → club → { fixture count (0 blank, 1, 2 double), FDR per fixture }
export type SeasonFixtures = Map<number, Partial<Record<ClubCode, ClubGwFixtures>>>;

interface AllFixtureRow {
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
}

export function seasonFixturesFromRows(
  rows: AllFixtureRow[],
  clubByTeamId: Record<number, string>,
): SeasonFixtures {
  const out: SeasonFixtures = new Map();
  for (const r of rows) {
    if (r.event == null) continue;
    const gwMap = out.get(r.event) ?? {};
    const add = (code: string | undefined, fdr: number) => {
      if (!code) return;
      const club = code as ClubCode;
      const cur = gwMap[club] ?? { count: 0, fdrs: [] };
      gwMap[club] = { count: cur.count + 1, fdrs: [...cur.fdrs, fdr] };
    };
    add(clubByTeamId[r.team_h], r.team_h_difficulty);
    add(clubByTeamId[r.team_a], r.team_a_difficulty);
    out.set(r.event, gwMap);
  }
  return out;
}

export function useAllFixtures() {
  return useQuery({
    queryKey: queryKeys.allFixtures,
    queryFn: async () => {
      const [fxRes, clubsRes] = await Promise.all([
        supabase.from('fixtures').select('event, team_h, team_a, team_h_difficulty, team_a_difficulty'),
        supabase.from('clubs').select('id, short_name'),
      ]);
      if (fxRes.error)    throw fxRes.error;
      if (clubsRes.error) throw clubsRes.error;
      const clubByTeamId: Record<number, string> = {};
      for (const c of clubsRes.data ?? []) clubByTeamId[c.id] = c.short_name;
      return seasonFixturesFromRows((fxRes.data ?? []) as AllFixtureRow[], clubByTeamId);
    },
    staleTime: 10 * 60 * 1000,
  });
}
