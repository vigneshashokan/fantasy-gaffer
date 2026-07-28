// TS port of model/seed.py — GW1 cold-start seeding (#212). Pure; no I/O.
//
// Synthesizes SEED_ROWS pseudo-fixture rows from element-summary.history_past
// season aggregates. Those rows are prepended to a player's real history and
// consumed by the UNCHANGED feature builder, so the existing exp-decay blend
// phases the prior out as real gameweeks arrive. Keep IN SYNC with seed.py;
// the `seed` block of the golden parity fixture guards it.
import {
  FORM_STATS,
  NEWCOMER_K,
  SEASON_WEIGHTS,
  SEED_DENOMINATOR,
  SEED_DEPTH,
  SEED_ROWS,
} from '../feature-spec.ts';
import type { HistoryRow } from './features.ts';

export type SeedRates = Record<string, number>;
export type SeedRow = HistoryRow;

export interface SeasonAggregate {
  starts: number;
  end_cost: number;
  element_code: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  threat: number;
  creativity: number;
  influence: number;
  bps: number;
  defensive_contribution: number;
  total_points: number;
}

export interface NewcomerPoolEntry {
  position: string;
  end_cost: number;
  element_code: number;
  rates: SeedRates;
}

/** seasons: season-aggregate rows, MOST RECENT FIRST. Uses up to SEED_DEPTH. */
export function blendRates(seasons: SeasonAggregate[]): SeedRates | null {
  const use = seasons.slice(0, SEED_DEPTH);
  if (use.length === 0) return null;
  const w = SEASON_WEIGHTS.slice(0, use.length);
  const total = w.reduce((a, b) => a + b, 0);
  const weights = w.map((x) => x / total);

  const out: SeedRates = {};
  for (const stat of FORM_STATS) {
    out[stat] = weights.reduce(
      (sum, wi, i) => sum + wi * (Number(use[i][stat as keyof SeasonAggregate]) / SEED_DENOMINATOR),
      0,
    );
  }
  // Fractional on purpose: xmin is mean(starts) over the window, so this IS
  // the availability signal. Do not round it.
  out.starts = weights.reduce(
    (sum, wi, i) => sum + wi * (Number(use[i].starts) / SEED_DENOMINATOR),
    0,
  );
  return out;
}

/**
 * SEED_ROWS identical rows shaped like player_gw_history.
 *
 * gw=0 puts them below every real gameweek under the existing descending
 * (gw, fixture_id) sort, so real rows always fill the window first.
 * fixture_id is negative and distinct only to keep that sort total.
 */
export function pseudoRows(rates: SeedRates | null): SeedRow[] {
  if (rates === null) return [];
  const rows: SeedRow[] = [];
  for (let i = 0; i < SEED_ROWS; i++) {
    rows.push({
      gw: 0,
      fixture_id: -(i + 1),
      starts: rates.starts,
      expected_goals: rates.expected_goals,
      expected_assists: rates.expected_assists,
      expected_goal_involvements: rates.expected_goal_involvements,
      threat: rates.threat,
      creativity: rates.creativity,
      influence: rates.influence,
      bps: rates.bps,
      defensive_contribution: rates.defensive_contribution,
      total_points: rates.total_points,
    });
  }
  return rows;
}

/**
 * k-nearest-by-price prior for a player with no prior-season history.
 *
 * pool entries carry {position, end_cost, element_code, rates} for every
 * player that DOES have blended rates. Reference price is last season's
 * end_cost; the newcomer is matched on now_cost.
 *
 * The sort key is a TOTAL order: (|dist|, end_cost, element_code). Two
 * players equidistant AND at the same price must resolve identically here
 * and in seed.py, or the parity fixture flakes — do not drop the third key
 * and do not rely on Array.prototype.sort's stability to break ties.
 */
export function newcomerRates(
  position: string,
  nowCost: number,
  pool: NewcomerPoolEntry[],
): SeedRates | null {
  const same = pool.filter((p) => p.position === position);
  if (same.length === 0) return null;

  const sorted = [...same]
    .sort((a, b) => {
      const da = Math.abs(a.end_cost - nowCost);
      const db = Math.abs(b.end_cost - nowCost);
      if (da !== db) return da - db;
      if (a.end_cost !== b.end_cost) return a.end_cost - b.end_cost;
      return a.element_code - b.element_code;
    })
    .slice(0, NEWCOMER_K);

  const n = sorted.length;
  const keys: string[] = [...FORM_STATS, 'starts'];
  const out: SeedRates = {};
  for (const k of keys) {
    out[k] = sorted.reduce((sum, p) => sum + Number(p.rates[k]), 0) / n;
  }
  return out;
}
