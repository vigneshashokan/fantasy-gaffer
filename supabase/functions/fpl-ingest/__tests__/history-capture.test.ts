import { assertEquals } from '@std/assert';
import {
  liveToHistoryRows,
  selectMissingGws,
  type ElementMeta,
  type GwFixture,
  type HistoryEvent,
  type LiveElementStats,
  ingestHistory,
  type IngestHistoryDeps,
} from '../sources/history.ts';
import type { BootstrapElement } from '../sources/bootstrap.ts';

const EVENTS: HistoryEvent[] = [
  { id: 1, finished: true, data_checked: true },
  { id: 2, finished: true, data_checked: true },
  { id: 3, finished: true, data_checked: false }, // bonus not settled yet
  { id: 4, finished: false, data_checked: false }, // not played
];

Deno.test('selectMissingGws: only finished+data_checked GWs not already present', () => {
  assertEquals(selectMissingGws(EVENTS, [1]), [2]);
});

Deno.test('selectMissingGws: empty when everything settled is already captured', () => {
  assertEquals(selectMissingGws(EVENTS, [1, 2]), []);
});

Deno.test('selectMissingGws: returns all uncaptured settled GWs, ascending', () => {
  assertEquals(selectMissingGws(EVENTS, []), [1, 2]);
});

Deno.test('selectMissingGws: excludes finished-but-not-data_checked GWs', () => {
  const out = selectMissingGws(EVENTS, []);
  assertEquals(out.includes(3), false);
});

function stats(over: Partial<LiveElementStats> = {}): LiveElementStats {
  return {
    minutes: 90, starts: 1, goals_scored: 0, assists: 0, clean_sheets: 0,
    goals_conceded: 0, bonus: 0, bps: 0, total_points: 2,
    expected_goals: '0.00', expected_assists: '0.00', expected_goal_involvements: '0.00',
    expected_goals_conceded: '0.00', influence: '0.0', creativity: '0.0', threat: '0.0',
    ict_index: '0.0', defensive_contribution: 0, ...over,
  };
}

// team 12 plays one fixture (home vs 9); team 3 has a DGW (fx 11 home, fx 12 away);
// team 5 is blank (no fixture this GW).
const GW_FIXTURES: GwFixture[] = [
  { fixture_id: 10, team_h: 12, team_a: 9 },
  { fixture_id: 12, team_h: 7, team_a: 3 },
  { fixture_id: 11, team_h: 3, team_a: 7 },
];
const META = new Map<number, ElementMeta>([
  [100, { position: 'MID', team_id: 12, now_cost: 75 }],
  [200, { position: 'FWD', team_id: 5, now_cost: 60 }],  // blank GW
  [300, { position: 'DEF', team_id: 3, now_cost: 50 }],  // DGW
]);

