import {
  liveStatsById,
  deriveSubState,
  cardsFor,
  pitchEventFields,
  type RawLiveElement,
} from '@/api/liveStats';

const raw = (id: number, over: Partial<RawLiveElement['stats']> = {}): RawLiveElement => ({
  id,
  stats: {
    total_points: 0, minutes: 0, starts: 0, goals_scored: 0,
    assists: 0, yellow_cards: 0, red_cards: 0, bonus: 0, ...over,
  },
});

describe('liveStatsById', () => {
  it('maps element id → LivePlayerStat with started derived from starts', () => {
    const m = liveStatsById([
      raw(401, { total_points: 14, minutes: 90, starts: 1, goals_scored: 1, bonus: 3 }),
      raw(233, { total_points: 9, minutes: 24, starts: 0, assists: 1 }),
    ]);
    expect(m.get(401)).toEqual({
      points: 14, minutes: 90, started: true, goals: 1,
      assists: 0, yellow: 0, red: 0, bonus: 3,
    });
    expect(m.get(233)?.started).toBe(false);
    expect(m.size).toBe(2);
  });
});

describe('deriveSubState', () => {
  it('returns nothing until the gameweek is finished', () => {
    expect(deriveSubState({ started: true, minutes: 70 }, false)).toEqual({});
  });
  it('flags a subbed-off starter with the minute they came off', () => {
    expect(deriveSubState({ started: true, minutes: 72 }, true)).toEqual({ sub: 72 });
  });
  it('treats a full 90 (incl. stoppage cap) as no sub', () => {
    expect(deriveSubState({ started: true, minutes: 90 }, true)).toEqual({});
  });
  it('treats a 0-minute starter as no sub', () => {
    expect(deriveSubState({ started: true, minutes: 0 }, true)).toEqual({});
  });
  it('flags a sub coming on at 90 − minutes', () => {
    expect(deriveSubState({ started: false, minutes: 25 }, true)).toEqual({ subIn: 65 });
  });
  it('clamps a stoppage-time sub-on to at least 1', () => {
    expect(deriveSubState({ started: false, minutes: 90 }, true)).toEqual({ subIn: 1 });
  });
});

describe('cardsFor', () => {
  it('orders reds after yellows so red paints on top', () => {
    expect(cardsFor({ yellow: 1, red: 1 })).toEqual(['yellow', 'red']);
    expect(cardsFor({ yellow: 0, red: 1 })).toEqual(['red']);
    expect(cardsFor({ yellow: 0, red: 0 })).toEqual([]);
  });
});

describe('pitchEventFields', () => {
  it('omits zero stats and folds in sub state', () => {
    const stat = liveStatsById([
      raw(1, { goals_scored: 2, assists: 1, bonus: 3, starts: 1, minutes: 80 }),
    ]).get(1)!;
    expect(pitchEventFields(stat, true)).toEqual({
      goals: 2, assists: 1, bonus: 3, cards: undefined, sub: 80,
    });
  });
  it('emits undefined for an empty stat line', () => {
    const stat = liveStatsById([raw(1)]).get(1)!;
    expect(pitchEventFields(stat, true)).toEqual({
      goals: undefined, assists: undefined, bonus: undefined, cards: undefined,
    });
  });
});
