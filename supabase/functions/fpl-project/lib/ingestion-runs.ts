import type { SupabaseClient } from '@supabase/supabase-js';

// Deliberate copy of fpl-ingest/lib/ingestion-runs.ts — Supabase bundles each
// function independently, so the two cannot share a module (the same
// constraint that keeps feature-spec.ts and lib/auth.ts duplicated). Trimmed
// to what this function needs: one fixed source, no content hash.

const MAX_ERROR_CHARS = 2000;

export function serializeError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  if (err && typeof err === 'object') {
    // PostgREST errors are plain objects, so String(err) gives [object Object]
    // — the shape that made #163's failures unreadable.
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts: string[] = [];
    if (e.code) parts.push(`code=${e.code}`);
    if (e.message) parts.push(`message=${e.message}`);
    if (e.details) parts.push(`details=${e.details}`);
    if (e.hint) parts.push(`hint=${e.hint}`);
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export async function startRun(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    // Opens as 'running', never a provisional 'success': errorRun only fires on
    // a thrown JS error, so an isolate kill mid-run must not leave a row
    // claiming the run succeeded (#177).
    .insert({ source: 'project', status: 'running' })
    .select()
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  rowsUpserted: number,
): Promise<void> {
  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'success',
      rows_upserted: rowsUpserted,
    })
    .eq('id', runId);
  if (error) throw error;
}

export async function skipRun(
  supabase: SupabaseClient,
  runId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'skipped',
      skip_reason: reason,
    })
    .eq('id', runId);
  if (error) throw error;
}

export async function errorRun(
  supabase: SupabaseClient,
  runId: string,
  err: unknown,
): Promise<void> {
  const msg = serializeError(err);
  const { error: closeError } = await supabase
    .from('ingestion_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: msg.length > MAX_ERROR_CHARS ? msg.slice(0, MAX_ERROR_CHARS) : msg,
    })
    .eq('id', runId);
  // Swallowed on purpose: the caller is already returning a 500, and a failed
  // close must not mask the original error.
  if (closeError) console.error('errorRun: failed to close run', runId, closeError);
}
