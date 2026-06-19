// src/api/squad.ts
//
// useSquad() — FPL /entry/{id}/event/{gw}/picks/ joined with usePlayers().
// useApexTeam() — composition of useSquad, useManager, useFixturesByGw,
// shaped to mimic the APEX_TEAM mock (Gaffer fields are deliberately empty).

import type {
  CaptainPick,
  ClubCode,
  PitchPlayer,
  Player,
  Position,
  Suggestion,
  TransferChip,
  TransferPitchPlayer,
  TransferSuggestion,
} from '@/types/fpl';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCurrentGameweek, useEventLive, useEventStats, useFixturesByGw } from './fixtures';
import { pitchEventFields, type LivePlayerStat } from './liveStats';
import { fplGet } from './fpl-client';
import { chipsFromHistory, gwPointsFromHistory, useManager, useManagerHistory } from './manager';
import { usePlayers } from './players';
import { useProfile } from './profile';
import { queryKeys } from './queryKeys';
import { useProjections, type ProjectionStat } from './projections';
import { computeAdvice } from '@/utils/gafferAdvice';
import { computeTransferAdvice } from '@/utils/transferAdvice';

interface PicksResponse {
  picks: Array<{
    element: number;
    position: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    multiplier: number;
  }>;
}

export type SquadPlayer = Player & { multiplier?: number };

