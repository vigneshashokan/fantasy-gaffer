import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';

// element-summary/{id}.history_past — one row per season the player has been in
// the game, oldest first. Numeric-looking stats arrive as STRINGS.
export interface HistoryPastRow {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  starts: number;
  bps: number;
  defensive_contribution: number;
  influence: string;
  creativity: string;
  threat: string;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
}

export interface PlayerSeasonHistoryRow {
  season: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  starts: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  threat: number;
  creativity: number;
  influence: number;
  bps: number;
  defensive_contribution: number;
}

function num(s: string | number | null | undefined): number {
  const n = typeof s === 'number' ? s : parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function normalizeSeasonHistory(rows: HistoryPastRow[]): PlayerSeasonHistoryRow[] {
  return rows.map((r) => ({
    season: r.season_name,
    element_code: r.element_code,
    start_cost: num(r.start_cost),
    end_cost: num(r.end_cost),
    total_points: num(r.total_points),
    minutes: num(r.minutes),
    starts: num(r.starts),
    expected_goals: num(r.expected_goals),
    expected_assists: num(r.expected_assists),
    expected_goal_involvements: num(r.expected_goal_involvements),
    threat: num(r.threat),
    creativity: num(r.creativity),
    influence: num(r.influence),
    bps: num(r.bps),
    // Absent before 2024/25; FPL returns it as a literal 0 for those seasons
    // rather than omitting the key. num() covers the omitted case too.
    defensive_contribution: num(r.defensive_contribution),
  }));
}

export interface IngestSeasonHistoryDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

// Politeness delay between per-player calls. ~563 players on first run.
const CALL_DELAY_MS = 120;
const UPSERT_CHUNK = 500;

const PAGE_SIZE = 1000;
// One real run already produces 2000+ rows (563 players' full FPL history);
// this bounds a runaway loop well above realistic size without ever silently
// truncating the way the unpaginated read below used to.
const MAX_SEEN_ROWS = 200_000;

// PostgREST caps EVERY read at `max_rows` (1000 here and on hosted) and
// supabase-js does not paginate. An unpaginated select('element_code') on this
// table returns an arbitrary slice once it grows past that cap — which
// happens on the FIRST real run — so `seen` silently missed most
// already-ingested players and the "skip once everyone has a row" design
// never actually reached a skip. Mirrors fpl-project's fetchSeasonHistory.
export async function fetchSeenElementCodes(supabase: SupabaseClient): Promise<Set<number>> {
  const seen = new Set<number>();
  let from = 0;
  let processed = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('player_season_history')
      .select('season, element_code')
      // Range paging is only stable under a total order; the primary key is
      // (season, element_code).
      .order('season', { ascending: true })
      .order('element_code', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as { element_code: number }[];
    for (const r of batch) seen.add(r.element_code);
    // Advance by what actually came back rather than by PAGE_SIZE, so a
    // server-side cap lower than ours can't skip rows; stop on an empty page
    // rather than a short one, for the same reason.
    if (batch.length === 0) break;
    from += batch.length;
    processed += batch.length;
    if (processed > MAX_SEEN_ROWS) {
      throw new Error(
        `player_season_history paging exceeded ${MAX_SEEN_ROWS} rows — refusing to continue`,
      );
    }
  }
  return seen;
}

export async function ingestSeasonHistory(
  runId: string,
  deps: IngestSeasonHistoryDeps,
): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const playersRes = await deps.supabase
    .from('players')
    .select('id, code')
    .not('code', 'is', null);
  if (playersRes.error) throw playersRes.error;
  const players = (playersRes.data ?? []) as { id: number; code: number }[];

  const seen = await fetchSeenElementCodes(deps.supabase);

  // Incremental: a player already represented for ANY season is skipped
  // wholesale. history_past is immutable for completed seasons, so re-fetching
  // buys nothing — only genuinely new entrants cost a call after the first run.
  const todo = players.filter((p) => !seen.has(p.code));

  if (todo.length === 0) {
    await skipRun(deps.supabase, runId, 'all players already have season history');
    return;
  }

  const rows: PlayerSeasonHistoryRow[] = [];
  for (const p of todo) {
    const summary = await fetchJson<{ history_past: HistoryPastRow[] }>(
      `https://fantasy.premierleague.com/api/element-summary/${p.id}/`,
      { fetch: deps.fetch },
    );
    rows.push(...normalizeSeasonHistory(summary.history_past ?? []));
    if (CALL_DELAY_MS > 0) await sleep(CALL_DELAY_MS);
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await deps.supabase
      .from('player_season_history')
      .upsert(chunk, { onConflict: 'season,element_code' });
    if (error) throw error;
    upserted += chunk.length;
  }

  await finishRun(deps.supabase, runId, { rowsUpserted: upserted });
}
