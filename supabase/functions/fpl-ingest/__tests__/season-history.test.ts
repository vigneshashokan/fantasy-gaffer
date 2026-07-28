import { assertEquals, assertRejects } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSeenElementCodes,
  ingestSeasonHistory,
  mostRecentlyCompletedSeason,
  normalizeSeasonHistory,
  type HistoryPastRow,
  type IngestSeasonHistoryDeps,
  type PlayerSeasonHistoryRow,
} from '../sources/season-history.ts';

const HAALAND_2025_26 = {
  season_name: '2025/26',
  element_code: 223094,
  start_cost: 140,
  end_cost: 147,
  total_points: 239,
  minutes: 2953,
  starts: 34,
  bps: 952,
  defensive_contribution: 104,
  influence: '1180.4',
  creativity: '320.1',
  threat: '1520.0',
  expected_goals: '25.50',
  expected_assists: '2.67',
  expected_goal_involvements: '28.17',
};

Deno.test('normalizeSeasonHistory coerces string stats to numbers', () => {
  const [row] = normalizeSeasonHistory([HAALAND_2025_26]);
  assertEquals(row.season, '2025/26');
  assertEquals(row.element_code, 223094);
  assertEquals(row.expected_goals, 25.5);
  assertEquals(row.threat, 1520.0);
  assertEquals(row.total_points, 239);
  assertEquals(row.starts, 34);
});

Deno.test('normalizeSeasonHistory keeps every season returned, not just two', () => {
  const rows = normalizeSeasonHistory([
    { ...HAALAND_2025_26, season_name: '2022/23' },
    { ...HAALAND_2025_26, season_name: '2023/24' },
    { ...HAALAND_2025_26, season_name: '2024/25' },
    { ...HAALAND_2025_26, season_name: '2025/26' },
  ]);
  assertEquals(rows.length, 4);
  assertEquals(rows.map((r) => r.season), ['2022/23', '2023/24', '2024/25', '2025/26']);
});

Deno.test('normalizeSeasonHistory defaults a missing stat to 0, not NaN', () => {
  const partial = { ...HAALAND_2025_26 } as Record<string, unknown>;
  delete partial.defensive_contribution;
  const [row] = normalizeSeasonHistory([partial as never]);
  assertEquals(row.defensive_contribution, 0);
});

// #212 review (finding 2): the incremental skip must be season-aware — a
// player with a row for an OLDER season only must still be treated as `todo`
// once a new season completes, or player_season_history freezes forever at
// whichever season first got captured.
Deno.test('mostRecentlyCompletedSeason: mid-season names the PRIOR season (current one is not done yet)', () => {
  // Within [PL_SEASON_START, PL_SEASON_END) for 2026/27.
  assertEquals(mostRecentlyCompletedSeason(new Date('2027-01-15T00:00:00Z')), '2025/26');
  assertEquals(mostRecentlyCompletedSeason(new Date('2026-08-15T00:00:00Z')), '2025/26');
});

Deno.test('mostRecentlyCompletedSeason: pre-season names the season that just ended', () => {
  // Before 2026/27 kicks off (today, in-repo: 2026-07-27) — 2025/26 already
  // finished and is what a fresh element-summary call would carry as newest.
  assertEquals(mostRecentlyCompletedSeason(new Date('2026-07-27T00:00:00Z')), '2025/26');
});

Deno.test('mostRecentlyCompletedSeason: the summer gap after a season ends still names it', () => {
  // Past PL_SEASON_END (2027-05-26) but before currentSeasonLabel flips to
  // the next season (August) — 2026/27 just finished.
  assertEquals(mostRecentlyCompletedSeason(new Date('2027-06-01T00:00:00Z')), '2026/27');
});

// #212 follow-up: PostgREST caps every read at max_rows (1000 here and on
// hosted) and supabase-js does not paginate. An unpaginated
// select('element_code') silently returned only the first 1000 of the
// table's 2013+ rows once real data landed, so `seen` never converged on the
// true set and the "skip once every player has a row" design never actually
// skipped. `range()` pages here mirror fpl-project's fetchSeasonHistory,
// which hit the identical bug (#163) first.
//
// `makeSeenSupabase`'s bare `.select()` (no `.range()` chained) resolves to
// ONLY the first page — that is genuinely what PostgREST does to an
// unpaginated read past max_rows, not a mock artifact — so a test exercising
// the unpaginated code path fails for the real reason, not a shape mismatch.
function makeSeenSupabase(
  rec: { ranges: [number, number][] },
  pages: { element_code: number }[][],
): SupabaseClient {
  let call = 0;
  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      if (table !== 'player_season_history') throw new Error(`unexpected table ${table}`);
      return {
        select: () => {
          // deno-lint-ignore no-explicit-any
          const self: any = {
            eq: () => self,
            order: () => self,
            range: (from: number, to: number) => {
              rec.ranges.push([from, to]);
              const page = pages[call++] ?? [];
              return Promise.resolve({ data: page, error: null });
            },
            then: (r: (v: { data: unknown; error: null }) => void) =>
              r({ data: pages[0] ?? [], error: null }),
          };
          return self;
        },
      };
    },
  };
  return supabase as unknown as SupabaseClient;
}

