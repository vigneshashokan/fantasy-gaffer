// src/api/liveStats.ts
//
// Pure transforms over the FPL /event/{gw}/live/ element stats. No network or
// supabase imports here, so the sub/card derivation is unit-testable in
// isolation; fixtures.ts owns the fetch and squad.ts consumes these helpers.

export interface RawLiveElement {
  id: number;
  stats: {
    total_points: number;
    minutes: number;
    starts: number;
    goals_scored: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    bonus: number;
  };
}

export interface LivePlayerStat {
  points: number;
  minutes: number;
  started: boolean;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  bonus: number;
}

// The subset of PitchPlayer fields derived from a live stat row. Kept local so
// this module stays decoupled from the (later-changing) PitchPlayer type; the
// names/types match, so squad.ts can spread the result onto a PitchPlayer.
export interface PitchEventFields {
  goals?: number;
  assists?: number;
  bonus?: number;
  cards?: Array<'yellow' | 'red'>;
  sub?: number;
  subIn?: number;
}

export function liveStatsById(elements: RawLiveElement[]): Map<number, LivePlayerStat> {
  const out = new Map<number, LivePlayerStat>();
  for (const e of elements) {
    const s = e.stats;
    out.set(e.id, {
      points: s.total_points,
      minutes: s.minutes,
      started: s.starts > 0,
      goals: s.goals_scored,
      assists: s.assists,
      yellow: s.yellow_cards,
      red: s.red_cards,
      bonus: s.bonus,
    });
  }
  return out;
}

// FPL exposes total minutes + a `starts` flag, never the substitution minute.
// We infer direction from `starts`, approximate the minute from `minutes`, and
// only commit once the GW is finished (a still-playing starter must not read as
// subbed). FPL caps minutes at 90, so a stoppage-time sub-off reads as a full
// match (minutes === 90) and never trips the `< 90` sub-off branch.
export function deriveSubState(
  stat: Pick<LivePlayerStat, 'started' | 'minutes'>,
  gwFinished: boolean,
): { sub?: number; subIn?: number } {
  if (!gwFinished) return {};
  const { started, minutes } = stat;
  if (started && minutes > 0 && minutes < 90) return { sub: minutes };
  if (!started && minutes > 0) return { subIn: Math.max(1, 90 - minutes) };
  return {};
}

// Reds last so they paint on top of an earlier yellow.
export function cardsFor(stat: Pick<LivePlayerStat, 'yellow' | 'red'>): Array<'yellow' | 'red'> {
  const cards: Array<'yellow' | 'red'> = [];
  for (let i = 0; i < stat.yellow; i++) cards.push('yellow');
  for (let i = 0; i < stat.red; i++) cards.push('red');
  return cards;
}

// Goals/assists/cards/bonus are live-correct; sub state gates on gwFinished.
// Zero counts become undefined so the badges don't render for them.
export function pitchEventFields(stat: LivePlayerStat, gwFinished: boolean): PitchEventFields {
  const cards = cardsFor(stat);
  return {
    goals: stat.goals || undefined,
    assists: stat.assists || undefined,
    bonus: stat.bonus || undefined,
    cards: cards.length ? cards : undefined,
    ...deriveSubState(stat, gwFinished),
  };
}
