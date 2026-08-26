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
import { useCurrentGameweek, useEventLive, useEventStats, useFixturesByGw, useAllFixtures, useNextDeadline, formatDeadline, type SeasonFixtures, type NextDeadline } from './fixtures';
import { pitchEventFields, type LivePlayerStat } from './liveStats';
import { fplGet, FplFetchError } from './fpl-client';
import { chipsFromHistory, gwPointsFromHistory, useManager, useManagerHistory } from './manager';
import { usePlayers } from './players';
import { useProfile } from './profile';
import { queryKeys } from './queryKeys';
import { useProjections, type ProjectionStat } from './projections';
import { computeAdvice } from '@/utils/gafferAdvice';
import { computeTransferAdvice } from '@/utils/transferAdvice';
import { computeChipAdvice, attachChipTips } from '@/utils/chipAdvice';

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

// The `useApexTeam().data` shape — derived rather than hand-declared so it can
// never drift from `buildApexTeam`'s actual return. Exported so tests can pin
// hand-mocked `useApexTeam` fixtures against the real shape (see #155).
export type ApexTeamData = ReturnType<typeof buildApexTeam>;

// What useSquad resolves to. `carriedOverFrom` is set only when the requested
// gameweek had no published picks and the live gameweek's squad was carried
// forward in its place (see useSquad) — screens must disclose it.
export type SquadData = { starters: SquadPlayer[]; bench: SquadPlayer[]; carriedOverFrom?: number };

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

const FPL_STALE = 60 * 1000;
const SEASON_FINAL_GW = 38;

