import { assertEquals } from '@std/assert';
import {
  startRun,
  finishRun,
  skipRun,
  errorRun,
} from '../lib/ingestion-runs.ts';

interface CallLog {
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  matchId?: string;
}

function makeMockSupabase() {
  const calls: CallLog[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ table, op: 'insert', payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 'run-123' },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, val: string) {
              calls.push({ table, op: 'update', payload, matchId: val });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { supabase: supabase as any, calls };
}

Deno.test('startRun inserts a row and returns the new id', async () => {
  const { supabase, calls } = makeMockSupabase();
  const id = await startRun(supabase, 'bootstrap');
  assertEquals(id, 'run-123');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, 'ingestion_runs');
  assertEquals(calls[0].op, 'insert');
  assertEquals(calls[0].payload.source, 'bootstrap');
});

Deno.test('startRun throws when the insert returns an error', async () => {
  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from() {
      return {
        insert() {
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'insert failed', code: 'PGRST301' },
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  let threw = false;
  try {
    await startRun(supabase, 'bootstrap');
  } catch (e) {
    threw = true;
    if (!(e instanceof Object) || (e as { message?: unknown }).message !== 'insert failed') {
      throw new Error('wrong error thrown: ' + String(e));
    }
  }
  assertEquals(threw, true);
});

Deno.test('finishRun updates the row with success status + rows_upserted', async () => {
  const { supabase, calls } = makeMockSupabase();
  await finishRun(supabase, 'run-123', { rowsUpserted: 620 });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].op, 'update');
  assertEquals(calls[0].matchId, 'run-123');
  assertEquals(calls[0].payload.status, 'success');
  assertEquals(calls[0].payload.rows_upserted, 620);
});

Deno.test('finishRun stores content_hash when provided', async () => {
  const { supabase, calls } = makeMockSupabase();
  await finishRun(supabase, 'run-123', { rowsUpserted: 380, contentHash: 'abc' });
  assertEquals(calls[0].payload.content_hash, 'abc');
});

Deno.test('skipRun updates the row with skipped status + reason', async () => {
  const { supabase, calls } = makeMockSupabase();
  await skipRun(supabase, 'run-123', 'outside refresh window');
  assertEquals(calls[0].op, 'update');
  assertEquals(calls[0].payload.status, 'skipped');
  assertEquals(calls[0].payload.skip_reason, 'outside refresh window');
});

Deno.test('skipRun stores content_hash when provided (fixtures no-op case)', async () => {
  const { supabase, calls } = makeMockSupabase();
  await skipRun(supabase, 'run-123', 'no content change', { contentHash: 'abc' });
  assertEquals(calls[0].payload.content_hash, 'abc');
});

Deno.test('errorRun updates the row with error status + truncated error message', async () => {
  const { supabase, calls } = makeMockSupabase();
  const longMessage = 'x'.repeat(3000);
  await errorRun(supabase, 'run-123', new Error(longMessage));
  assertEquals(calls[0].payload.status, 'error');
  const msg = String(calls[0].payload.error_message);
  assertEquals(msg.length, 2000);
});
