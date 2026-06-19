import { benchBoostTip, freeHitTip, wildcardTip, tripleCaptainTip, computeChipAdvice, attachChipTips } from '@/utils/chipAdvice';
import type { Player, TransferChip } from '@/types/fpl';
import type { SeasonFixtures } from '@/api/fixtures';
import type { ProjectionStat } from '@/api/projections';

function pl(id: string, club: string, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, pos: 'MID', club: club as Player['club'], p: 6, f: 4, tp: 40,
    own: 5, gw: 3, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100, ...over,
  };
}
// gw → club → { count, fdrs }
function sf(entries: Record<number, Record<string, { count: number; fdrs: number[] }>>): SeasonFixtures {
  const m: SeasonFixtures = new Map();
  for (const [gw, clubs] of Object.entries(entries)) m.set(Number(gw), clubs as never);
  return m;
}
function pmap(p50ById: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(p50ById)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

const SQUAD = {
  starters: [pl('a', 'ARS'), pl('b', 'LIV'), pl('c', 'MCI')],
  bench: [pl('d', 'NEW'), pl('e', 'TOT')],
};

describe('benchBoostTip', () => {
  it('recommends the GW with the most doublers (hold) + bench points when near', () => {
    // upcoming 10. GW12: ARS + NEW double. NEW is on the bench → bench points appear.
    const fixtures = sf({
      10: { ARS: { count: 1, fdrs: [3] }, LIV: { count: 1, fdrs: [3] }, MCI: { count: 1, fdrs: [3] }, NEW: { count: 1, fdrs: [3] }, TOT: { count: 1, fdrs: [3] } },
      11: { ARS: { count: 1, fdrs: [3] } },
      12: { ARS: { count: 2, fdrs: [2, 3] }, NEW: { count: 2, fdrs: [2, 3] }, LIV: { count: 1, fdrs: [3] }, MCI: { count: 1, fdrs: [3] }, TOT: { count: 1, fdrs: [3] } },
    });
    const projMaps = [pmap({}), pmap({}), pmap({ d: 4 })]; // GW12 = offset 2; bench 'd' p50 4
    const tip = benchBoostTip(SQUAD, fixtures, 10, projMaps);
    expect(tip.title).toBe('Hold for GW12');
    expect(tip.lines[0]).toContain('2 of your players play twice in GW12');
    expect(tip.lines[1]).toBe('~4 projected from your bench');
  });

  it('returns the graceful copy when no double is scheduled', () => {
    const fixtures = sf({ 10: { ARS: { count: 1, fdrs: [3] } }, 11: { ARS: { count: 1, fdrs: [3] } } });
    const tip = benchBoostTip(SQUAD, fixtures, 10, [pmap({}), pmap({}), pmap({})]);
    expect(tip).toEqual({ title: 'Hold', lines: ['No double gameweek scheduled yet'] });
  });
});

describe('freeHitTip', () => {
  // FH_MIN_PLAYERS is 11, so a realistic 11-player owned list is required: in a
  // normal GW all 11 have fixtures (not a blank); in a blank only some do.
  const ELEVEN_CLUBS = ['ARS', 'LIV', 'MCI', 'CHE', 'MUN', 'NEW', 'TOT', 'AVL', 'NFO', 'BHA', 'BOU'];
  const owned11 = ELEVEN_CLUBS.map((c, i) => pl(`p${i}`, c));
  const playing = (clubs: string[]) =>
    Object.fromEntries(clubs.map((c) => [c, { count: 1, fdrs: [3] }]));
  const allPlay = playing(ELEVEN_CLUBS);

  it('flags the first GW where fewer than 11 of the user players have a fixture', () => {
    const fixtures = sf({ 10: allPlay, 11: playing(ELEVEN_CLUBS.slice(0, 6)) }); // GW11: only 6 play
    const tip = freeHitTip(owned11, fixtures, 10);
    expect(tip.title).toBe('Hold for GW11');
    expect(tip.lines[0]).toContain('Only 6 of your players have a fixture in GW11');
  });

  it('returns the graceful copy when every GW fields a full squad', () => {
    const tip = freeHitTip(owned11, sf({ 10: allPlay, 11: allPlay }), 10);
    expect(tip).toEqual({ title: 'Hold', lines: ['No blank gameweek scheduled'] });
  });
});

describe('wildcardTip', () => {
  it('flags the first GW where more than 5 players face FDR >= 4', () => {
    const six = (fdr: number) => ({
      ARS: { count: 1, fdrs: [fdr] }, LIV: { count: 1, fdrs: [fdr] }, MCI: { count: 1, fdrs: [fdr] },
      NEW: { count: 1, fdrs: [fdr] }, TOT: { count: 1, fdrs: [fdr] }, CHE: { count: 1, fdrs: [fdr] },
    });
    const owned = [pl('a', 'ARS'), pl('b', 'LIV'), pl('c', 'MCI'), pl('d', 'NEW'), pl('e', 'TOT'), pl('f', 'CHE')];
    const fixtures = sf({ 10: six(2), 11: six(5) }); // GW11: all 6 face FDR 5 (>5 players)
    const tip = wildcardTip(owned, fixtures, 10);
    expect(tip.title).toBe('Hold for GW11');
    expect(tip.lines[0]).toContain('6 of your players face hard fixtures in GW11');
  });

  it('returns the balanced copy when no tough run exists', () => {
    const owned = [pl('a', 'ARS'), pl('b', 'LIV')];
    const easy = { ARS: { count: 1, fdrs: [2] }, LIV: { count: 1, fdrs: [2] } };
    expect(wildcardTip(owned, sf({ 10: easy, 11: easy }), 10)).toEqual({
      title: 'Hold', lines: ['Your fixtures look balanced'],
    });
  });

  it('does not fire at exactly 5 players on a hard fixture (strict > threshold)', () => {
    const five = (fdr: number) => ({
      ARS: { count: 1, fdrs: [fdr] }, LIV: { count: 1, fdrs: [fdr] }, MCI: { count: 1, fdrs: [fdr] },
      NEW: { count: 1, fdrs: [fdr] }, TOT: { count: 1, fdrs: [fdr] },
    });
    const owned = [pl('a', 'ARS'), pl('b', 'LIV'), pl('c', 'MCI'), pl('d', 'NEW'), pl('e', 'TOT')];
    expect(wildcardTip(owned, sf({ 10: five(5) }), 10)).toEqual({ title: 'Hold', lines: ['Your fixtures look balanced'] });
  });
});

describe('tripleCaptainTip', () => {
  it('holds for the best near-term asset\'s next double', () => {
    const owned = [pl('star', 'MCI', { name: 'Star' }), pl('x', 'ARS')];
    const fixtures = sf({
      10: { MCI: { count: 1, fdrs: [3] }, ARS: { count: 1, fdrs: [3] } },
      13: { MCI: { count: 2, fdrs: [2, 3] }, ARS: { count: 1, fdrs: [3] } }, // Star (MCI) doubles
    });
    const projMaps = [pmap({ star: 8, x: 3 }), pmap({ star: 8, x: 3 }), pmap({ star: 8, x: 3 })];
    const tip = tripleCaptainTip(owned, fixtures, 10, projMaps);
    expect(tip.title).toBe('Hold for GW13');
    expect(tip.lines[0]).toContain('Star plays twice in GW13');
  });

  it('recommends the near-term best single-player x3 when no double exists', () => {
    const owned = [pl('star', 'MCI', { name: 'Star' }), pl('x', 'ARS')];
    const single = { MCI: { count: 1, fdrs: [3] }, ARS: { count: 1, fdrs: [3] } };
    const projMaps = [pmap({ star: 9, x: 3 }), pmap({ star: 5, x: 3 }), pmap({ star: 5, x: 3 })];
    const tip = tripleCaptainTip(owned, sf({ 10: single, 11: single, 12: single }), 10, projMaps);
    expect(tip.title).toBe('Use this GW'); // best single p50 (Star 9) is in the upcoming GW
    expect(tip.lines[0]).toContain('Star ~27 pts (×3) in GW10'); // 9 × 3
  });

  it('returns the graceful copy when there are no projections (cold start)', () => {
    const owned = [pl('star', 'MCI', { name: 'Star' })];
    const single = { MCI: { count: 1, fdrs: [3] } };
    expect(tripleCaptainTip(owned, sf({ 10: single }), 10, [pmap({}), pmap({}), pmap({})])).toEqual({
      title: 'Hold', lines: ['No standout fixture yet'],
    });
  });
});

describe('computeChipAdvice', () => {
  it('produces a tip for each of the four chips', () => {
    const single = { MCI: { count: 1, fdrs: [3] }, ARS: { count: 1, fdrs: [3] } };
    const advice = computeChipAdvice({
      squad: { starters: [pl('star', 'MCI', { name: 'Star' })], bench: [pl('x', 'ARS')] },
      upcomingGw: 10,
      seasonFixtures: sf({ 10: single, 11: single }),
      projMaps: [pmap({ star: 6 }), pmap({}), pmap({})],
    });
    expect(Object.keys(advice).sort()).toEqual(['Bench Boost', 'Free Hit', 'Triple Captain', 'Wildcard']);
    expect(advice['Bench Boost'].title).toBe('Hold'); // no double scheduled
    expect(advice['Triple Captain'].lines[0]).toContain('Star'); // best asset
  });
});

describe('attachChipTips', () => {
  it('attaches tips to idle chips by name and leaves used chips untouched', () => {
    const advice = {
      Wildcard: { title: 'Hold', lines: ['x'] },
      'Free Hit': { title: 'Hold', lines: ['x'] },
      'Bench Boost': { title: 'Use this GW', lines: ['y'] },
      'Triple Captain': { title: 'Hold', lines: ['x'] },
    };
    const chips: TransferChip[] = [
      { name: 'Bench Boost', state: 'idle', status: 'Available' },
      { name: 'Wildcard', state: 'used', status: 'Used', playedGw: 8 },
    ];
    const out = attachChipTips(chips, advice);
    expect(out[0].tip).toEqual({ title: 'Use this GW', lines: ['y'] }); // idle → tip
    expect(out[1].tip).toBeUndefined(); // used → no tip
  });
});