Deno.test('fetchSeenElementCodes pages until an empty request, keeping codes beyond the first page', async () => {
  const rec = { ranges: [] as [number, number][] };
  const page1 = Array.from({ length: 1000 }, (_, i) => ({ element_code: i + 1 })); // codes 1..1000
  const page2 = [{ element_code: 1500 }]; // beyond a single page
  const supabase = makeSeenSupabase(rec, [page1, page2, []]);

  const seen = await fetchSeenElementCodes(supabase, '2025/26');

  assertEquals(seen.has(1500), true, 'a code that only appears on page 2 must still be captured');
  assertEquals(seen.size, 1001);
  assertEquals(rec.ranges, [[0, 999], [1000, 1999], [1001, 2000]]);
});

function makeIngestDeps(opts: {
  players: { id: number; code: number }[];
  seenPages: { element_code: number }[][];
  now?: Date;
}): { deps: IngestSeasonHistoryDeps; fetchedIds: number[]; runUpdates: Record<string, unknown>[] } {
  const fetchedIds: number[] = [];
  const runUpdates: Record<string, unknown>[] = [];
  let seenCall = 0;

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      if (table === 'players') {
        return {
          select: () => ({
            not: () => Promise.resolve({ data: opts.players, error: null }),
          }),
        };
      }
      if (table === 'player_season_history') {
        return {
          select: () => {
            // deno-lint-ignore no-explicit-any
            const self: any = {
              eq: () => self,
              order: () => self,
              range: (_from: number, _to: number) => {
                const page = opts.seenPages[seenCall++] ?? [];
                return Promise.resolve({ data: page, error: null });
              },
              // Same real-PostgREST-behavior fallback as makeSeenSupabase:
              // an unpaginated read past max_rows returns only page one.
              then: (r: (v: { data: unknown; error: null }) => void) =>
                r({ data: opts.seenPages[0] ?? [], error: null }),
            };
            return self;
          },
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'ingestion_runs') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: () => {
              runUpdates.push(patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const fetchStub: typeof fetch = (input: string | URL | Request) => {
    const m = String(input).match(/element-summary\/(\d+)/);
    if (m) fetchedIds.push(Number(m[1]));
    return Promise.resolve(new Response(JSON.stringify({ history_past: [] }), { status: 200 }));
  };

  return {
    deps: {
      supabase,
      fetch: fetchStub,
      now: () => opts.now ?? new Date('2026-07-27'),
      sleep: async () => {},
    },
    fetchedIds,
    runUpdates,
  };
}

// The property that matters: a `seen` set spanning more than one page is
// COMPLETE. A single-page test would not have caught #212's bug — this one
// puts the only player's code on page 2 (element_code 1500, behind a full
// 1000-row page 1 of codes 1..1000) and asserts it is never re-fetched.
Deno.test('ingestSeasonHistory: a player whose code lives beyond the first seen-page is not re-fetched', async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => ({ element_code: i + 1 }));
  const page2 = [{ element_code: 1500 }];
  const { deps, fetchedIds, runUpdates } = makeIngestDeps({
    players: [{ id: 999, code: 1500 }],
    seenPages: [page1, page2, []],
  });

  await ingestSeasonHistory('run-1', deps);

  assertEquals(fetchedIds, [], 'the player is already represented beyond page 1 and must not be re-fetched');
  assertEquals(runUpdates.at(-1)?.status, 'skipped');
});

// Finding 2: `seen` is now filtered to the target season server-side (the
// `.eq('season', …)` in fetchSeenElementCodes), so a fake DB that actually
// honors that filter is needed to prove a stale-season row does NOT count as
// "already have it" — a mock that ignores season (like makeIngestDeps above)
// can't exercise this.
function makeSeasonAwareIngestDeps(opts: {
  players: { id: number; code: number }[];
  storedRows: { season: string; element_code: number }[];
  now: Date;
}): { deps: IngestSeasonHistoryDeps; fetchedIds: number[] } {
  const fetchedIds: number[] = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      if (table === 'players') {
        return {
          select: () => ({
            not: () => Promise.resolve({ data: opts.players, error: null }),
          }),
        };
      }
      if (table === 'player_season_history') {
        return {
          select: () => {
            let filterSeason: string | null = null;
            // deno-lint-ignore no-explicit-any
            const self: any = {
              eq: (_col: string, val: string) => {
                filterSeason = val;
                return self;
              },
              order: () => self,
              range: (from: number, to: number) => {
                const rows = opts.storedRows.filter((r) => r.season === filterSeason);
                return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
              },
            };
            return self;
          },
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'ingestion_runs') {
        return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const fetchStub: typeof fetch = (input: string | URL | Request) => {
    const m = String(input).match(/element-summary\/(\d+)/);
    if (m) fetchedIds.push(Number(m[1]));
    return Promise.resolve(new Response(JSON.stringify({ history_past: [] }), { status: 200 }));
  };

  return {
    deps: { supabase, fetch: fetchStub, now: () => opts.now, sleep: async () => {} },
    fetchedIds,
  };
}

Deno.test('ingestSeasonHistory: a player whose only stored row is for a stale season IS re-fetched', async () => {
  // now = mid-2026/27 season -> target season is 2025/26. This player only
  // has a 2024/25 row stored (imagine last summer's run captured them, and
  // no run has completed since 2025/26 wrapped) — the old flat-set `seen`
  // would have skipped them forever; season-aware `seen` must not.
  const { deps, fetchedIds } = makeSeasonAwareIngestDeps({
    players: [{ id: 42, code: 4242 }],
    storedRows: [{ season: '2024/25', element_code: 4242 }],
    now: new Date('2027-01-15T00:00:00Z'),
  });

  await ingestSeasonHistory('run-2', deps);

  assertEquals(fetchedIds, [42], 'a player without a row for the target season must be re-fetched');
});

Deno.test('ingestSeasonHistory: a player who already has the target-season row is skipped', async () => {
  const { deps, fetchedIds } = makeSeasonAwareIngestDeps({
    players: [{ id: 42, code: 4242 }],
    storedRows: [{ season: '2025/26', element_code: 4242 }],
    now: new Date('2027-01-15T00:00:00Z'), // target season = 2025/26
  });

  await ingestSeasonHistory('run-3', deps);

  assertEquals(fetchedIds, [], 'a player who already has the target season is not re-fetched');
});

// Finding 1 (the blocker): the upsert used to happen once, after the whole
// player loop. Any terminal failure partway through — a 4xx, a rate-limit
// burst, the isolate killed on wall-clock — discarded everything fetched so
// far, so the next night's run repeated the same doomed work. This proves
// partial progress now survives: the chunk-sized flush (UPSERT_CHUNK=500)
// fires mid-loop, so a failure after it has already reached the DB.
Deno.test('ingestSeasonHistory: rows fetched before a mid-run failure are upserted, not discarded', async () => {
  const UPSERT_CHUNK = 500;
  const totalPlayers = UPSERT_CHUNK + 1; // the (UPSERT_CHUNK + 1)th call fails
  const players = Array.from({ length: totalPlayers }, (_, i) => ({ id: i + 1, code: i + 1 }));

  const upsertBatches: PlayerSeasonHistoryRow[][] = [];
  let fetchCalls = 0;
  const fetchedIds: number[] = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      if (table === 'players') {
        return { select: () => ({ not: () => Promise.resolve({ data: players, error: null }) }) };
      }
      if (table === 'player_season_history') {
        return {
          // No existing rows — every player starts as `todo`.
          select: () => {
            // deno-lint-ignore no-explicit-any
            const self: any = {
              eq: () => self,
              order: () => self,
              range: () => Promise.resolve({ data: [], error: null }),
            };
            return self;
          },
          upsert: (rows: PlayerSeasonHistoryRow[]) => {
            upsertBatches.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'ingestion_runs') {
        return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  // Each of the first UPSERT_CHUNK players contributes exactly one row (so
  // the buffer hits the chunk boundary exactly at the flush point); the next
  // call returns a terminal 4xx, which fpl-client's fetchJson does not retry
  // and turns into a thrown Error.
  const fetchStub: typeof fetch = (input: string | URL | Request) => {
    fetchCalls++;
    const m = String(input).match(/element-summary\/(\d+)/);
    const id = m ? Number(m[1]) : 0;
    fetchedIds.push(id);
    if (fetchCalls > UPSERT_CHUNK) {
      return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
    }
    const row: HistoryPastRow = { ...HAALAND_2025_26, element_code: id };
    return Promise.resolve(new Response(JSON.stringify({ history_past: [row] }), { status: 200 }));
  };

  const deps: IngestSeasonHistoryDeps = {
    supabase,
    fetch: fetchStub,
    now: () => new Date('2026-07-27'),
    sleep: async () => {},
  };

  await assertRejects(() => ingestSeasonHistory('run-4', deps));

  assertEquals(fetchedIds.length, UPSERT_CHUNK + 1, 'the failing call itself still happened');
  assertEquals(upsertBatches.length, 1, 'the chunk flush fired exactly once, mid-loop, before the throw');
  assertEquals(upsertBatches[0].length, UPSERT_CHUNK);
  assertEquals(
    upsertBatches[0].map((r) => r.element_code).sort((a, b) => a - b),
    players.slice(0, UPSERT_CHUNK).map((p) => p.code).sort((a, b) => a - b),
    'every row from the first UPSERT_CHUNK players reached the DB before the throw propagated',
  );
});
