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

export function upcomingGws(events: EventLite[], max = 38): number[] {
  const cur = events.find((e) => e.is_current) ?? events.find((e) => e.is_next);
  const start = cur ? cur.id : 1;
  const gws: number[] = [];
  for (let g = start; g <= Math.min(max, start + 2); g++) gws.push(g);
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

    const [playersRes, clubsRes, fixturesRes, historyRows] = await Promise.all([
      deps.supabase.from('players').select('id, position, team_id, now_cost'),
      deps.supabase.from('clubs').select(
        'id, strength_defence_home, strength_defence_away, strength_attack_home, strength_attack_away',
      ),
      deps.supabase.from('fixtures').select('event, team_h, team_a').in('event', gws),
      fetchSeasonHistory(deps.supabase, season),
    ]);
    for (const r of [playersRes, clubsRes, fixturesRes]) {
      if (r.error) throw r.error;
    }

    // Pre-season and immediately after rollover the new season has no finished
    // gameweeks, so every feature row would be near-intercept noise. Writing
    // that displaces the documented empty-table behaviour, where the client
    // falls back to FPL's ep_next. Serving nothing is the honest state.
    if (historyRows.length === 0) {
      await skipRun(deps.supabase, runId, 'no-history-for-season');
      return Response.json(
        { ok: true, runId, season, gws, rows: 0, skipped: 'no-history-for-season' },
        { status: 200 },
      );
    }

    const players: PlayerInput[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: num(p.id),
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

    const rows = buildProjections({
      players, historyByPlayer, fixturesByGw, clubStrengths, artifact, gws,
    });
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
