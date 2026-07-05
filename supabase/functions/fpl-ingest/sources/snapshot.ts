import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';
import { currentSeasonLabel } from '../lib/calendar.ts';

// Live-only bootstrap fields captured per GW (spec §4). ep_next / ownership /
// set-piece order are overwritten weekly by FPL — unrecoverable if missed.

export interface SnapshotEvent {
  id: number;
  is_next: boolean;
  deadline_time: string | null;
}

export interface SnapshotElement {
  id: number;
  ep_next: string;
  ep_this: string;
  selected_by_percent: string;
  now_cost: number;
  form: string;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  news_added: string | null;
  transfers_in_event: number;
  transfers_out_event: number;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
}

export interface BootstrapForSnapshot {
  events: SnapshotEvent[];
  elements: SnapshotElement[];
}

export interface PlayerGwSnapshotRow {
  season: string;
  gw: number;
  player_id: number;
  ep_next: number;
  ep_this: number;
  selected_by_percent: number;
  now_cost: number;
  form: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  news_added: string | null;
  transfers_in_event: number;
  transfers_out_event: number;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  captured_at: string;
}

function num(s: string | number | null | undefined): number {
  const n = typeof s === 'number' ? s : parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
}

// The GW to snapshot: FPL's is_next event, ONLY while its deadline is still in
// the future — the freeze invariant is ours, not FPL's. The season label
// derives from the DEADLINE date (definitionally in-season), never from `now`:
// a July run capturing the August GW1 must label it "2026/27", but
// currentSeasonLabel(july) says "2025/26".
export function selectSnapshotGw(
  events: SnapshotEvent[],
  now: Date,
): { gw: number; season: string } | null {
  const next = events.find((e) => e.is_next);
  if (!next || !next.deadline_time) return null;
  const deadline = new Date(next.deadline_time);
  if (deadline <= now) return null;
  return { gw: next.id, season: currentSeasonLabel(deadline) };
}

export function snapshotRows(
  season: string,
  gw: number,
  elements: SnapshotElement[],
  capturedAt: string,
): PlayerGwSnapshotRow[] {
  return elements.map((e) => ({
    season,
    gw,
    player_id: e.id,
    ep_next: num(e.ep_next),
    ep_this: num(e.ep_this),
    selected_by_percent: num(e.selected_by_percent),
    now_cost: e.now_cost,
    form: num(e.form),
    status: e.status,
    chance_of_playing_next_round: e.chance_of_playing_next_round,
    news: e.news,
    news_added: e.news_added,
    transfers_in_event: e.transfers_in_event,
    transfers_out_event: e.transfers_out_event,
    penalties_order: e.penalties_order,
    corners_and_indirect_freekicks_order: e.corners_and_indirect_freekicks_order,
    direct_freekicks_order: e.direct_freekicks_order,
    captured_at: capturedAt,
  }));
}

export interface IngestSnapshotDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

// One bootstrap fetch -> upsert a row per player for the next upcoming GW.
// Off-season / post-deadline -> clean skip (deploy-now-arms-itself).
export async function ingestSnapshot(runId: string, deps: IngestSnapshotDeps): Promise<void> {
  const now = deps.now();
  const boot = await fetchJson<BootstrapForSnapshot>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { fetch: deps.fetch },
  );

  const target = selectSnapshotGw(boot.events, now);
  if (target === null) {
    await skipRun(deps.supabase, runId, 'no upcoming gameweek deadline (off-season or frozen)');
    return;
  }

  const rows = snapshotRows(target.season, target.gw, boot.elements, now.toISOString());
  if (rows.length === 0) {
    await skipRun(deps.supabase, runId, 'bootstrap returned no elements');
    return;
  }

  const up = await deps.supabase
    .from('player_gw_snapshots')
    .upsert(rows, { onConflict: 'season,gw,player_id' });
  if (up.error) throw up.error;

  await finishRun(deps.supabase, runId, { rowsUpserted: rows.length });
}
