// src/api/squad.ts
//
// useSquad() — FPL /entry/{id}/event/{gw}/picks/ joined with usePlayers().
// useApexTeam() — composition of useSquad, useManager, useFixturesByGw,
// shaped to mimic the APEX_TEAM mock (Gaffer fields are deliberately empty).

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';
import { useProfile } from './profile';
import { useCurrentGameweek, useFixturesByGw } from './fixtures';
import { usePlayers } from './players';
import { useManager } from './manager';
import type {
  Player,
  PitchPlayer,
  Position,
  TransferPitchPlayer,
  ClubCode,
  CaptainPick,
  Suggestion,
  TransferChip,
  TransferSuggestion,
} from '@/types/fpl';

interface PicksResponse {
  picks: Array<{
    element: number;
    position: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    multiplier: number;
  }>;
}

export function squadFromPicks(
  picks: PicksResponse,
  players: Player[],
): { starters: Player[]; bench: Player[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: Player[] = [];
  const bench: Player[] = [];
  for (const pick of picks.picks) {
    const base = byId.get(String(pick.element));
    if (!base) continue;
    const enriched: Player = {
      ...base,
      capt: pick.is_captain || undefined,
      vice: pick.is_vice_captain || undefined,
    };
    if (pick.position <= 11) starters.push(enriched);
    else bench.push(enriched);
  }
  return { starters, bench };
}

const FPL_STALE = 15 * 60 * 1000;
const FPL_GC    = 30 * 60 * 1000;

export function useSquad() {
  const profile = useProfile();
  const gw = useCurrentGameweek();
  const players = usePlayers();
  const teamId = profile.data?.fplTeamId ?? null;
  const gwId = gw.data ?? null;

  return useQuery({
    queryKey: queryKeys.squad(teamId ?? 0, gwId ?? 0),
    queryFn: async () => {
      const picks = await fplGet<PicksResponse>(`/entry/${teamId}/event/${gwId}/picks/`);
      return squadFromPicks(picks, players.data ?? []);
    },
    enabled: teamId !== null && gwId !== null && Array.isArray(players.data),
    staleTime: FPL_STALE,
    gcTime: FPL_GC,
  });
}

// Composition hook: assembles the APEX_TEAM shape minus Gaffer fields.
export function useApexTeam() {
  const profile = useProfile();
  const gwQ = useCurrentGameweek();
  const squadQ = useSquad();
  const managerQ = useManager();
  const fixturesQ = useFixturesByGw(gwQ.data ?? 0);

  const isPending  = profile.isPending || gwQ.isPending || squadQ.isPending || managerQ.isPending;
  const isError    = profile.isError   || gwQ.isError   || squadQ.isError   || managerQ.isError;
  const error      = profile.error ?? gwQ.error ?? squadQ.error ?? managerQ.error ?? null;
  const noTeam     = profile.data?.fplTeamId === null;

  const data = useMemo(() => {
    if (noTeam) return null;
    if (!squadQ.data || !managerQ.data || !gwQ.data) return undefined;
    return buildApexTeam(squadQ.data, managerQ.data, gwQ.data, fixturesQ.data);
  }, [noTeam, squadQ.data, managerQ.data, gwQ.data, fixturesQ.data]);

  return { data, isPending, isError, error, noTeam };
}

function buildApexTeam(
  squad: { starters: Player[]; bench: Player[] },
  manager: { name: string; gw: number; gwPoints: number; totalPoints: number; rank: number },
  currentGw: number,
  _fixturesByClub: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>> | undefined,
) {
  return {
    teamName: manager.name,
    gw: currentGw,
    gwPts: manager.gwPoints,
    totalPoints: manager.totalPoints,
    avgPoints: 0,
    highestPoints: 0,
    pitch:  groupByPosition(squad.starters),
    bench:  squad.bench.map((p): PitchPlayer => ({
      name: p.name, pts: null, gk: p.pos === 'GKP', club: p.club,
    })),
    captainPicks: [] as CaptainPick[],
    captainApplied: squad.starters.find((p) => p.capt)?.name ?? '',
    suggestions: [] as Suggestion[],
    transfer: {
      freeTransfers: 1,
      squadValue: sumPrice([...squad.starters, ...squad.bench]),
      inBank: 0,
      nextGw: currentGw + 1,
      deadline: '',
      captain: parseCaptain(squad.starters.find((p) => p.capt)?.name ?? ''),
      transferSuggestions: [] as TransferSuggestion[],
      chips: [] as TransferChip[],
      pitch: groupTransferPitch(squad.starters, squad.bench),
    },
  };
}

function groupByPosition(starters: Player[]): PitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  return order.map((pos) =>
    starters
      .filter((p) => p.pos === pos)
      .map((p): PitchPlayer => ({
        name: p.name, pts: null, capt: p.capt, gk: pos === 'GKP', club: p.club,
      })),
  );
}

function groupTransferPitch(starters: Player[], bench: Player[]): TransferPitchPlayer[][] {
  const order: Position[] = ['FWD', 'MID', 'DEF', 'GKP'];
  const all = [...starters, ...bench];
  return order.map((pos) =>
    all
      .filter((p) => p.pos === pos)
      .map((p): TransferPitchPlayer => ({
        name: p.name, p: p.p, pos: p.pos, club: p.club,
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
