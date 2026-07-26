import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { sha256Hex } from '../lib/hash.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';

export interface FixtureRaw {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export interface FixtureRow {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export function normalizeFixtures(raw: FixtureRaw[]): FixtureRow[] {
  return raw.map((f) => ({
    id: f.id,
    event: f.event,
    kickoff_time: f.kickoff_time,
    team_h: f.team_h,
    team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty,
    team_a_difficulty: f.team_a_difficulty,
    team_h_score: f.team_h_score,
    team_a_score: f.team_a_score,
    started: f.started,
    finished: f.finished,
    finished_provisional: f.finished_provisional,
  }));
}

// Projection excludes scores: those change as matches play but aren't what we
// hash-gate on. We only care about scheduling shape (id, event, kickoff, sides,
// finished status). Sort by id so callers can't accidentally desynchronise the
// hash by passing an array in a different order.
export function projectForHash(rows: FixtureRow[]): string {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const projection = sorted.map((r) => [
    r.id,
    r.event,
    r.kickoff_time,
    r.team_h,
    r.team_a,
    r.finished,
    // Difficulty belongs in the hash. Omitting it meant an FPL re-tune that
    // changed ONLY the difficulty ratings hashed identically, hit skipRun, and
    // left the stored FDR stale indefinitely — which chip advice reads for its
    // "more than five players at FDR>=4" wildcard heuristic (#177).
    r.team_h_difficulty,
    r.team_a_difficulty,
  ]);
  return JSON.stringify(projection);
}

export interface IngestFixturesDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

export async function ingestFixtures(
  runId: string,
  deps: IngestFixturesDeps,
): Promise<void> {
  const raw = await fetchJson<FixtureRaw[]>(
    'https://fantasy.premierleague.com/api/fixtures/',
    { fetch: deps.fetch },
  );
  const rows = normalizeFixtures(raw);
  const nowIso = deps.now().toISOString();
  const stamped = rows.map((r) => ({ ...r, updated_at: nowIso }));
  const hash = await sha256Hex(projectForHash(rows));

  const { data: prior } = await deps.supabase
    .from('ingestion_runs')
    .select('content_hash')
    .eq('source', 'fixtures')
    .neq('id', runId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior && (prior as { content_hash: string | null }).content_hash === hash) {
    await skipRun(deps.supabase, runId, 'no content change', { contentHash: hash });
    return;
  }

  const upsertRes = await deps.supabase.from('fixtures').upsert(stamped);
  if (upsertRes.error) throw upsertRes.error;

  await finishRun(deps.supabase, runId, {
    rowsUpserted: rows.length,
    contentHash: hash,
  });
}
