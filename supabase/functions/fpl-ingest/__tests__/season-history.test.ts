import { assertEquals } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSeenElementCodes,
  ingestSeasonHistory,
  normalizeSeasonHistory,
  type IngestSeasonHistoryDeps,
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

  const seen = await fetchSeenElementCodes(supabase);

  assertEquals(seen.has(1500), true, 'a code that only appears on page 2 must still be captured');
  assertEquals(seen.size, 1001);
  assertEquals(rec.ranges, [[0, 999], [1000, 1999], [1001, 2000]]);
});

function makeIngestDeps(opts: {
  players: { id: number; code: number }[];
  seenPages: { element_code: number }[][];
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
    deps: { supabase, fetch: fetchStub, now: () => new Date('2026-07-27'), sleep: async () => {} },
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