export function squadFromPicks(
  picks: PicksResponse,
  players: Player[],
): { starters: SquadPlayer[]; bench: SquadPlayer[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: SquadPlayer[] = [];
  const bench: SquadPlayer[] = [];
  for (const pick of picks.picks) {
    const base = byId.get(String(pick.element));
    if (!base) continue;
    const enriched: SquadPlayer = {
      ...base,
      capt: pick.is_captain || undefined,
      vice: pick.is_vice_captain || undefined,
      multiplier: pick.multiplier,
    };
    if (pick.position <= 11) starters.push(enriched);
    else bench.push(enriched);
  }
  return { starters, bench };
}

const FPL_STALE = 15 * 60 * 1000;
const FPL_GC = 30 * 60 * 1000;

export function useSquad(targetGw?: number) {
  const profile = useProfile();
  const currentGw = useCurrentGameweek();
  const players = usePlayers();
  const teamId = profile.data?.fplTeamId ?? null;
  const gwId = targetGw ?? currentGw.data?.gw ?? null;

  return useQuery({
    queryKey: queryKeys.squad(teamId ?? 0, gwId ?? 0),
    queryFn: async () => {
      const picks = await fplGet<PicksResponse>(`/entry/${teamId}/event/${gwId}/picks/`);
      return squadFromPicks(picks, players.data ?? []);
    },
    enabled: teamId !== null && gwId !== null && gwId > 0 && Array.isArray(players.data),
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

// Composition hook: assembles the APEX_TEAM shape for the requested gameweek.
// When targetGw is omitted, defaults to the live (current) gameweek.
export function useApexTeam(targetGw?: number) {
  const profile = useProfile();
  const currentGwQ = useCurrentGameweek();
  const liveGw = currentGwQ.data?.gw ?? 0;
  const gw = targetGw ?? liveGw;

  const eventStatsQ = useEventStats(gw);
  const squadQ = useSquad(targetGw);
  const managerQ = useManager();
  const historyQ = useManagerHistory();
  const fixturesQ = useFixturesByGw(gw);
  const liveQ = useEventLive(gw);
  const playersQ = usePlayers();
  const projQ0 = useProjections(liveGw);
  const projQ1 = useProjections(liveGw > 0 ? Math.min(38, liveGw + 1) : 0);
  const projQ2 = useProjections(liveGw > 0 ? Math.min(38, liveGw + 2) : 0);

  const isPending =
    profile.isPending ||
    currentGwQ.isPending ||
    squadQ.isPending ||
    managerQ.isPending ||
    historyQ.isPending;
  const isError =
    profile.isError ||
    currentGwQ.isError ||
    squadQ.isError ||
    managerQ.isError ||
    historyQ.isError;
  const error =
    profile.error ??
    currentGwQ.error ??
    squadQ.error ??
    managerQ.error ??
    historyQ.error ??
    null;
  const noTeam = profile.data?.fplTeamId === null;

  const data = useMemo(() => {
    if (noTeam) return null;
    if (
      !squadQ.data ||
      !managerQ.data ||
      !currentGwQ.data ||
      !eventStatsQ.data ||
      !historyQ.data
    ) {
      return undefined;
    }
    return buildApexTeam(
      squadQ.data,
      managerQ.data,
      eventStatsQ.data,
      currentGwQ.data,
      historyQ.data,
      fixturesQ.data,
      liveQ.data,
      [projQ0.data ?? new Map(), projQ1.data ?? new Map(), projQ2.data ?? new Map()],
      playersQ.data ?? [],
    );
  }, [
    noTeam,
    squadQ.data,
    managerQ.data,
    eventStatsQ.data,
    currentGwQ.data,
    historyQ.data,
    fixturesQ.data,
    liveQ.data,
    projQ0.data,
    projQ1.data,
    projQ2.data,
    playersQ.data,
  ]);

  return { data, isPending, isError, error, noTeam };
}

// Captain shows multiplied points (×2 / ×3 TC) matching the FPL UI; bench
// players (multiplier 0) show their raw total_points so users can see what
// the dugout scored.
function ptsFor(p: SquadPlayer, liveById: Map<number, LivePlayerStat> | undefined): number | null {
  if (!liveById) return null;
  const stat = liveById.get(Number(p.id));
  if (stat == null) return null;
  const m = p.multiplier ?? 0;
  return m > 0 ? stat.points * m : stat.points;
}

// Map the played-chip history onto the full chip catalogue. Reuses the
// manager catalogue so chip display names live in one place. A played chip
// becomes `used` with its `playedGw`; the rest stay `idle`. Consumed by the
// HeroCard / chip banner (find by gameweek) and the "Play a Chip" row.
export function transferChipsFromHistory(
  history: { chips: { name: string; event: number }[] },
): TransferChip[] {
  return chipsFromHistory(history).map((c): TransferChip => ({
    name: c.name,
    state: c.available ? 'idle' : 'used',
    status: c.available ? 'Available' : 'Used',
    playedGw: c.playedGW,
  }));
}

function buildApexTeam(
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] },
  manager: { name: string; gw: number; gwPoints: number; totalPoints: number; rank: number; bank: number },
  eventStats: { gw: number; avgPoints: number; highestPoints: number; finished: boolean; dataChecked: boolean },
  liveCurrent: { gw: number; finished: boolean; dataChecked: boolean },
  history: { current?: Array<{ event: number; points: number; total_points: number; rank: number }>; chips: Array<{ name: string; event: number }> },
  fixturesByClub: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>> | undefined,
  liveById: Map<number, LivePlayerStat> | undefined,
  projMaps: Map<string, ProjectionStat>[],
  allPlayers: Player[],
) {
  const gw = eventStats.gw;
  // For the live GW, manager.summary_event_points is the freshest value; for
  // past GWs, look up the historical entry.
  const gwPts = gw === manager.gw
    ? manager.gwPoints
    : gwPointsFromHistory(history, gw);
  const advice = computeAdvice({
    squad,
    proj: projMaps[0] ?? new Map(),
    fixturesByClub,
  });
  const bank = manager.bank ?? 0;
  const transferSuggestions = computeTransferAdvice({
    squad,
    allPlayers,
    projMaps,
    bank,
    fixturesByClub,
  });
  return {
    teamName: manager.name,
    gw,
    liveGw: liveCurrent.gw,
    liveGwFinished: liveCurrent.finished,
    liveGwDataChecked: liveCurrent.dataChecked,
    gwPts,
    totalPoints: manager.totalPoints,
    gwFinished: eventStats.finished,
    gwDataChecked: eventStats.dataChecked,
    avgPoints: eventStats.avgPoints,
    highestPoints: eventStats.highestPoints,
    pitch: groupByPosition(squad.starters, liveById, eventStats.finished),
    bench: squad.bench.map((p): PitchPlayer => {
      const stat = liveById?.get(Number(p.id));
      return {
        id: p.id, name: p.name, pts: ptsFor(p, liveById), gk: p.pos === 'GKP', club: p.club,
        ...(stat ? pitchEventFields(stat, eventStats.finished) : {}),
      };
    }),
    captainPicks: advice.captainPicks,
    captainApplied: squad.starters.find((p) => p.capt)?.name ?? '',
    suggestions: advice.suggestions,
    transfer: {
      freeTransfers: 1,
      squadValue: sumPrice([...squad.starters, ...squad.bench]),
      inBank: bank,
      nextGw: Math.min(38, liveCurrent.gw + 1),
      deadline: '',
      captain: parseCaptain(squad.starters.find((p) => p.capt)?.name ?? ''),
      transferSuggestions,
      chips: transferChipsFromHistory(history),
      pitch: groupTransferPitch(squad.starters, squad.bench),
    },
  };
}

function groupByPosition(
  starters: SquadPlayer[],
  liveById: Map<number, LivePlayerStat> | undefined,
  gwFinished: boolean,
): PitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  return order.map((pos) =>
    starters
      .filter((p) => p.pos === pos)
      .map((p): PitchPlayer => {
        const stat = liveById?.get(Number(p.id));
        return {
          id: p.id, name: p.name, pts: ptsFor(p, liveById), capt: p.capt, vice: p.vice,
          gk: pos === 'GKP', club: p.club,
          ...(stat ? pitchEventFields(stat, gwFinished) : {}),
        };
      }),
  );
}

function groupTransferPitch(starters: Player[], bench: Player[]): TransferPitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  const all = [...starters, ...bench];
  return order.map((pos) =>
    all
      .filter((p) => p.pos === pos)
      .map((p): TransferPitchPlayer => ({
        id: p.id, name: p.name, p: p.p, pos: p.pos, club: p.club,
        tp: p.tp, f: p.f, own: p.own, gw: p.gw, capt: p.capt,
      })),
  );
}

function sumPrice(players: Player[]): number {
  return Math.round(players.reduce((s, p) => s + p.p, 0) * 10) / 10;
}

function parseCaptain(name: string) {
  const parts = name.split(' ');
  return { first: parts[0] ?? '', last: parts.slice(1).join(' '), num: 0 };
}
