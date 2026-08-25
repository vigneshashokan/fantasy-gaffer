import { assertEquals, assertRejects } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSeasonHistory, handler, seasonForGw, seasonLabel, upcomingGws } from '../index.ts';
import { SEED_MODEL_VERSION } from '../feature-spec.ts';

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
 * `historyPages`, when given, is keyed by TABLE NAME so a test can hand back
 * a full page followed by a short one and prove the handler kept paging — and
 * so `player_gw_history` and `player_season_history` (both range-paged since
 * #212) can each be scripted independently. A single call-order counter
 * shared across tables would interleave their pages.
 */
function makeSupabase(
  selects: Record<string, Row[]>,
  rec: Recorder,
  historyPages?: Record<string, Row[][]>,
  upsertError?: Row,
): SupabaseClient {
  const rangeCalls: Record<string, number> = {};
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
            const call = rangeCalls[table] ?? 0;
            rangeCalls[table] = call + 1;
            const pages = historyPages?.[table];
            const page = pages ? (pages[call] ?? []) : (call === 0 ? (selects[table] ?? []) : []);
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
  player_season_history: [],
};

// #212 — a season-aggregate row for a prolific forward, shaped like
// player_season_history and matching the fixture/club data above (team 1).
const SEED_ROW: Row = {
  season: '2025/26', element_code: 223094, end_cost: 147,
  total_points: 239, minutes: 2953, starts: 34, bps: 952,
  defensive_contribution: 104, influence: 1180.4, creativity: 320.1,
  threat: 1520.0, expected_goals: 25.5, expected_assists: 2.67,
  expected_goal_involvements: 28.17, start_cost: 140,
};

const bootFetch = (events: Row[]) =>
  (() => Promise.resolve(new Response(JSON.stringify({ events })))) as typeof globalThis.fetch;

// A season-aggregate row shaped like player_season_history, parametrized so
// tests can control which season "wins" a blend and by how much.
const seasonRow = (code: number, endCost: number, totalPoints: number, season = '2025/26', starts = 30): Row => ({
  season, element_code: code, end_cost: endCost,
  total_points: totalPoints, minutes: starts * 80, starts, bps: totalPoints * 3,
  defensive_contribution: 60, influence: totalPoints * 3, creativity: totalPoints,
  threat: totalPoints * 4, expected_goals: totalPoints / 15, expected_assists: totalPoints / 60,
  expected_goal_involvements: totalPoints / 12, start_cost: endCost,
});

// Shared runner for the three seeding-internals tests below: drives the real
// handler (there is no exported seam narrower than that — the pooling/sort
// logic is inlined in handler()) and returns one target player's p50, or 0 if
// they got no row at all (defensive; every fixture below gives every player a
// gw10 fixture, so this shouldn't fire).
async function seedP50(
  playersOverride: Row[],
  targetPlayerId: number,
  opts: { seasonHistoryRows?: Row[]; historyPages?: Record<string, Row[][]> } = {},
): Promise<number> {
  const rec = recorder();
  const supabase = makeSupabase(
    {
      ...BASE_SELECTS,
      player_gw_history: [],
      player_season_history: opts.seasonHistoryRows ?? [],
      players: playersOverride,
    },
    rec,
    opts.historyPages,
  );
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);
  await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });
  const proj = rec.upserts.find((c) => c.table === 'projections');
  const row = (proj?.rows as { player_id: number; p50: number }[] | undefined)
    ?.find((r) => r.player_id === targetPlayerId);
  return row?.p50 ?? 0;
}

Deno.test('upcomingGws picks current/next and caps at 38', () => {
  const events = [{ id: 7, is_current: true, is_next: false }, { id: 8, is_current: false, is_next: true }];
  assertEquals(upcomingGws(events), [7, 8, 9, 10]);
  assertEquals(upcomingGws([{ id: 37, is_current: false, is_next: true }]), [37, 38]);
});

// The window must COVER the client's, whose anchor is the next deadline while
// this job's is `is_current` — they differ by one for most of every week, and a
// three-wide window here left the client's last gameweek permanently unwritten.
Deno.test('upcomingGws covers the decision layer\'s next-deadline window', () => {
  const events = [{ id: 7, is_current: true, is_next: false }, { id: 8, is_current: false, is_next: true }];
  const served = upcomingGws(events);
  const nextDeadlineGw = 8;
  for (const gw of [nextDeadlineGw, nextDeadlineGw + 1, nextDeadlineGw + 2]) {
    assertEquals(served.includes(gw), true, `gw ${gw} not served`);
  }
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
  const supabase = makeSupabase({}, rec, { player_gw_history: [full, partial, []] });

  const rows = await fetchSeasonHistory(supabase, '2025/26');

  assertEquals(rows.length, 1037, 'both pages must be retained');
  assertEquals(rec.ranges, [[0, 999], [1000, 1999], [1037, 2036]]);
});

