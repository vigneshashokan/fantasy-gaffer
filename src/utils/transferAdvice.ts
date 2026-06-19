// src/utils/transferAdvice.ts
//
// The transfer slice of the decision layer: a pure engine that ranks affordable,
// rules-valid out→in swaps by projected-points gain over the next 3 GWs. No React,
// no I/O — fully unit-tested. Reuses gafferAdvice's availability weighting; falls
// back to ep_next (Player.gw) when projections are absent.

import type { ClubCode, Player, TransferSuggestion } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';
import { availabilityFactor } from '@/utils/gafferAdvice';

const round1 = (n: number): number => Math.round(n * 10) / 10;

// Summed availability-weighted p50 over the projection window. Sums only the GWs
// a row exists for; if the player has NO row in any window GW, falls back to
// availabilityFactor × ep_next (Player.gw) as a single-GW proxy (no triple-count).
export function score3(p: Player, projMaps: Map<string, ProjectionStat>[]): number {
  const av = availabilityFactor(p);
  let sum = 0;
  let hasAny = false;
  for (const m of projMaps) {
    const row = m.get(p.id);
    if (row) {
      sum += row.p50;
      hasAny = true;
    }
  }
  return hasAny ? av * sum : av * p.gw;
}

// Minimum 3-GW gain (pts) for a swap to be worth suggesting — stands in for the
// "is this transfer worth it" hit-cost judgement (FT count isn't public). Tunable.
const MIN_TRANSFER_GAIN = 1.0;

function outReason(p: Player): string {
  switch (p.status) {
    case 'i': return 'Injured';
    case 's': return 'Suspended';
    case 'u':
    case 'n': return 'Unavailable';
    default:
      if (p.chanceNext != null && p.chanceNext < 100) return `Doubtful ${p.chanceNext}%`;
      return '';
  }
}

function transferDetail(
  out: Player,
  inn: Player,
  fixturesByClub?: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>>,
): string {
  const parts: string[] = [];
  const delta = round1(inn.p - out.p);
  if (delta < 0) parts.push(`Frees £${Math.abs(delta).toFixed(1)}m`);
  else if (delta > 0) parts.push(`Costs £${delta.toFixed(1)}m`);
  const reason = outReason(out);
  if (reason) parts.push(reason);
  const fx = fixturesByClub?.[inn.club];
  if (fx) parts.push(`vs ${fx.opp} (${fx.h ? 'H' : 'A'})`);
  if (parts.length === 0) parts.push('Better 3-GW projection');
  return parts.join(' · ');
}

export interface TransferAdviceInput {
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] };
  allPlayers: Player[];
  projMaps: Map<string, ProjectionStat>[];
  bank: number;
  fixturesByClub?: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>>;
}

export function computeTransferAdvice({
  squad,
  allPlayers,
  projMaps,
  bank,
  fixturesByClub,
}: TransferAdviceInput): TransferSuggestion[] {
  const owned = [...squad.starters, ...squad.bench];
  const ownedIds = new Set(owned.map((p) => p.id));
  const clubCount = new Map<ClubCode, number>();
  for (const p of owned) clubCount.set(p.club, (clubCount.get(p.club) ?? 0) + 1);

  const swaps: { out: Player; in: Player; gain: number }[] = [];
  for (const outP of owned) {
    const budget = outP.p + bank;
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const cand of allPlayers) {
      if (cand.pos !== outP.pos) continue;
      if (ownedIds.has(cand.id)) continue;
      if (cand.p > budget) continue;
      // 3-per-club: a different-club candidate must not become the 4th from its club;
      // a same-club swap frees a slot, so it's always valid.
      if (cand.club !== outP.club && (clubCount.get(cand.club) ?? 0) >= 3) continue;
      const s = score3(cand, projMaps);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    if (!best) continue;
    const gain = bestScore - score3(outP, projMaps);
    if (gain > 0) swaps.push({ out: outP, in: best, gain });
  }

  swaps.sort((a, b) => b.gain - a.gain);

  const seenIn = new Set<string>();
  const result: TransferSuggestion[] = [];
  for (const s of swaps) {
    if (s.gain < MIN_TRANSFER_GAIN) continue;
    if (seenIn.has(s.in.id)) continue; // dedupe by incoming target
    seenIn.add(s.in.id);
    result.push({
      id: `xfer-${s.out.id}-${s.in.id}`,
      out: s.out.name,
      outClub: s.out.club,
      in: s.in.name,
      inClub: s.in.club,
      gain: `+${round1(s.gain).toFixed(1)} pts`,
      detail: transferDetail(s.out, s.in, fixturesByClub),
    });
    if (result.length === 3) break;
  }
  return result;
}
