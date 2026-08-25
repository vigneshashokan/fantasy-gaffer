// NOTE: projection p-values are upserted RAW (not floored); out-of-distribution
// inputs can occasionally yield negative or extreme values. Flooring/calibration
// is a documented v2 lever (tied to the xGI-collinearity finding).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './lib/supabase-admin.ts';
import { authorize } from './lib/auth.ts';
import { errorRun, finishRun, serializeError, skipRun, startRun } from './lib/ingestion-runs.ts';
import { fetchJson } from './lib/fpl-client.ts';
import { artifact } from './lib/scorer.ts';
import { buildProjections, type FixtureLite, type PlayerInput } from './lib/project.ts';
import type { ClubStrength, HistoryRow } from './lib/features.ts';
import {
  blendRates,
  newcomerRates,
  pseudoRows,
  type NewcomerPoolEntry,
  type SeasonAggregate,
  type SeedRates,
} from './lib/seed.ts';
import { SEED_MODEL_VERSION } from './feature-spec.ts';

export interface Deps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

interface EventLite {
  id: number;
  is_current: boolean;
  is_next: boolean;
  deadline_time?: string;
}

// `players` gains `code` for the seed lookup (#212); `player_season_history`
// rows need a `season` label alongside the SeasonAggregate fields to sort and
// group by, which the frozen seed.ts interface itself doesn't carry.
type PlayerRow = PlayerInput & { code: number | null };
type SeasonRow = SeasonAggregate & { season: string };

// FOUR gameweeks, anchored on the current one — deliberately one wider than the
// client's three-gameweek horizon. The two ends anchor differently: this job
// starts at `is_current`, while the decision layer anchors on the NEXT DEADLINE
// (#168), and `is_current` stays on a finished gameweek until that deadline
// passes. So for most of every week the client asks for [t+1, t+2, t+3] while a
// three-wide window here only ever wrote [t, t+1, t+2] — the last gameweek of
// the client's window was permanently absent, `score3` summed two gameweeks
// instead of three, and every transfer gain came out a third short against a
// threshold calibrated on the full width. Silent: an absent projection is a
// legitimate state everywhere downstream, so it degrades instead of erroring.
export function upcomingGws(events: EventLite[], max = 38): number[] {
  const cur = events.find((e) => e.is_current) ?? events.find((e) => e.is_next);
  const start = cur ? cur.id : 1;
  const gws: number[] = [];
  for (let g = start; g <= Math.min(max, start + 3); g++) gws.push(g);
  return gws;
}

// Seasons span Aug–May, so before August the current season began the prior
// calendar year. Mirrors fpl-ingest's currentSeasonLabel (separate Deno bundles
// can't share a module).
export function seasonLabel(d: Date): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

// Which season a gameweek belongs to is a property of ITS DEADLINE, never of
// the wall clock. After the API rolls over (early July) the bootstrap already
// serves the new season's GW1-3 while `now` still says July — labelling from
// `now` would pair new-season element ids with last season's history, and since
// element ids reset every season nearly every player would inherit some other
// player's form. Falls back to `now` only if the event carries no deadline.
export function seasonForGw(events: EventLite[], gw: number, now: Date): string {
  const deadline = events.find((e) => e.id === gw)?.deadline_time;
  return seasonLabel(deadline ? new Date(deadline) : now);
}

const HISTORY_COLUMNS =
  'player_id, gw, fixture_id, starts, expected_goals, expected_assists, ' +
  'expected_goal_involvements, threat, creativity, influence, bps, ' +
  'defensive_contribution, total_points';

const PAGE_SIZE = 1000;
// A season is ~28k rows; this bounds a runaway loop well above that without
// ever silently truncating the way the unpaginated read did.
const MAX_HISTORY_ROWS = 200_000;

// PostgREST caps EVERY read at `max_rows` (1000 here and on hosted) and
// supabase-js does not paginate. Selecting a whole season in one call returned
// an arbitrary 1000-row slice — roughly the earliest rows, i.e. exactly the
// ones the form window does not need — and the model then computed "recent
// form" from stale history with no error anywhere.
export async function fetchSeasonHistory(
  supabase: SupabaseClient,
  season: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('player_gw_history')
      .select(HISTORY_COLUMNS)
      .eq('season', season)
      // Range paging is only stable under a total order. Within a season the
      // primary key is (player_id, fixture_id).
      .order('player_id', { ascending: true })
      .order('fixture_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    // supabase-js can't infer a row type from a runtime column string.
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    // Advance by what actually came back rather than by PAGE_SIZE, so a
    // server-side cap lower than ours can't skip rows; stop on an empty page
    // rather than a short one, for the same reason.
    if (batch.length === 0) break;
    from += batch.length;
    if (rows.length > MAX_HISTORY_ROWS) {
      throw new Error(
        `player_gw_history paging exceeded ${MAX_HISTORY_ROWS} rows for ${season} — refusing to continue`,
      );
    }
  }
  return rows;
}

