// src/utils/gafferAdvice.ts
//
// The decision layer: pure functions that turn the user's 15-man squad +
// served projections + current availability into advisory best-XI, bench
// order, captain ranking, and sub suggestions. No React, no I/O — fully
// unit-tested. Falls back to ep_next (Player.gw) when a projection is absent.

import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';

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
