import { assertEquals } from '@std/assert';
import { handler, type Deps } from '../index.ts';

interface CallLog {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'select';
  payload?: unknown;
  matchId?: string;
}

interface MockState {
  fixturesHashOnNextRead?: string | null;
}

function makeDeps(opts: {
  source: 'bootstrap' | 'fixtures';
  fpl: unknown;
  now?: Date;
  fixturesHashOnRead?: string | null;
} & MockState): { deps: Deps; calls: CallLog[] } {
  const calls: CallLog[] = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 'run-1' },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(payload: unknown) {
          return {
            eq(_col: string, val: string) {
              calls.push({ table, op: 'update', payload, matchId: val });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        upsert(payload: unknown) {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ data: null, error: null });
        },
        select() {
          return {
            eq() {
              return {
                neq() {
                  return {
                    order() {
                      return {
                        limit() {
                          return {
                            maybeSingle() {
                              calls.push({ table, op: 'select' });
                              return Promise.resolve({
                                data: opts.fixturesHashOnRead === undefined
                                  ? null
                                  : { content_hash: opts.fixturesHashOnRead },
                                error: null,
                              });
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const fetchStub: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(opts.fpl), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  return {
    deps: {
      supabase,
      fetch: fetchStub,
      now: () => opts.now ?? new Date('2026-08-20T02:00:00Z'),
    },
    calls,
  };
}

const SAMPLE_BOOTSTRAP = {
  teams: [
    {
      id: 1, name: 'A', short_name: 'A', code: 1,
      strength_overall_home: 1, strength_overall_away: 1,
      strength_attack_home: 1, strength_attack_away: 1,
      strength_defence_home: 1, strength_defence_away: 1,
    },
  ],
  elements: [
    {
      id: 1, web_name: 'X', first_name: 'X', second_name: 'X',
      team: 1, element_type: 3, now_cost: 50, form: '4.0',
      total_points: 10, status: 'a', news: '', news_added: null,
      chance_of_playing_next_round: 100, ep_next: '4.0', ep_this: '4.0',
      selected_by_percent: '5.0', ict_index: '50.0', bps: 100, transfers_in_event: 0,
    },
  ],
};

const SAMPLE_FIXTURES = [
  {
    id: 1, event: 1, kickoff_time: '2026-08-15T11:30:00Z',
    team_h: 1, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3,
    team_h_score: null, team_a_score: null,
    started: false, finished: false, finished_provisional: false,
  },
];

// --- 400 cases -----------------------------------------------------------

Deno.test('returns 400 when source query param is missing', async () => {
  const { deps } = makeDeps({ source: 'bootstrap', fpl: SAMPLE_BOOTSTRAP });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest'),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test('returns 400 when source query param is unrecognised', async () => {
  const { deps } = makeDeps({ source: 'bootstrap', fpl: SAMPLE_BOOTSTRAP });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=garbage'),
    deps,
  );
  assertEquals(res.status, 400);
});

// --- bootstrap success ---------------------------------------------------

Deno.test('source=bootstrap inside PL season upserts clubs + players and closes run', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2026-09-15T02:00:00Z'),
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap'),
    deps,
  );
  assertEquals(res.status, 200);
  const tables = calls.map((c) => `${c.op}:${c.table}`);
  assertEquals(tables.includes('insert:ingestion_runs'), true);
  assertEquals(tables.includes('upsert:clubs'), true);
  assertEquals(tables.includes('upsert:players'), true);
  assertEquals(tables.includes('update:ingestion_runs'), true);

  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'success');
  assertEquals(payload.rows_upserted, 2);
});

// --- bootstrap calendar gate --------------------------------------------

Deno.test('source=bootstrap outside season + outside windows logs skipped, no upsert', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2027-06-01T02:00:00Z'),
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap'),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(calls.some((c) => c.op === 'upsert'), false);
  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'skipped');
  assertEquals(payload.skip_reason, 'outside refresh window');
});

Deno.test('source=bootstrap with ?force=1 bypasses the calendar gate', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2027-06-01T02:00:00Z'),
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap&force=1'),
    deps,
  );
  assertEquals(calls.some((c) => c.op === 'upsert' && c.table === 'players'), true);
});

// --- fixtures content-hash gate -----------------------------------------

Deno.test('source=fixtures with no prior hash upserts and stores hash', async () => {
  const { deps, calls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: null,
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(calls.some((c) => c.op === 'upsert' && c.table === 'fixtures'), true);
  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'success');
  assertEquals(typeof payload.content_hash, 'string');
});

Deno.test('source=fixtures with matching prior hash skips upsert', async () => {
  const { deps: firstDeps, calls: firstCalls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: null,
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    firstDeps,
  );
  const firstClose = firstCalls.find(
    (c) => c.op === 'update' && c.table === 'ingestion_runs',
  )!;
  const hash = (firstClose.payload as Record<string, unknown>).content_hash as string;

  const { deps: secondDeps, calls: secondCalls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: hash,
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    secondDeps,
  );
  assertEquals(secondCalls.some((c) => c.op === 'upsert' && c.table === 'fixtures'), false);
  const secondClose = secondCalls.find(
    (c) => c.op === 'update' && c.table === 'ingestion_runs',
  )!;
  const payload = secondClose.payload as Record<string, unknown>;
  assertEquals(payload.status, 'skipped');
  assertEquals(payload.skip_reason, 'no content change');
});

// --- history route -------------------------------------------------------

function makeHistoryRouteDeps(): { deps: Deps; calls: CallLog[] } {
  const calls: CallLog[] = [];
  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return { select() { return { single() { return Promise.resolve({ data: { id: 'run-1' }, error: null }); } }; } };
        },
        update(payload: unknown) {
          return { eq(_c: string, val: string) { calls.push({ table, op: 'update', payload, matchId: val }); return Promise.resolve({ data: null, error: null }); } };
        },
        select(_cols: string) {
          return { eq() { calls.push({ table, op: 'select' }); return Promise.resolve({ data: [], error: null }); } };
        },
        upsert(payload: unknown) { calls.push({ table, op: 'upsert', payload }); return Promise.resolve({ data: null, error: null }); },
      };
    },
  };
  // bootstrap returns no events → no missing GW → ingestHistory takes the skip path.
  const fetchStub: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ events: [], elements: [] }), { status: 200 }));
  return { deps: { supabase, fetch: fetchStub, now: () => new Date('2026-09-15T03:30:00Z') }, calls };
}

Deno.test('source=history dispatches to ingestHistory and closes the run', async () => {
  const { deps, calls } = makeHistoryRouteDeps();
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=history'),
    deps,
  );
  assertEquals(res.status, 200);
  const tables = calls.map((c) => `${c.op}:${c.table}`);
  assertEquals(tables.includes('insert:ingestion_runs'), true);   // startRun
  assertEquals(tables.includes('update:ingestion_runs'), true);   // skipRun
  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  assertEquals((closing.payload as Record<string, unknown>).status, 'skipped');
});
