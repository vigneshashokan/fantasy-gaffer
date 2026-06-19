// src/utils/chipAdvice.ts
//
// The chip slice of the decision layer: pure functions that turn the user's
// squad + full-season fixture structure (DGW/BGW/FDR) + the served 3-GW
// projections into advisory timing tips for the four FPL chips. No React, no
// I/O — fully unit-tested. Fixtures carry the long horizon; projections add a
// near-term point estimate only inside the 3-GW window.

import type { ClubCode, Player, TransferChip } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';
import type { SeasonFixtures } from '@/api/fixtures';

export interface ChipTip {
  title: string;
  lines: string[];
}

const FH_MIN_PLAYERS = 11;

const round1 = (n: number): number => Math.round(n * 10) / 10;

// GWs present in the fixtures, from upcoming onward, ascending.
function gwRange(seasonFixtures: SeasonFixtures, upcomingGw: number): number[] {
  return [...seasonFixtures.keys()].filter((gw) => gw >= upcomingGw).sort((a, b) => a - b);
}

function clubFixtureCount(seasonFixtures: SeasonFixtures, club: ClubCode, gw: number): number {
  return seasonFixtures.get(gw)?.[club]?.count ?? 0;
}

function clubFdrs(seasonFixtures: SeasonFixtures, club: ClubCode, gw: number): number[] {
  return seasonFixtures.get(gw)?.[club]?.fdrs ?? [];
}

// "Use this GW" when the chosen GW is the upcoming one; else "Hold for GW{X}".
function headline(bestGw: number, upcomingGw: number): string {
  return bestGw === upcomingGw ? 'Use this GW' : `Hold for GW${bestGw}`;
}

export function benchBoostTip(
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] },
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
  projMaps: Map<string, ProjectionStat>[],
): ChipTip {
  const owned = [...squad.starters, ...squad.bench];
  let bestGw: number | null = null;
  let bestDoublers = 0;
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    const doublers = owned.filter((p) => clubFixtureCount(seasonFixtures, p.club, gw) === 2).length;
    if (doublers > bestDoublers) {
      bestDoublers = doublers;
      bestGw = gw;
    }
  }
  if (bestGw == null) return { title: 'Hold', lines: ['No double gameweek scheduled yet'] };
  const lines = [`${bestDoublers} of your players play twice in GW${bestGw}`];
  const offset = bestGw - upcomingGw;
  if (offset >= 0 && offset < projMaps.length) {
    const benchPts = squad.bench.reduce((s, p) => s + (projMaps[offset].get(p.id)?.p50 ?? 0), 0);
    if (benchPts > 0) lines.push(`~${round1(benchPts)} projected from your bench`);
  }
  return { title: headline(bestGw, upcomingGw), lines };
}

export function freeHitTip(
  owned: Player[],
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
): ChipTip {
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    const withFixture = owned.filter((p) => clubFixtureCount(seasonFixtures, p.club, gw) >= 1).length;
    if (withFixture < FH_MIN_PLAYERS) {
      return {
        title: headline(gw, upcomingGw),
        lines: [`Only ${withFixture} of your players have a fixture in GW${gw}`],
      };
    }
  }
  return { title: 'Hold', lines: ['No blank gameweek scheduled'] };
}

const WC_FDR_THRESHOLD = 5; // more than this many players on a hard fixture → wildcard
const HARD_FDR = 4;

export function wildcardTip(
  owned: Player[],
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
): ChipTip {
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    const tough = owned.filter((p) =>
      clubFdrs(seasonFixtures, p.club, gw).some((f) => f >= HARD_FDR),
    ).length;
    if (tough > WC_FDR_THRESHOLD) {
      return {
        title: headline(gw, upcomingGw),
        lines: [`${tough} of your players face hard fixtures in GW${gw}`],
      };
    }
  }
  return { title: 'Hold', lines: ['Your fixtures look balanced'] };
}

// Summed p50 over the projection window (near-term asset strength). 0 when absent.
function sumWindowP50(p: Player, projMaps: Map<string, ProjectionStat>[]): number {
  let s = 0;
  for (const m of projMaps) s += m.get(p.id)?.p50 ?? 0;
  return s;
}

export function tripleCaptainTip(
  owned: Player[],
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
  projMaps: Map<string, ProjectionStat>[],
): ChipTip {
  // Best near-term asset = highest summed p50 over the window.
  let bestAsset: Player | null = null;
  let bestScore = 0;
  for (const p of owned) {
    const s = sumWindowP50(p, projMaps);
    if (s > bestScore) {
      bestScore = s;
      bestAsset = p;
    }
  }
  if (!bestAsset) return { title: 'Hold', lines: ['No standout fixture yet'] };

  // Prefer that asset's next double.
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    if (clubFixtureCount(seasonFixtures, bestAsset.club, gw) === 2) {
      return { title: headline(gw, upcomingGw), lines: [`${bestAsset.name} plays twice in GW${gw}`] };
    }
  }

  // No double → near-term GW with the highest single-player p50.
  let pickGw: number | null = null;
  let pickPlayer: Player | null = null;
  let pickP50 = 0;
  for (let off = 0; off < projMaps.length; off++) {
    for (const p of owned) {
      const v = projMaps[off].get(p.id)?.p50 ?? 0;
      if (v > pickP50) {
        pickP50 = v;
        pickPlayer = p;
        pickGw = upcomingGw + off;
      }
    }
  }
  if (pickPlayer && pickGw != null) {
    return {
      title: headline(pickGw, upcomingGw),
      lines: [`${pickPlayer.name} ~${round1(pickP50 * 3)} pts (×3) in GW${pickGw}`],
    };
  }
  return { title: 'Hold', lines: ['No standout fixture yet'] };
}

export interface ChipAdviceInput {
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] };
  upcomingGw: number;
  seasonFixtures: SeasonFixtures;
  projMaps: Map<string, ProjectionStat>[];
}

export interface ChipAdvice {
  Wildcard: ChipTip;
  'Free Hit': ChipTip;
  'Bench Boost': ChipTip;
  'Triple Captain': ChipTip;
}

export function computeChipAdvice({
  squad,
  upcomingGw,
  seasonFixtures,
  projMaps,
}: ChipAdviceInput): ChipAdvice {
  const owned = [...squad.starters, ...squad.bench];
  return {
    Wildcard: wildcardTip(owned, seasonFixtures, upcomingGw),
    'Free Hit': freeHitTip(owned, seasonFixtures, upcomingGw),
    'Bench Boost': benchBoostTip(squad, seasonFixtures, upcomingGw, projMaps),
    'Triple Captain': tripleCaptainTip(owned, seasonFixtures, upcomingGw, projMaps),
  };
}

// Merge tips onto idle chips by display name; used chips keep tip undefined.
export function attachChipTips(chips: TransferChip[], advice: ChipAdvice): TransferChip[] {
  return chips.map((c) => {
    if (c.state === 'used') return c;
    const tip = advice[c.name as keyof ChipAdvice];
    return tip ? { ...c, tip } : c;
  });
}
