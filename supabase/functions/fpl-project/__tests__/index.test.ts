import { assertEquals, assertRejects } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSeasonHistory, handler, seasonForGw, seasonLabel, upcomingGws } from '../index.ts';

// #165 — the handlers now require a shared secret. Tests set it and send it;
// the gate itself is covered separately in auth.test.ts.
const TEST_SECRET = 'test-ingest-secret';
Deno.env.set('INGEST_SHARED_SECRET', TEST_SECRET);
const authed = (url: string) =>
  new Request(url, { headers: { 'x-ingest-secret': TEST_SECRET } });

type Row = Record<string, unknown>;

interface Recorder {
  upserts: { table: string; rows: unknown[] }[];
  deletes: { table: string; gws: unknown; before: unknown }[];
  ranges: [number, number][];
  // #194: ingestion_runs rows — one insert to open the run, one update to close it.
  runs: Row[];
  runPatches: Row[];
}

/**
 * Minimal stand-in for the supabase-js query builder.
 *
 * `historyPages` is indexed by call order, so a test can hand back a full page
 * followed by a short one and prove the handler kept paging.
 */
function makeSupabase(
  selects: Record<string, Row[]>,
  rec: Recorder,
  historyPages?: Row[][],
  upsertError?: Row,
): SupabaseClient {
  let historyCall = 0;
  return {
    from: (table: string) => ({
      select: () => {
        // deno-lint-ignore no-explicit-any
        const self: any = {
          eq: () => self,
          in: () => Promise.resolve({ data: selects[table] ?? [], error: null }),
          order: () => self,
          range: (from: number, to: number) => {
            rec.ranges.push([from, to]);
            const page = historyPages
              ? (historyPages[historyCall++] ?? [])
              : (historyCall++ === 0 ? (selects[table] ?? []) : []);
            return Promise.resolve({ data: page, error: null });
          },
          then: (r: (v: { data: Row[]; error: null }) => void) =>
            r({ data: selects[table] ?? [], error: null }),
        };
        return self;
      },
      upsert: (rows: unknown[]) => {
        rec.upserts.push({ table, rows });
        return Promise.resolve({ error: upsertError ?? null });
      },
      insert: (row: Row) => {
        rec.runs.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: `run-${rec.runs.length}` }, error: null }),
          }),
        };
      },
      update: (patch: Row) => ({
        eq: (_col: string, id: unknown) => {
          rec.runPatches.push({ ...patch, id });
          return Promise.resolve({ error: null });
        },
      }),
      delete: () => ({
        in: (_col: string, gws: unknown) => ({
          lt: (_c: string, before: unknown) => {
            rec.deletes.push({ table, gws, before });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const recorder = (): Recorder => ({
  upserts: [],
  deletes: [],
  ranges: [],
  runs: [],
  runPatches: [],
});

const historyRow = (player_id: number, gw: number, fixture_id: number): Row => ({
  player_id,
  gw,
  fixture_id,
  starts: 1,
  total_points: 5,
  expected_goals: 0.2,
  expected_assists: 0.1,
  expected_goal_involvements: 0.3,
  threat: 20,
  creativity: 10,
  influence: 15,
  bps: 20,
  defensive_contribution: 2,
});

const BASE_SELECTS: Record<string, Row[]> = {
  players: [{ id: 7, position: 'MID', team_id: 1, now_cost: 70 }],
  clubs: [
    { id: 1, strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
    { id: 2, strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
  ],
  fixtures: [{ event: 10, team_h: 1, team_a: 2 }],
  player_gw_history: [historyRow(7, 9, 90)],
};

const bootFetch = (events: Row[]) =>
  (() => Promise.resolve(new Response(JSON.stringify({ events })))) as typeof globalThis.fetch;

Deno.test('upcomingGws picks current/next and caps at 38', () => {
  const events = [{ id: 7, is_current: true, is_next: false }, { id: 8, is_current: false, is_next: true }];
  assertEquals(upcomingGws(events), [7, 8, 9]);
  assertEquals(upcomingGws([{ id: 37, is_current: false, is_next: true }]), [37, 38]);
});

Deno.test('seasonLabel uses the Aug boundary', () => {
  assertEquals(seasonLabel(new Date('2026-06-17')), '2025/26');
  assertEquals(seasonLabel(new Date('2026-09-01')), '2026/27');
});

// #169: after the July API rollover the bootstrap serves the NEW season's GW1
// while `now` is still July. Labelling from `now` paired new-season element ids
// with last season's history, and element ids reset every season.
Deno.test('seasonForGw labels from the gameweek deadline, not the clock', () => {
  const events = [{ id: 1, is_current: false, is_next: true, deadline_time: '2026-08-14T17:30:00Z' }];
  const julyNow = new Date('2026-07-18T04:00:00Z');
  assertEquals(seasonForGw(events, 1, julyNow), '2026/27');
  assertEquals(seasonLabel(julyNow), '2025/26', 'the clock alone would have said last season');
});

Deno.test('seasonForGw falls back to now when the event has no deadline', () => {
  const events = [{ id: 5, is_current: true, is_next: false }];
  assertEquals(seasonForGw(events, 5, new Date('2026-09-02')), '2026/27');
});

// #163: PostgREST caps every read at 1000 rows and supabase-js does not
// paginate, so a whole-season select silently returned an arbitrary slice.
Deno.test('fetchSeasonHistory pages until a request comes back empty', async () => {
  const rec = recorder();
  const full = Array.from({ length: 1000 }, (_, i) => historyRow(i + 1, 1, i + 1));
  const partial = Array.from({ length: 37 }, (_, i) => historyRow(i + 1, 2, 2000 + i));
  const supabase = makeSupabase({}, rec, [full, partial, []]);

  const rows = await fetchSeasonHistory(supabase, '2025/26');

  assertEquals(rows.length, 1037, 'both pages must be retained');
  assertEquals(rec.ranges, [[0, 999], [1000, 1999], [1037, 2036]]);
});

Deno.test('fetchSeasonHistory advances by rows received, not page size', async () => {
  const rec = recorder();
  // A server-side cap below ours: advancing by PAGE_SIZE would skip rows.
  const short = Array.from({ length: 500 }, (_, i) => historyRow(i + 1, 1, i + 1));
  const supabase = makeSupabase({}, rec, [short, []]);

  await fetchSeasonHistory(supabase, '2025/26');

  assertEquals(rec.ranges[1][0], 500);
});

Deno.test('fetchSeasonHistory surfaces a query error instead of truncating', async () => {
  const supabase = {
    from: () => ({
      select: () => {
        // deno-lint-ignore no-explicit-any
        const self: any = {
          eq: () => self,
          order: () => self,
          range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        };
        return self;
      },
    }),
  } as unknown as SupabaseClient;

  await assertRejects(() => fetchSeasonHistory(supabase, '2025/26'));
});

Deno.test('handler reads inputs, builds projections, upserts', async () => {
  const rec = recorder();
  const supabase = makeSupabase(BASE_SELECTS, rec);
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });

  assertEquals(res.status, 200);
  const proj = rec.upserts.find((c) => c.table === 'projections');
  assertEquals(!!proj, true);
  assertEquals((proj!.rows as { player_id: number }[])[0].player_id, 7);
});

// #169: writing near-intercept noise displaces the documented empty-table
// behaviour, where the client falls back to FPL's ep_next.
Deno.test('handler skips serving when the target season has no history', async () => {
  const rec = recorder();
  const supabase = makeSupabase({ ...BASE_SELECTS, player_gw_history: [] }, rec, [[]]);
  const fetch = bootFetch([{ id: 1, is_current: false, is_next: true, deadline_time: '2026-08-14T17:30:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-07-18') });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).skipped, 'no-history-for-season');
  assertEquals(rec.upserts.length, 0, 'nothing may be written');
});

// projections is keyed (player_id, gw) with no season column, so rows for
// players who existed last season but not this one are never overwritten.
Deno.test('handler sweeps rows the run did not refresh', async () => {
  const rec = recorder();
  const supabase = makeSupabase(BASE_SELECTS, rec);
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);
  const now = new Date('2026-11-01T04:00:00Z');

  await handler(authed('http://x/'), { supabase, fetch, now: () => now });

  assertEquals(rec.deletes.length, 1);
  assertEquals(rec.deletes[0].table, 'projections');
  assertEquals(rec.deletes[0].gws, [10, 11, 12]);
  assertEquals(rec.deletes[0].before, now.toISOString());
});

// #194: fpl-project ran nightly and wrote nothing to ingestion_runs, so a
// failure left no trace outside the function logs — the gap that let #163's
// wrong-but-well-formed projections go unnoticed for months.
Deno.test('handler opens a run and closes it on success', async () => {
  const rec = recorder();
  const supabase = makeSupabase(BASE_SELECTS, rec);
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });

  assertEquals(rec.runs, [{ source: 'project', status: 'running' }]);
  assertEquals(rec.runPatches.length, 1);
  assertEquals(rec.runPatches[0].status, 'success');
  // One player, and only GW10 has a fixture in BASE_SELECTS.
  assertEquals(rec.runPatches[0].rows_upserted, 1);
  assertEquals((await res.json()).runId, 'run-1');
});

