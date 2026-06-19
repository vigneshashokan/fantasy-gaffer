import { score3, computeTransferAdvice } from '@/utils/transferAdvice';
import type { Player } from '@/types/fpl';
import type { ProjectionStat } from '@/api/projections';
import type { SquadPlayer } from '@/api/squad';

function pl(id: string, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, pos: 'MID', club: 'ARS', p: 6, f: 4, tp: 40, own: 5,
    gw: 3, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100, ...over,
  };
}
function pmap(entries: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(entries)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

function squad(players: Player[]): { starters: SquadPlayer[]; bench: SquadPlayer[] } {
  return { starters: players, bench: [] };
}
function maps3(p50ById: Record<string, number>): Map<string, ProjectionStat>[] {
  const m = pmap(p50ById);
  return [m, m, m]; // same projection each window GW → score3 sums to 3× p50
}

describe('score3', () => {
  it('sums p50 across the projection window, scaled by availability', () => {
    const maps = [pmap({ '1': 5 }), pmap({ '1': 4 }), pmap({ '1': 6 })];
    expect(score3(pl('1'), maps)).toBe(15); // 5+4+6, available → ×1
    expect(score3(pl('1', { status: 'd', chanceNext: 50 }), maps)).toBe(7.5); // ×0.5
  });

  it('sums only the GWs that have a row (blank GW contributes 0)', () => {
    const maps = [pmap({ '1': 5 }), pmap({}), pmap({ '1': 6 })]; // middle GW missing
    expect(score3(pl('1'), maps)).toBe(11);
  });

  it('falls back to ep_next (1-GW proxy) when no row exists in any window GW', () => {
    expect(score3(pl('9', { gw: 4 }), [pmap({}), pmap({}), pmap({})])).toBe(4);
    expect(score3(pl('9', { gw: 4, status: 'i' }), [pmap({})])).toBe(0); // injured → 0
  });
});

describe('computeTransferAdvice', () => {
  it('suggests the best affordable same-position upgrade, ranked by 3-GW gain', () => {
    const owned = [
      pl('weak', { pos: 'DEF', club: 'AVL', p: 4 }),
      pl('ok',   { pos: 'DEF', club: 'LIV', p: 5 }),
    ];
    const up = pl('up', { pos: 'DEF', club: 'BHA', p: 4.5, name: 'Upgrade' });
    const out = computeTransferAdvice({
      squad: squad(owned),
      allPlayers: [...owned, up],
      projMaps: maps3({ weak: 1, ok: 3, up: 6 }), // scores: weak 3, ok 9, up 18
      bank: 2,
      fixturesByClub: { BHA: { opp: 'LIV', h: true } },
    });
    expect(out.length).toBe(1);            // one candidate, deduped by incoming
    expect(out[0].in).toBe('Upgrade');
    expect(out[0].out).toBe('Pweak');      // gain 18−3=15 beats 18−9=9
    expect(out[0].gain).toBe('+15.0 pts');
    expect(out[0].id).toBe('xfer-weak-up');
    expect(out[0].detail).toContain('vs LIV (H)');
    expect(out[0].detail).toContain('Costs £0.5m');
  });

  it('rejects a candidate priced above out.p + bank', () => {
    const owned = [pl('d', { pos: 'DEF', club: 'AVL', p: 4 })];
    const rich = pl('rich', { pos: 'DEF', club: 'BHA', p: 9 });
    const out = computeTransferAdvice({
      squad: squad(owned), allPlayers: [...owned, rich],
      projMaps: maps3({ d: 1, rich: 9 }), bank: 1, // 4 + 1 = 5 < 9
    });
    expect(out).toEqual([]);
  });

  it('does not suggest a candidate that would be a 4th player from one club', () => {
    // 3 LIV owned; a cheap high-scoring LIV candidate can only replace a LIV out.
    const owned = [
      pl('liv1', { pos: 'DEF', club: 'LIV', p: 5 }),
      pl('liv2', { pos: 'MID', club: 'LIV', p: 6 }),
      pl('liv3', { pos: 'FWD', club: 'LIV', p: 7 }),
      pl('avl',  { pos: 'DEF', club: 'AVL', p: 4 }),
    ];
    const livCand = pl('lc', { pos: 'DEF', club: 'LIV', p: 4, name: 'LivCand' });
    const out = computeTransferAdvice({
      squad: squad(owned), allPlayers: [...owned, livCand],
      projMaps: maps3({ liv1: 1, avl: 1, lc: 9 }), bank: 5,
    });
    // Replacing avl (AVL) with livCand (LIV) would make LIV the 4th → rejected.
    expect(out.find((s) => s.out === 'Pavl' && s.in === 'LivCand')).toBeUndefined();
    // livCand may only appear opposite a LIV out (same-club swap keeps the count).
    expect(out.every((s) => s.in !== 'LivCand' || s.outClub === 'LIV')).toBe(true);
  });

  it('prioritizes an injured owned player out; never suggests an injured candidate in', () => {
    const owned = [
      pl('hurt', { pos: 'DEF', club: 'AVL', p: 4, status: 'i' }), // score 0
      pl('fit',  { pos: 'DEF', club: 'LIV', p: 5 }),
    ];
    const goodIn = pl('gi', { pos: 'DEF', club: 'BHA', p: 4.5, name: 'GoodIn' });
    const hurtIn = pl('hi', { pos: 'DEF', club: 'BOU', p: 4.5, name: 'HurtIn', status: 'i' });
    const out = computeTransferAdvice({
      squad: squad(owned), allPlayers: [...owned, goodIn, hurtIn],
      projMaps: maps3({ fit: 3, gi: 5, hi: 9 }), bank: 2, // scores: fit 9, goodIn 15, hurtIn 0 (injured)
    });
    expect(out[0].out).toBe('Phurt');  // injured owned (score 0) → biggest gain
    expect(out[0].in).toBe('GoodIn');  // hurtIn scores 0 despite p50 9
  });

  it('returns empty when no swap clears the gain threshold', () => {
    const owned = [pl('d', { pos: 'DEF', club: 'AVL', p: 4 })];
    const marginal = pl('mg', { pos: 'DEF', club: 'BHA', p: 5, name: 'Marg' });
    const out = computeTransferAdvice({
      squad: squad(owned), allPlayers: [...owned, marginal],
      projMaps: maps3({ d: 3, mg: 3.2 }), bank: 2, // 9.6 − 9 = 0.6 < MIN_TRANSFER_GAIN (1.0)
    });
    expect(out).toEqual([]);
  });

  it('uses the projection fallback in detail when there is no price swing, flag, or fixture', () => {
    const owned = [pl('d', { pos: 'DEF', club: 'AVL', p: 5 })];
    const cand = pl('c', { pos: 'DEF', club: 'BHA', p: 5, name: 'Same' });
    const out = computeTransferAdvice({
      squad: squad(owned), allPlayers: [...owned, cand],
      projMaps: maps3({ d: 1, c: 5 }), bank: 0, // same price; no fixturesByClub passed
    });
    expect(out.length).toBe(1);
    expect(out[0].detail).toBe('Better 3-GW projection');
  });
});
