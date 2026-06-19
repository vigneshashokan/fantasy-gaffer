// src/utils/gafferAdvice.ts
//
// The decision layer: pure functions that turn the user's 15-man squad +
// served projections + current availability into advisory best-XI, bench
// order, captain ranking, and sub suggestions. No React, no I/O — fully
// unit-tested. Falls back to ep_next (Player.gw) when a projection is absent.

import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';
import type { CaptainPick, ClubCode, Suggestion } from '@/types/fpl';

const HARD_OUT: ReadonlySet<string> = new Set(['i', 's', 'u', 'n']);

const round1 = (n: number): number => Math.round(n * 10) / 10;

// status → availability multiplier on the projection.
//   hard-out ('i'|'s'|'u'|'n') → 0
//   otherwise: chanceNext != null ? chanceNext/100 : 1.0
export function availabilityFactor(p: SquadPlayer): number {
  if (HARD_OUT.has(p.status)) return 0;
  return p.chanceNext != null ? p.chanceNext / 100 : 1;
}

function projOf(p: SquadPlayer, proj: Map<string, ProjectionStat>, q: 'p50' | 'p75'): number {
  const row = proj.get(p.id);
  return row ? row[q] : p.gw; // ep_next fallback
}

export function adjusted(
  p: SquadPlayer,
  proj: Map<string, ProjectionStat>,
  q: 'p50' | 'p75',
): number {
  return availabilityFactor(p) * projOf(p, proj, q);
}

// Valid FPL outfield formations as [DEF, MID, FWD]; each sums to 10 (+1 GK).
const VALID_FORMATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 2, 3], [5, 3, 2], [5, 4, 1],
];

interface Ranked {
  p: SquadPlayer;
  adj: number;
}

// Deterministic ordering: adjusted p50 desc, then ep_next desc, then id asc.
function rankByAdj(players: SquadPlayer[], proj: Map<string, ProjectionStat>): Ranked[] {
  return players
    .map((p) => ({ p, adj: adjusted(p, proj, 'p50') }))
    .sort((a, b) => b.adj - a.adj || b.p.gw - a.p.gw || a.p.id.localeCompare(b.p.id));
}

function sumTop(ranked: Ranked[], n: number): number {
  let s = 0;
  for (let i = 0; i < n && i < ranked.length; i++) s += ranked[i].adj;
  return s;
}

export function optimalLineup(
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] },
  proj: Map<string, ProjectionStat>,
): { starterIds: string[]; benchIds: string[] } {
  const all = [...squad.starters, ...squad.bench];
  const gks = rankByAdj(all.filter((p) => p.pos === 'GKP'), proj);
  const defs = rankByAdj(all.filter((p) => p.pos === 'DEF'), proj);
  const mids = rankByAdj(all.filter((p) => p.pos === 'MID'), proj);
  const fwds = rankByAdj(all.filter((p) => p.pos === 'FWD'), proj);

  const startGk = gks[0];
  let best: { def: number; mid: number; fwd: number; total: number } | null = null;
  for (const [nd, nm, nf] of VALID_FORMATIONS) {
    if (defs.length < nd || mids.length < nm || fwds.length < nf) continue;
    const total = sumTop(defs, nd) + sumTop(mids, nm) + sumTop(fwds, nf) + (startGk?.adj ?? 0);
    if (!best || total > best.total) best = { def: nd, mid: nm, fwd: nf, total };
  }
  // Defensive fallback for a malformed squad with no satisfiable formation.
  const f = best ?? {
    def: Math.min(defs.length, 4),
    mid: Math.min(mids.length, 4),
    fwd: Math.min(fwds.length, 2),
    total: 0,
  };

  const starterRanked: Ranked[] = [
    ...(startGk ? [startGk] : []),
    ...defs.slice(0, f.def),
    ...mids.slice(0, f.mid),
    ...fwds.slice(0, f.fwd),
  ];
  const starterIds = starterRanked.map((r) => r.p.id);
  const starterSet = new Set(starterIds);

  const benchGk = gks.slice(1).map((r) => r.p.id); // reserve keeper(s) first
  const benchOutfield = [...defs, ...mids, ...fwds]
    .filter((r) => !starterSet.has(r.p.id))
    .sort((a, b) => b.adj - a.adj || b.p.gw - a.p.gw || a.p.id.localeCompare(b.p.id))
    .map((r) => r.p.id);

  return { starterIds, benchIds: [...benchGk, ...benchOutfield] };
}

