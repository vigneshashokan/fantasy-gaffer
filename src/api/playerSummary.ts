// src/api/playerSummary.ts
//
// Lazy per-player history + upcoming fixtures from the public FPL
// /element-summary/{id}/ endpoint. history[] drives the form sparkline;
// fixtures[] drives the next-5 FDR strip. Other fields in the payload
// (expected_goals, etc.) are intentionally ignored at this tier.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';

export interface SummaryHistoryRow {
  round: number;
  total_points: number;
}
export interface SummaryFixtureRow {
  event: number | null;
  is_home: boolean;
  team_h: number;
  team_a: number;
  difficulty: number;
}
export interface ElementSummary {
  history: SummaryHistoryRow[];
  fixtures: SummaryFixtureRow[];
}

export interface FormGameweek {
  round: number;
  // Points for each fixture in this gameweek — usually one entry, two for a
  // double gameweek. Kept separate (not summed) to mirror the FPL app.
  fixtures: number[];
}
export interface NextFixture {
  event: number | null;
  isHome: boolean;
  opponentTeamId: number;
  difficulty: number;
}

// FPL history has one row per FIXTURE, so a double gameweek yields two rows
// with the same `round`. Group fixtures by round — keeping each fixture's
// points separate, like the FPL app, rather than summing — and return the
// last 5 DISTINCT rounds (so `round` is a unique key per sparkline column).
export function last5FromHistory(history: SummaryHistoryRow[]): FormGameweek[] {
  const byRound = new Map<number, number[]>();
  for (const h of history) {
    const fixtures = byRound.get(h.round) ?? [];
    fixtures.push(h.total_points);
    byRound.set(h.round, fixtures);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-5)
    .map(([round, fixtures]) => ({ round, fixtures }));
}

export function next5Fixtures(fixtures: SummaryFixtureRow[]): NextFixture[] {
  return fixtures.slice(0, 5).map((f) => ({
    event: f.event,
    isHome: f.is_home,
    opponentTeamId: f.is_home ? f.team_a : f.team_h,
    difficulty: f.difficulty,
  }));
}

export function fetchPlayerSummary(id: string): Promise<ElementSummary> {
  return fplGet<ElementSummary>(`/element-summary/${id}/`);
}

export function useElementSummary(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.elementSummary(id ?? ''),
    queryFn: () => fetchPlayerSummary(id as string),
    enabled: !!id,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
