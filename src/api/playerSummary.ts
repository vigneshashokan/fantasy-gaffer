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

export interface FormPoint {
  round: number;
  points: number;
}
export interface NextFixture {
  event: number | null;
  isHome: boolean;
  opponentTeamId: number;
  difficulty: number;
}

// One FPL history row exists per FIXTURE, so a double gameweek produces two
// rows with the same `round` (e.g. GW36 played twice). Sum points per round —
// collapsing a DGW into a single gameweek total — before taking the last 5
// DISTINCT rounds. This keeps `round` unique, so it's a safe React key for the
// sparkline and each bar represents one gameweek.
export function last5FromHistory(history: SummaryHistoryRow[]): FormPoint[] {
  const pointsByRound = new Map<number, number>();
  for (const h of history) {
    pointsByRound.set(h.round, (pointsByRound.get(h.round) ?? 0) + h.total_points);
  }
  return [...pointsByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-5)
    .map(([round, points]) => ({ round, points }));
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