// #169 added a legitimate pre-season no-op. Without a row it is
// indistinguishable from the job never having run.
Deno.test('handler records the skip reason rather than silently no-opping', async () => {
  const rec = recorder();
  const supabase = makeSupabase({ ...BASE_SELECTS, player_gw_history: [] }, rec, [[]]);
  const fetch = bootFetch([{ id: 1, is_current: false, is_next: true, deadline_time: '2026-08-14T17:30:00Z' }]);

  await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-07-18') });

  assertEquals(rec.runPatches[0].status, 'skipped');
  assertEquals(rec.runPatches[0].skip_reason, 'no-history-for-season');
});

Deno.test('handler closes the run as error with a readable PostgREST message', async () => {
  const rec = recorder();
  // The shape #177's numeric overflow arrived in: a plain object, which
  // String(err) would have flattened to [object Object].
  const supabase = makeSupabase(BASE_SELECTS, rec, undefined, {
    code: '22003',
    message: 'numeric field overflow',
  });
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });

  assertEquals(res.status, 500);
  assertEquals(rec.runPatches[0].status, 'error');
  assertEquals(rec.runPatches[0].error_message, 'code=22003 | message=numeric field overflow');
  assertEquals((await res.json()).error, 'code=22003 | message=numeric field overflow');
});
