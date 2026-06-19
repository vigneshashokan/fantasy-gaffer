import { availabilityFactor, adjusted, optimalLineup } from '@/utils/gafferAdvice';
import type { Player } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';

// Test helpers — reused by later tasks in this file.
export function sp(id: string, pos: Player['pos'], extra: Partial<Player> = {}): SquadPlayer {
  return {
    id, name: `P${id}`, pos, club: 'ARS', p: 5, f: 4, tp: 30, own: 5,
    gw: 2, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100,
    ...extra,
  };
}
// p50 = value; symmetric band p25=v-1, p75=v+1.
export function projMap(entries: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(entries)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

describe('availabilityFactor', () => {
  it('is 0 for hard-out statuses (injured/suspended/unavailable/ineligible)', () => {
    expect(availabilityFactor(sp('1', 'MID', { status: 'i' }))).toBe(0);
    expect(availabilityFactor(sp('2', 'MID', { status: 's' }))).toBe(0);
    expect(availabilityFactor(sp('3', 'MID', { status: 'u' }))).toBe(0);
    expect(availabilityFactor(sp('4', 'MID', { status: 'n' }))).toBe(0);
  });
  it('uses chance_of_playing / 100 when a chance is set', () => {
    expect(availabilityFactor(sp('5', 'MID', { status: 'd', chanceNext: 25 }))).toBe(0.25);
    expect(availabilityFactor(sp('6', 'MID', { status: 'a', chanceNext: 75 }))).toBe(0.75);
  });
  it('defaults to 1.0 for a non-hard-out status with no chance set', () => {
    expect(availabilityFactor(sp('7', 'MID', { status: 'a', chanceNext: null }))).toBe(1);
    expect(availabilityFactor(sp('8', 'MID', { status: 'd', chanceNext: null }))).toBe(1);
  });
});

describe('adjusted', () => {
  it('multiplies the requested quantile by the availability factor', () => {
    const proj = projMap({ '1': 10 }); // p50 10, p75 11
    expect(adjusted(sp('1', 'FWD'), proj, 'p50')).toBe(10);
    expect(adjusted(sp('1', 'FWD'), proj, 'p75')).toBe(11);
    expect(adjusted(sp('1', 'FWD', { status: 'd', chanceNext: 50 }), proj, 'p50')).toBe(5);
  });
  it('falls back to ep_next (gw) when no projection row exists', () => {
    expect(adjusted(sp('9', 'MID', { gw: 6 }), new Map(), 'p50')).toBe(6);
    expect(adjusted(sp('9', 'MID', { gw: 6, status: 'i' }), new Map(), 'p50')).toBe(0);
  });
});

// A realistic 15-man squad: 2 GKP, 5 DEF, 5 MID, 3 FWD.
// DEFs are weak so 3-at-the-back is optimal; d1 is injured (adj 0).
function squad15() {
  const all = [
    sp('g1', 'GKP'), sp('g2', 'GKP'),
    sp('d1', 'DEF', { status: 'i' }), sp('d2', 'DEF'), sp('d3', 'DEF'),
    sp('d4', 'DEF'), sp('d5', 'DEF'),
    sp('m1', 'MID'), sp('m2', 'MID'), sp('m3', 'MID'), sp('m4', 'MID'), sp('m5', 'MID'),
    sp('f1', 'FWD'), sp('f2', 'FWD'), sp('f3', 'FWD'),
  ];
  const proj = projMap({
    g1: 5, g2: 3,
    d1: 8, d2: 3, d3: 2.5, d4: 2, d5: 1.5,
    m1: 9, m2: 8, m3: 7, m4: 6, m5: 5,
    f1: 10, f2: 9, f3: 8,
  });
  // First 11 by id order are "current" starters; rest bench (shape only).
  return { squad: { starters: all.slice(0, 11), bench: all.slice(11) }, proj };
}

describe('optimalLineup', () => {
  it('returns 11 starters in a valid FPL formation with exactly one keeper', () => {
    const { squad, proj } = squad15();
    const { starterIds } = optimalLineup(squad, proj);
    expect(starterIds).toHaveLength(11);
    const byId = new Map([...squad.starters, ...squad.bench].map((p) => [p.id, p]));
    const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
    for (const id of starterIds) counts[byId.get(id)!.pos]++;
    expect(counts.GKP).toBe(1);
    expect(counts.DEF).toBeGreaterThanOrEqual(3);
    expect(counts.DEF).toBeLessThanOrEqual(5);
    expect(counts.MID).toBeGreaterThanOrEqual(2);
    expect(counts.MID).toBeLessThanOrEqual(5);
    expect(counts.FWD).toBeGreaterThanOrEqual(1);
    expect(counts.FWD).toBeLessThanOrEqual(3);
  });

  it('excludes an injured high-projection player via availability weighting', () => {
    const { squad, proj } = squad15();
    const { starterIds } = optimalLineup(squad, proj);
    // d1 has the highest raw p50 (8) but status 'i' → adj 0 → benched.
    expect(starterIds).not.toContain('d1');
    // The keeper and top attackers start.
    expect(starterIds).toContain('g1');
    expect(starterIds).toContain('f1');
    expect(starterIds).toContain('m1');
  });

  it('orders the bench with the reserve keeper first, then outfield by adjusted p50', () => {
    const { squad, proj } = squad15();
    const { benchIds } = optimalLineup(squad, proj);
    expect(benchIds).toHaveLength(4);
    expect(benchIds[0]).toBe('g2'); // reserve GK pinned to slot 1
    // remaining bench are outfield, sorted by adjusted p50 desc (m5=5 > d5=1.5 > d1=0)
    expect(benchIds.slice(1)).toEqual(['m5', 'd5', 'd1']);
  });
});
