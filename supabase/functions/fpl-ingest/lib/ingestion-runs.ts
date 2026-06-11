import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ERROR_CHARS = 2000;

export async function startRun(
  supabase: SupabaseClient,
  source: 'bootstrap' | 'fixtures',
): Promise<string> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({ source, status: 'success' /* provisional; closed by finish/skip/error */ })
    .select()
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  args: { rowsUpserted: number; contentHash?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: 'success',
    rows_upserted: args.rowsUpserted,
  };
  if (args.contentHash !== undefined) patch.content_hash = args.contentHash;
  const { error } = await supabase.from('ingestion_runs').update(patch).eq('id', runId);
  if (error) throw error;
}

export async function skipRun(
  supabase: SupabaseClient,
  runId: string,
  reason: string,
  args: { contentHash?: string } = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: 'skipped',
    skip_reason: reason,
  };
  if (args.contentHash !== undefined) patch.content_hash = args.contentHash;
  const { error } = await supabase.from('ingestion_runs').update(patch).eq('id', runId);
  if (error) throw error;
}

export async function errorRun(
  supabase: SupabaseClient,
  runId: string,
  err: unknown,
): Promise<void> {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const truncated = stack.length > MAX_ERROR_CHARS
    ? stack.slice(0, MAX_ERROR_CHARS)
    : stack;
  await supabase
    .from('ingestion_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: truncated,
    })
    .eq('id', runId);
}