Deno.test('fetchSeasonHistory advances by rows received, not page size', async () => {
  const rec = recorder();
  // A server-side cap below ours: advancing by PAGE_SIZE would skip rows.
  const short = Array.from({ length: 500 }, (_, i) => historyRow(i + 1, 1, i + 1));
  const supabase = makeSupabase({}, rec, { player_gw_history: [short, []] });

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

// #169, narrowed by #212: writing near-intercept noise displaces the
// documented empty-table behaviour, where the client falls back to FPL's
// ep_next. Now only fires when there is NOTHING to work from — a player with
// prior-season aggregates seeds instead (see the tests below).
Deno.test('handler skips when there is neither history nor seeds', async () => {
  const rec = recorder();
  const supabase = makeSupabase(
    { ...BASE_SELECTS, player_gw_history: [], player_season_history: [] },
    rec,
  );
  const fetch = bootFetch([{ id: 1, is_current: false, is_next: true, deadline_time: '2026-08-14T17:30:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-07-18') });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).skipped, 'no-history-or-seeds');
  assertEquals(rec.upserts.length, 0, 'nothing may be written');
});

// #212: at season start there is no in-season history yet, but a returning
// player's prior-season aggregate can still seed real features instead of
// serving nothing.
Deno.test('handler projects from seeds alone when the season has no history yet', async () => {
  const rec = recorder();
  const supabase = makeSupabase({
    ...BASE_SELECTS,
    player_gw_history: [],
    player_season_history: [SEED_ROW],
    players: [{ id: 411, code: 223094, position: 'FWD', team_id: 1, now_cost: 155 }],
  }, rec);
  // team_id 1 needs a fixture at an upcoming gw — reuse BASE_SELECTS' event 10.
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);

  const res = await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.skipped, undefined);
  assertEquals(body.rows > 0, true);
});

// The G3 property, strengthened by the GW1-only scoping decision (see the
// #212 plan's Step 5 note): the gate measured that real v1 on 1-4 rows of
// in-season history BEATS seeded v1 at every one of GW2-5, so the seed must
// yield the instant any real row exists — not decay across six gameweeks as
// originally designed. ONE real row is the load-bearing case: under the
// original blend design it would still have carried ~76% prior weight.
Deno.test('any real history makes seeds inert, even one gameweek', async () => {
  const withSeedSupabase = makeSupabase({
    ...BASE_SELECTS,
    player_gw_history: [historyRow(7, 1, 101)],
    player_season_history: [SEED_ROW],
  }, recorder());
  const withoutSeedSupabase = makeSupabase({
    ...BASE_SELECTS,
    player_gw_history: [historyRow(7, 1, 101)],
    player_season_history: [],
  }, recorder());
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);
  const now = () => new Date('2026-11-01');

  const withSeed = await handler(authed('http://x/'), { supabase: withSeedSupabase, fetch, now });
  const without = await handler(authed('http://x/'), { supabase: withoutSeedSupabase, fetch, now });

  assertEquals(await withSeed.json(), await without.json());
});

// eval_prospective.py splits arms by model_version. If seeded rows shipped as
// 'v1.0.0' they would pool with unseeded v1 and the prospective comparison
// that ultimately validates this feature would silently mean nothing.
Deno.test('seeded rows carry the seed model_version, not v1.0.0', async () => {
  const rec = recorder();
  const supabase = makeSupabase({
    ...BASE_SELECTS,
    player_gw_history: [],
    player_season_history: [SEED_ROW],
    players: [{ id: 411, code: 223094, position: 'FWD', team_id: 1, now_cost: 155 }],
  }, rec);
  // team_id 1 needs a fixture at an upcoming gw — reuse BASE_SELECTS' event 10.
  const fetch = bootFetch([{ id: 10, is_current: false, is_next: true, deadline_time: '2026-11-01T11:00:00Z' }]);

  await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-11-01') });

  const proj = rec.upserts.find((c) => c.table === 'projections');
  assertEquals(!!proj, true);
  const upserted = proj!.rows as { model_version: string }[];
  assertEquals(upserted.length > 0, true);
  assertEquals(upserted.every((r) => r.model_version === SEED_MODEL_VERSION), true);
});