// p75 − p50 gap above which a captain is flagged high-variance. Tunable v1 lever.
const SPREAD_THRESHOLD = 1.5;

function tagFor(spread: number): 'explosive' | 'safe' {
  return spread >= SPREAD_THRESHOLD ? 'explosive' : 'safe';
}

function fixtureLabel(
  p: SquadPlayer,
  fixturesByClub?: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>>,
): string {
  const fx = fixturesByClub?.[p.club];
  return fx ? `vs ${fx.opp} (${fx.h ? 'H' : 'A'})` : '';
}

// Note built from client-available signals only: fixture, ceiling, variance tag.
function captainNote(
  p: SquadPlayer,
  proj: Map<string, ProjectionStat>,
  fixturesByClub?: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>>,
): string {
  const fx = fixtureLabel(p, fixturesByClub);
  if (!proj.has(p.id)) return fx; // ep_next fallback — fixture only (may be empty)
  const ceiling = adjusted(p, proj, 'p75');
  const spread = ceiling - adjusted(p, proj, 'p50');
  return [fx, `ceiling ${ceiling.toFixed(1)}`, tagFor(spread)].filter(Boolean).join(' · ');
}

export function captainPicksFrom(
  starters: SquadPlayer[],
  proj: Map<string, ProjectionStat>,
  fixturesByClub?: Partial<Record<ClubCode, { opp: ClubCode; h: boolean }>>,
): CaptainPick[] {
  return starters
    .map((p) => ({ p, score: adjusted(p, proj, 'p50') * 2 }))
    .sort((a, b) => b.score - a.score || b.p.gw - a.p.gw || a.p.id.localeCompare(b.p.id))
    .slice(0, 3)
    .map(({ p, score }) => ({
      name: p.name,
      club: p.club,
      xp: round1(score),
      note: captainNote(p, proj, fixturesByClub),
    }));
}

function subReason(p: SquadPlayer): string {
  switch (p.status) {
    case 'i': return 'Injured';
    case 's': return 'Suspended';
    case 'u':
    case 'n': return 'Unavailable';
    default:
      if (p.chanceNext != null && p.chanceNext < 100) return `Doubtful ${p.chanceNext}%`;
      return 'Better projection';
  }
}

// The diff between the user's current starters and the optimal XI: each current
// starter not in the optimal XI is paired (weakest-out with strongest-in) with a
// promoted bench player, surfaced as a "Bench X for Y" suggestion with the gain.
export function subSuggestions(
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] },
  optimalStarterIds: string[],
  proj: Map<string, ProjectionStat>,
): Suggestion[] {
  const optimalSet = new Set(optimalStarterIds);
  const outgoing = squad.starters
    .filter((p) => !optimalSet.has(p.id))
    .sort((a, b) => adjusted(a, proj, 'p50') - adjusted(b, proj, 'p50')); // worst first
  const incoming = squad.bench
    .filter((p) => optimalSet.has(p.id))
    .sort((a, b) => adjusted(b, proj, 'p50') - adjusted(a, proj, 'p50')); // best first

  const n = Math.min(outgoing.length, incoming.length);
  const pairs: { out: SquadPlayer; in: SquadPlayer; gain: number }[] = [];
  for (let i = 0; i < n; i++) {
    const gain = adjusted(incoming[i], proj, 'p50') - adjusted(outgoing[i], proj, 'p50');
    if (gain > 0) pairs.push({ out: outgoing[i], in: incoming[i], gain });
  }
  pairs.sort((a, b) => b.gain - a.gain);

  return pairs.map(({ out, in: inn, gain }) => ({
    id: `sub-${out.id}-${inn.id}`,
    type: 'sub' as const,
    text: `Bench ${out.name} for ${inn.name}`,
    detail: subReason(out),
    gain: `+${round1(gain).toFixed(1)} pts`,
    wasApplied: false,
  }));
}