Deno.test('liveToHistoryRows: maps a single-fixture player with opponent/home from fixtures', () => {
  const live = new Map<number, LiveElementStats>([
    [100, stats({ goals_scored: 1, bps: 30, total_points: 9, expected_goals: '0.74', threat: '41.0' })],
  ]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[100, META.get(100)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  const r = rows[0];
  assertEquals(r.season, '2026/27');
  assertEquals(r.player_id, 100);
  assertEquals(r.gw, 2);
  assertEquals(r.fixture_id, 10);
  assertEquals(r.was_home, true);
  assertEquals(r.opponent_team, 9);
  assertEquals(r.position, 'MID');
  assertEquals(r.team_id, 12);
  assertEquals(r.value, 75);          // value = now_cost
  assertEquals(r.goals_scored, 1);
  assertEquals(r.bps, 30);
  assertEquals(typeof r.expected_goals, 'number');
  assertEquals(r.expected_goals, 0.74); // string "0.74" coerced
  assertEquals(r.threat, 41.0);
});

Deno.test('liveToHistoryRows: a blank-GW club gets no row', () => {
  const live = new Map<number, LiveElementStats>([[200, stats({ minutes: 0, starts: 0, total_points: 0 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[200, META.get(200)!]]), GW_FIXTURES);
  assertEquals(rows.length, 0);
});

Deno.test('liveToHistoryRows: a DGW collapses to one row on the first fixture by id', () => {
  const live = new Map<number, LiveElementStats>([[300, stats({ clean_sheets: 1, total_points: 6 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[300, META.get(300)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].fixture_id, 11);  // min(11, 12)
  assertEquals(rows[0].was_home, true);  // team 3 is home in fixture 11
  assertEquals(rows[0].opponent_team, 7);
});

Deno.test('liveToHistoryRows: a 0-minute player whose club played still gets a row', () => {
  const live = new Map<number, LiveElementStats>([[100, stats({ minutes: 0, starts: 0, total_points: 0 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[100, META.get(100)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].minutes, 0);
});

Deno.test('liveToHistoryRows: an away-side player gets was_home=false and opponent=team_h', () => {
  const meta = new Map<number, ElementMeta>([[400, { position: 'FWD', team_id: 9, now_cost: 70 }]]);
  const fixtures: GwFixture[] = [{ fixture_id: 10, team_h: 12, team_a: 9 }];
  const live = new Map<number, LiveElementStats>([[400, stats({ defensive_contribution: 5 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, meta, fixtures);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].was_home, false);
  assertEquals(rows[0].opponent_team, 12); // team_h (player is on the away side, team_a=9)
  assertEquals(rows[0].fixture_id, 10);
  assertEquals(rows[0].defensive_contribution, 5);
});

function elt(id: number, team: number, element_type: number): BootstrapElement {
  return {
    id, web_name: `P${id}`, first_name: 'F', second_name: 'L', team, element_type,
    now_cost: 50, form: '0.0', total_points: 0, status: 'a', news: '', news_added: null,
    chance_of_playing_next_round: 100, ep_next: '0.0', ep_this: '0.0',
    selected_by_percent: '0.0', ict_index: '0.0', bps: 0, transfers_in_event: 0,
  };
}

function makeHistoryDeps(opts: {
  events: HistoryEvent[];
  elements: BootstrapElement[];
  presentGws: number[];
  liveByGw: Record<number, unknown>;
  fixturesByGw: Record<number, Array<{ id: number; team_h: number; team_a: number }>>;
  now?: Date;
}): { deps: IngestHistoryDeps; upserts: Array<{ table: string; rows: unknown[] }>; runUpdates: Array<Record<string, unknown>> } {
  const upserts: Array<{ table: string; rows: unknown[] }> = [];
  const runUpdates: Array<Record<string, unknown>> = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: unknown) {
              if (table === 'player_gw_history') {
                return Promise.resolve({ data: opts.presentGws.map((gw) => ({ gw })), error: null });
              }
              if (table === 'fixtures') {
                return Promise.resolve({ data: opts.fixturesByGw[val as number] ?? [], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        upsert(rows: unknown[], _opts?: unknown) {
          upserts.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, _val: string) {
              runUpdates.push(payload);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  const fetchStub: typeof fetch = (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('bootstrap-static')) {
      return Promise.resolve(new Response(JSON.stringify({ events: opts.events, elements: opts.elements }), { status: 200 }));
    }
    const m = url.match(/event\/(\d+)\/live/);
    if (m) {
      return Promise.resolve(new Response(JSON.stringify(opts.liveByGw[Number(m[1])] ?? { elements: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  return {
    deps: { supabase, fetch: fetchStub, now: () => opts.now ?? new Date('2026-09-15T03:30:00Z') },
    upserts,
    runUpdates,
  };
}

Deno.test('ingestHistory: captures a missing settled GW and closes the run success', async () => {
  const { deps, upserts, runUpdates } = makeHistoryDeps({
    events: [{ id: 1, finished: true, data_checked: true }],
    elements: [elt(100, 12, 3)], // MID on team 12
    presentGws: [],
    fixturesByGw: { 1: [{ id: 10, team_h: 12, team_a: 9 }] },
    liveByGw: {
      1: { elements: [{ id: 100, stats: {
        minutes: 90, starts: 1, goals_scored: 1, assists: 0, clean_sheets: 0,
        goals_conceded: 1, bonus: 1, bps: 25, total_points: 7,
        expected_goals: '0.50', expected_assists: '0.10', expected_goal_involvements: '0.60',
        expected_goals_conceded: '1.20', influence: '30.0', creativity: '10.0', threat: '20.0',
        ict_index: '6.0', defensive_contribution: 1,
      } }] },
    },
  });

  await ingestHistory('run-1', deps);

  const histUpsert = upserts.find((u) => u.table === 'player_gw_history');
  assertEquals(histUpsert !== undefined, true);
  assertEquals((histUpsert!.rows as unknown[]).length, 1);
  const row = (histUpsert!.rows as Array<Record<string, unknown>>)[0];
  assertEquals(row.player_id, 100);
  assertEquals(row.gw, 1);
  assertEquals(row.fixture_id, 10);
  assertEquals(row.season, '2026/27');
  assertEquals(row.expected_goals, 0.5);
  assertEquals(runUpdates.at(-1)?.status, 'success');
  assertEquals(runUpdates.at(-1)?.rows_upserted, 1);
});

Deno.test('ingestHistory: skips (no upsert) when nothing settled is missing', async () => {
  const { deps, upserts, runUpdates } = makeHistoryDeps({
    events: [{ id: 1, finished: true, data_checked: true }],
    elements: [elt(100, 12, 3)],
    presentGws: [1], // already captured
    fixturesByGw: {},
    liveByGw: {},
  });

  await ingestHistory('run-1', deps);

  assertEquals(upserts.some((u) => u.table === 'player_gw_history'), false);
  assertEquals(runUpdates.at(-1)?.status, 'skipped');
  assertEquals(runUpdates.at(-1)?.skip_reason, 'no new settled gameweeks');
});