const SEASON_HISTORY_COLUMNS =
  'season, element_code, end_cost, total_points, minutes, starts, bps, ' +
  'defensive_contribution, influence, creativity, threat, ' +
  'expected_goals, expected_assists, expected_goal_involvements';

// Same PostgREST max_rows cap as fetchSeasonHistory above, and the table
// already holds ~2000 rows (multiple seasons x the player pool) — a plain
// select here would just as silently truncate the seed pool as an
// unpaginated read of player_gw_history truncated the form window (#163).
export async function fetchSeasonAggregates(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('player_season_history')
      .select(SEASON_HISTORY_COLUMNS)
      // PK is (season, element_code); order on it for a stable paging order.
      .order('season', { ascending: true })
      .order('element_code', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length === 0) break;
    from += batch.length;
    if (rows.length > MAX_HISTORY_ROWS) {
      throw new Error(
        `player_season_history paging exceeded ${MAX_HISTORY_ROWS} rows — refusing to continue`,
      );
    }
  }
  return rows;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function defaultDeps(): Deps {
  return { supabase: createAdminClient(), fetch: globalThis.fetch, now: () => new Date() };
}

export async function handler(req: Request, depsOverride?: Deps): Promise<Response> {
  // Gate first: four selects and a projections upsert per call otherwise run
  // for anyone who read the anon key out of the app bundle (#165).
  const denied = authorize(req);
  if (denied) return denied;

  const deps = depsOverride ?? defaultDeps();
  // Opened before the first fetch so a bootstrap failure is recorded too. This
  // is the only trace a nightly run leaves outside the function logs (#194).
  const runId = await startRun(deps.supabase);
  try {
    const boot = await fetchJson<{ events: EventLite[] }>(
      'https://fantasy.premierleague.com/api/bootstrap-static/',
      { fetch: deps.fetch },
    );
    const gws = upcomingGws(boot.events);
    const season = seasonForGw(boot.events, gws[0], deps.now());

    const [playersRes, clubsRes, fixturesRes, historyRows, seasonHistoryRows] = await Promise.all([
      deps.supabase.from('players').select('id, code, position, team_id, now_cost'),
      deps.supabase.from('clubs').select(
        'id, strength_defence_home, strength_defence_away, strength_attack_home, strength_attack_away',
      ),
      deps.supabase.from('fixtures').select('event, team_h, team_a').in('event', gws),
      fetchSeasonHistory(deps.supabase, season),
      fetchSeasonAggregates(deps.supabase),
    ]);
    for (const r of [playersRes, clubsRes, fixturesRes]) {
      if (r.error) throw r.error;
    }

    // Pre-season and immediately after rollover the new season has no finished
    // gameweeks. Where a player has prior-season aggregates we can still seed
    // real features (#212, Step 5 below), so the skip now fires only when
    // there is NOTHING to work from — an unsaturated season-history cron on
    // first deploy must fail safe, not project noise.
    if (historyRows.length === 0 && seasonHistoryRows.length === 0) {
      await skipRun(deps.supabase, runId, 'no-history-or-seeds');
      return Response.json(
        { ok: true, runId, season, gws, rows: 0, skipped: 'no-history-or-seeds' },
        { status: 200 },
      );
    }
    // Seeding REPLACES the history input wholesale — it does not blend with
    // real rows. The gate found blending across GW1-6 regresses GW2-5 against
    // real (even 1-4-row) in-season history, so the instant one real row
    // exists this branch is never taken again; see the Step 5 note in the
    // #212 plan for the measured numbers.
    const seeding = historyRows.length === 0;

    const players: PlayerRow[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: num(p.id),
      code: p.code == null ? null : num(p.code),
      position: String(p.position ?? ''),
      team_id: num(p.team_id),
      now_cost: num(p.now_cost),
    }));
    const clubStrengths: Record<number, ClubStrength> = {};
    for (const c of (clubsRes.data ?? []) as Record<string, number>[]) {
      clubStrengths[c.id] = {
        strength_defence_home: num(c.strength_defence_home),
        strength_defence_away: num(c.strength_defence_away),
        strength_attack_home: num(c.strength_attack_home),
        strength_attack_away: num(c.strength_attack_away),
      };
    }
    const fixturesByGw: Record<number, FixtureLite[]> = {};
    for (const f of (fixturesRes.data ?? []) as FixtureLite[]) {
      (fixturesByGw[f.event] ??= []).push(f);
    }

    const historyByPlayer: Record<number, HistoryRow[]> = {};
    if (seeding) {
      // Seasons most-recent FIRST — blendRates takes the leading SEED_DEPTH,
      // so reversed input would silently seed from the oldest data. Season
      // labels sort lexicographically ('2024/25' < '2025/26'), so descending
      // string order is descending chronological order.
      const seasonsByCode: Record<number, SeasonRow[]> = {};
      for (const r of seasonHistoryRows) {
        const code = num(r.element_code);
        (seasonsByCode[code] ??= []).push({
          season: String(r.season ?? ''),
          starts: num(r.starts),
          end_cost: num(r.end_cost),
          element_code: code,
          expected_goals: num(r.expected_goals),
          expected_assists: num(r.expected_assists),
          expected_goal_involvements: num(r.expected_goal_involvements),
          threat: num(r.threat),
          creativity: num(r.creativity),
          influence: num(r.influence),
          bps: num(r.bps),
          defensive_contribution: num(r.defensive_contribution),
          total_points: num(r.total_points),
        });
      }
      for (const list of Object.values(seasonsByCode)) {
        list.sort((a, b) => (a.season < b.season ? 1 : a.season > b.season ? -1 : 0));
      }

      // Two passes, and the order matters: the newcomer pool must be
      // COMPLETE before any newcomer is resolved against it, or early players
      // would match against a partial pool and the output would depend on
      // iteration order.
      const pool: NewcomerPoolEntry[] = [];
      const ratesByPlayer = new Map<number, SeedRates>();
      for (const p of players) {
        if (p.code == null) continue; // pre-backfill row; self-heals
        const rates = blendRates(seasonsByCode[p.code] ?? []);
        if (!rates) continue;
        ratesByPlayer.set(p.id, rates);
        pool.push({
          position: p.position,
          end_cost: seasonsByCode[p.code][0].end_cost,
          element_code: p.code,
          rates,
        });
      }

      for (const p of players) {
        const rates = ratesByPlayer.get(p.id) ?? newcomerRates(p.position, p.now_cost, pool);
        const seeded = pseudoRows(rates);
        // A plain assignment, not a push: in this branch there is by
        // definition nothing real to append to.
        if (seeded.length > 0) historyByPlayer[p.id] = seeded;
      }
    } else {
      for (const h of historyRows) {
        const pid = num(h.player_id);
        (historyByPlayer[pid] ??= []).push({
          gw: num(h.gw), fixture_id: num(h.fixture_id), starts: num(h.starts),
          expected_goals: num(h.expected_goals), expected_assists: num(h.expected_assists),
          expected_goal_involvements: num(h.expected_goal_involvements), threat: num(h.threat),
          creativity: num(h.creativity), influence: num(h.influence), bps: num(h.bps),
          defensive_contribution: num(h.defensive_contribution), total_points: num(h.total_points),
        });
      }
    }

    // Every row from the seeding branch carries the seed model_version, never
    // v1.0.0 — eval_prospective.py splits arms by model_version, so a seeded
    // row shipping as plain v1 would silently pool with unseeded v1 and mean
    // nothing in the comparison that validates this feature.
    const rows = buildProjections({
      players, historyByPlayer, fixturesByGw, clubStrengths, artifact, gws,
    }).map((r) => (seeding ? { ...r, model_version: SEED_MODEL_VERSION } : r));
    // One timestamp for the whole run, so the stale-row sweep below can compare
    // against it exactly.
    const computedAt = deps.now().toISOString();
    const stamped = rows.map((r) => ({ ...r, computed_at: computedAt }));
    if (stamped.length > 0) {
      const up = await deps.supabase.from('projections').upsert(stamped, { onConflict: 'player_id,gw' });
      if (up.error) throw up.error;

      // `projections` is keyed (player_id, gw) with no season column, so at a
      // rollover the rows of players who existed last season but not this one
      // are never overwritten — and the client, which joins on the CURRENT
      // bootstrap's element ids, can read them as though they were fresh.
      // Anything this run did not refresh for these gameweeks is stale.
      const del = await deps.supabase.from('projections').delete()
        .in('gw', gws)
        .lt('computed_at', computedAt);
      if (del.error) throw del.error;
    }
    await finishRun(deps.supabase, runId, stamped.length);
    return Response.json({ ok: true, runId, season, gws, rows: stamped.length }, { status: 200 });
  } catch (err) {
    console.error('[fpl-project] handler caught:', err);
    await errorRun(deps.supabase, runId, err);
    // serializeError, not String(err): a PostgREST error is a plain object and
    // would otherwise stringify to [object Object].
    return Response.json({ ok: false, runId, error: serializeError(err) }, { status: 500 });
  }
}

if (import.meta.main) Deno.serve((req) => handler(req));