export function useSquad(targetGw?: number) {
  const profile = useProfile();
  const currentGw = useCurrentGameweek();
  const nextDeadline = useNextDeadline();
  const players = usePlayers();
  const teamId = profile.data?.fplTeamId ?? null;
  const liveGw = currentGw.data?.gw ?? null;
  const gwId = targetGw ?? liveGw ?? null;
  // FPL publishes /event/{gw}/picks/ only AFTER that gameweek's deadline, so
  // the upcoming gameweek — the only one the decision layer is actionable for
  // — 404s every week of the season, not just pre-season. Left unhandled that
  // made captain/bench/chip advice permanently unreachable in production: the
  // 404 became noSquad and GameweekScreen returned NoSquadCta before any
  // advice rendered. Verified against the live API 2026-08-23 with GW1 in
  // progress — event/1/picks/ 200, event/2/picks/ 404, for every entry.
  //
  // So carry the live squad forward, which is exactly what FPL does until a
  // transfer is made (same 15, captain included). e2e/transform.mjs already
  // synthesized these picks for the Maestro suite for this reason — which is
  // also why the suite never caught the gap.
  //
  // `liveGw < gwId` keeps pre-season honest: nothing is_current then, so both
  // the live gameweek and the next deadline resolve to GW1 and there is no
  // earlier squad to carry — #214's empty state stands.
  const carryFrom =
    gwId !== null && liveGw !== null && liveGw < gwId && gwId === nextDeadline.data?.gw
      ? liveGw
      : null;

  return useQuery<SquadData | null>({
    queryKey: queryKeys.squad(teamId ?? 0, gwId ?? 0),
    queryFn: async () => {
      const fetchSquad = async (gw: number) =>
        squadFromPicks(
          await fplGet<PicksResponse>(`/entry/${teamId}/event/${gw}/picks/`),
          players.data ?? [],
        );
      try {
        return await fetchSquad(gwId as number);
      } catch (err) {
        // FPL 404s this endpoint whenever the manager has no squad for the
        // gameweek: pre-season before the first deadline has passed, the
        // upcoming gameweek (handled by the carry-over above), or any gameweek
        // earlier than the one they joined on. That is a legitimate state, not
        // a failure — the entry itself still resolves, which is why useManager
        // succeeds alongside this. Returning null lets the UI say so instead of
        // offering a Retry that cannot succeed until the deadline.
        // Anything other than a 404 is a real error and still propagates.
        if (!(err instanceof FplFetchError) || err.status !== 404) throw err;
        if (carryFrom === null) return null;
        try {
          return { ...(await fetchSquad(carryFrom)), carriedOverFrom: carryFrom };
        } catch (carryErr) {
          if (carryErr instanceof FplFetchError && carryErr.status === 404) return null;
          throw carryErr;
        }
      }
    },
    // liveGw gates the query as well: without it a targetGw fetched before the
    // bootstrap resolved would decide carryFrom === null, 404, and cache the
    // empty state under a key that never refetches.
    enabled:
      teamId !== null && gwId !== null && gwId > 0 && liveGw !== null && Array.isArray(players.data),
    staleTime: FPL_STALE,
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
  const nextDeadlineQ = useNextDeadline();
  const squadQ = useSquad(targetGw);
  const managerQ = useManager();
  const historyQ = useManagerHistory();
  const fixturesQ = useFixturesByGw(gw);
  const liveQ = useEventLive(gw);
  const playersQ = usePlayers();
  // Anchored on the page being composed, not the live gameweek. The advice
  // surfaces (captain, best XI, bench, transfers, chips) only render when
  // `gw > liveGw`, so anchoring on liveGw handed computeAdvice the p50/p75 of
  // a gameweek that had already been played and joined it against the upcoming
  // gameweek's fixtures. `is_current` stays on a finished gameweek until the
  // next deadline, so that was the live state Tue–Sat — exactly when users
  // make these decisions (#168).
  //
  // Out-of-range offsets pass 0, which disables the query and yields an empty
  // map. Clamping with Math.min(38, …) instead produced windows like
  // [37, 38, 38], and score3 and the chip sums counted the final gameweek two
  // or three times, inflating transfer gains by up to 3x (#175).
  const projGw = (offset: number) =>
    gw > 0 && gw + offset <= SEASON_FINAL_GW ? gw + offset : 0;
  const projQ0 = useProjections(projGw(0));
  const projQ1 = useProjections(projGw(1));
  const projQ2 = useProjections(projGw(2));
  const allFixturesQ = useAllFixtures();

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
  // Refetching / retrying the same five gating queries the flags above are
  // derived from, so Retry and pull-to-refresh can only ever clear the exact
  // condition that produced the error/skeleton (#167).
  const isRefetching =
    profile.isRefetching ||
    currentGwQ.isRefetching ||
    squadQ.isRefetching ||
    managerQ.isRefetching ||
    historyQ.isRefetching;
  const refetch = async () => {
    await Promise.all([
      profile.refetch(),
      currentGwQ.refetch(),
      squadQ.refetch(),
      managerQ.refetch(),
      historyQ.refetch(),
    ]);
  };
  // useSquad resolves to null (rather than erroring) when FPL has no picks for
  // this gameweek. Distinct from noTeam: the account IS linked, there is just
  // nothing to show yet.
  const noSquad = !noTeam && squadQ.data === null;

  const data = useMemo(() => {
    if (noTeam || noSquad) return null;
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
      allFixturesQ.data,
      nextDeadlineQ.data,
    );
  }, [
    noTeam,
    noSquad,
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
    allFixturesQ.data,
    nextDeadlineQ.data,
  ]);

  return { data, isPending, isError, error, noTeam, noSquad, isRefetching, refetch };
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
  squad: SquadData,
  manager: { name: string; gw: number; gwPoints: number; totalPoints: number; rank: number; bank: number },
  eventStats: { gw: number; avgPoints: number; highestPoints: number; finished: boolean; dataChecked: boolean },
  liveCurrent: { gw: number; finished: boolean; dataChecked: boolean },
  history: { current?: Array<{ event: number; points: number; total_points: number; rank: number }>; chips: Array<{ name: string; event: number }> },
  fixturesByClub: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>> | undefined,
  liveById: Map<number, LivePlayerStat> | undefined,
  projMaps: Map<string, ProjectionStat>[],
  allPlayers: Player[],
  seasonFixtures: SeasonFixtures | undefined,
  nextDeadline: NextDeadline | null,
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
  const chipAdvice = computeChipAdvice({
    squad,
    // Must match the anchor of projMaps above: chipAdvice indexes
    // projMaps[bestGw - upcomingGw]. Leaving this on liveCurrent.gw while the
    // window starts at `gw` would just relocate the #168 off-by-one into the
    // chip tips.
    upcomingGw: gw,
    seasonFixtures: seasonFixtures ?? new Map(),
    projMaps,
  });
  return {
    teamName: manager.name,
    gw,
    // Set when FPL had no squad for this gameweek and the live one was carried
    // forward (useSquad). Screens MUST disclose it — a carried squad does not
    // include transfers the user has already made for this gameweek, which are
    // private until the deadline.
    carriedOverFrom: squad.carriedOverFrom ?? null,
    liveGw: liveCurrent.gw,
    liveGwFinished: liveCurrent.finished,
    liveGwDataChecked: liveCurrent.dataChecked,
    gwPts,
    totalPoints: manager.totalPoints,
    gwFinished: eventStats.finished,
    gwDataChecked: eventStats.dataChecked,
    avgPoints: eventStats.avgPoints,
    highestPoints: eventStats.highestPoints,
    // Points for the five gameweeks before this one, oldest first — the hero
    // card's form bars. `history.current` only carries gameweeks that have
    // started, so no filtering for "finished" is needed beyond `event < gw`.
    recentPoints: (history.current ?? [])
      .filter((e) => e.event < gw)
      .slice(-5)
      .map((e) => e.points),
    pitch: groupByPosition(squad.starters, liveById, eventStats.finished),
    bench: squad.bench.map((p): PitchPlayer => {
      const stat = liveById?.get(Number(p.id));
      return {
        id: p.id, name: p.name, pts: ptsFor(p, liveById), gk: p.pos === 'GKP', club: p.club,
        ...(stat ? pitchEventFields(stat, eventStats.finished) : {}),
      };
    }),
    // Whether the model actually served a projection for any gameweek in the
    // window. When it hasn't, both advice engines fall back to FPL's ep_next —
    // which early in a season is capped at 4.0 with ~27 distinct values across
    // 600+ players, so a squad's best affordable replacement routinely ties its
    // incumbent exactly and every gain collapses to 0. Both suggestion cards
    // then render empty, and they must not call that "nothing worth changing":
    // that is a claim, and it is false when there was nothing to rank with.
    projectionsReady: projMaps.some((m) => m.size > 0),
    captainPicks: advice.captainPicks,
    captainApplied: squad.starters.find((p) => p.capt)?.name ?? '',
    suggestions: advice.suggestions,
    transfer: {
      freeTransfers: 1,
      squadValue: sumPrice([...squad.starters, ...squad.bench]),
      inBank: bank,
      // The gameweek still open for transfers, and when it closes. Both come
      // from the same event so the banner can never pair a GW with another
      // GW's deadline. `liveCurrent.gw + 1` was off by one pre-season (GW1 is
      // is_next, so it read "Gameweek 2"), and `deadline` was hardcoded '' —
      // the banner rendered a dangling "Deadline for Gameweek 2: ".
      // Falls back only once the season is over, when there is no next
      // deadline; the banner hides itself on the empty string.
      nextGw: nextDeadline?.gw ?? Math.min(38, liveCurrent.gw + 1),
      deadline: nextDeadline ? formatDeadline(nextDeadline.iso) : '',
      captain: parseCaptain(squad.starters.find((p) => p.capt)?.name ?? ''),
      transferSuggestions,
      chips: attachChipTips(transferChipsFromHistory(history), chipAdvice),
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