// #212 review follow-up: every seeding test above uses exactly one player
// whose code matches the one SEED_ROW, so newcomerRates (the k-nearest-by-
// price fallback for a player with NO season aggregate) was never invoked —
// deleting it would not have failed a single test. This exercises it, and
// specifically the two-pass requirement: the newcomer pool must be COMPLETE
// before any newcomer resolves against it, so the result cannot depend on
// where the newcomer sits in the `players` iteration order.
Deno.test('newcomer resolves against the complete pool, independent of iteration order', async () => {
  // code 999 matches no player_season_history row -> newcomerRates fallback.
  const newcomer: Row = { id: 1, code: 999, position: 'MID', team_id: 1, now_cost: 70 };
  const vetA: Row = { id: 2, code: 300, position: 'MID', team_id: 1, now_cost: 65 };
  const vetB: Row = { id: 3, code: 301, position: 'MID', team_id: 1, now_cost: 75 };
  const seasonHistoryRows = [seasonRow(300, 65, 190), seasonRow(301, 75, 170)];

  // Newcomer FIRST: a single-pass implementation that resolves each player as
  // it iterates would hit the newcomer before either veteran is in the pool.
  const forward = await seedP50([newcomer, vetA, vetB], 1, { seasonHistoryRows });
  // Same players, reversed: a single-pass implementation would now hit the
  // newcomer LAST, after both veterans — a different pool than the run above.
  const reversed = await seedP50([vetB, vetA, newcomer], 1, { seasonHistoryRows });
  // Control: same data, but the veterans are re-labelled DEF so the MID pool
  // is empty — this is the "no pool at all" baseline newcomerRates falls back
  // to (returns null -> empty prior -> intercept-only projection).
  const emptyPoolBaseline = await seedP50(
    [newcomer, { ...vetA, position: 'DEF' }, { ...vetB, position: 'DEF' }],
    1,
    { seasonHistoryRows },
  );

  assertEquals(forward, reversed, 'iteration order must not change the newcomer pool result');
  assertEquals(forward > emptyPoolBaseline, true, 'a real pool must move the newcomer off the empty-history baseline');
});

// #212 review follow-up: fetchSeasonAggregates has the identical PostgREST
// max_rows=1000 truncation risk fetchSeasonHistory does (#163's bug class),
// but unlike fetchSeasonHistory it had no test proving a target row on a
// LATER page actually survives into a seeded projection. Mirrors the
// full-page/short-page/empty-page shape of the `fetchSeasonHistory pages
// until a request comes back empty` test above (lines ~167-188), but driven
// through the handler and asserting on the seeded OUTPUT rather than the raw
// row count, since the paging bug's user-visible symptom is a silently
// unseeded player, not a wrong array length.
Deno.test('a season-aggregate row on page 2 is not dropped by pagination', async () => {
  const target: Row = { id: 411, code: 223094, position: 'FWD', team_id: 1, now_cost: 155 };
  // Page 1: a full 1000-row page of OTHER players' seasons (none matching
  // element_code 223094). Page 2: short, and the ONLY page carrying the
  // target's row. Page 3: empty, terminating the loop correctly.
  const filler = Array.from({ length: 1000 }, (_, i) => seasonRow(90000 + i, 50, 20));
  const withPage2 = await seedP50([target], 411, {
    historyPages: { player_season_history: [filler, [SEED_ROW], []] },
  });
  // Same target, same filler, but the mock only has 2 pages available — the
  // second call already comes back empty, so this is what the SUT would see
  // if the target row genuinely didn't exist (i.e. what "page 2 got dropped"
  // looks like from the projection's point of view).
  const withoutPage2 = await seedP50([target], 411, {
    historyPages: { player_season_history: [filler, []] },
  });

  assertEquals(withPage2 > withoutPage2, true, 'the page-2 seed row must be reflected in the projection');
});

// #212 review follow-up: SEED_ROW everywhere above is a single season, so the
// descending (most-recent-first) comparator feeding blendRates was never
// exercised — a two-season blend always arrived pre-sorted by luck of the
// single-entry case. Feeds seasons ASCENDING (oldest first) so the assertion
// depends on index.ts's own sort, not on the test happening to supply
// recent-first input.
Deno.test('seasons are sorted most-recent-first before blending', async () => {
  const p: Row = { id: 411, code: 223094, position: 'FWD', team_id: 1, now_cost: 155 };
  const recentHigh = seasonRow(223094, 147, 380, '2025/26', 38); // prolific recent season
  const oldLow = seasonRow(223094, 100, 38, '2024/25', 4); // washout older season

  const recentOnly = await seedP50([p], 411, { seasonHistoryRows: [recentHigh] });
  const oldOnly = await seedP50([p], 411, { seasonHistoryRows: [oldLow] });
  // Fed oldest-first. If index.ts's sort is correct, this is blended the same
  // as recent-first input would be: SEASON_WEIGHTS gives the season sorted to
  // index 0 (must be '2025/26') weight 0.7. An inverted/absent comparator
  // would instead put 0.7 on '2024/25' (whichever arrived first), pulling the
  // blend BELOW the midpoint of the two single-season runs instead of above.
  const blended = await seedP50([p], 411, { seasonHistoryRows: [oldLow, recentHigh] });

  assertEquals(
    blended > (recentOnly + oldOnly) / 2,
    true,
    'ascending input must still weight the RECENT season 0.7 — an inverted comparator pulls this below the midpoint',
  );
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
  assertEquals(rec.deletes[0].gws, [10, 11, 12, 13]);
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
  const supabase = makeSupabase(
    { ...BASE_SELECTS, player_gw_history: [], player_season_history: [] },
    rec,
  );
  const fetch = bootFetch([{ id: 1, is_current: false, is_next: true, deadline_time: '2026-08-14T17:30:00Z' }]);

  await handler(authed('http://x/'), { supabase, fetch, now: () => new Date('2026-07-18') });

  assertEquals(rec.runPatches[0].status, 'skipped');
  assertEquals(rec.runPatches[0].skip_reason, 'no-history-or-seeds');
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
