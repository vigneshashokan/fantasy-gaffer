import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './lib/supabase-admin.ts';
import { errorRun, serializeError, startRun } from './lib/ingestion-runs.ts';
import { ingestBootstrap } from './sources/bootstrap.ts';
import { ingestFixtures } from './sources/fixtures.ts';

type Source = 'bootstrap' | 'fixtures';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures';

export interface Deps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

function defaultDeps(): Deps {
  return {
    supabase: createAdminClient(),
    fetch: globalThis.fetch,
    now: () => new Date(),
  };
}

export async function handler(req: Request, depsOverride?: Deps): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get('source');
  const force = url.searchParams.get('force') === '1';

  if (!isSource(source)) {
    return Response.json(
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures)' },
      { status: 400 },
    );
  }

  const deps = depsOverride ?? defaultDeps();
  const runId = await startRun(deps.supabase, source);

  try {
    if (source === 'bootstrap') {
      await ingestBootstrap(runId, deps, { force });
    } else {
      await ingestFixtures(runId, deps);
    }
    return Response.json({ ok: true, runId, source }, { status: 200 });
  } catch (err) {
    console.error('[fpl-ingest] handler caught:', err);
    await errorRun(deps.supabase, runId, err);
    return Response.json(
      { ok: false, runId, source, error: serializeError(err) },
      { status: 500 },
    );
  }
}

if (import.meta.main) Deno.serve((req) => handler(req));
