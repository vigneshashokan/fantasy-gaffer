import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { isPLSeasonActive, isInTransferWindow } from '../lib/calendar.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';

export interface BootstrapTeam {
  id: number;
  name: string;
  short_name: string;
  code: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface BootstrapElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  form: string;
  total_points: number;
  status: string;
  news: string;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  ep_next: string;
  ep_this: string;
  selected_by_percent: string;
  ict_index: string;
  bps: number;
  transfers_in_event: number;
}

export interface BootstrapStaticResponse {
  teams: BootstrapTeam[];
  elements: BootstrapElement[];
}

export interface ClubRow {
  id: number;
  name: string;
  short_name: string;
  code: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export interface PlayerRow {
  id: number;
  web_name: string;
  full_name: string;
  team_id: number;
  position: Position;
  now_cost: number;
  form: number;
  total_points: number;
  status: string;
  news: string;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  ep_next: number;
  ep_this: number;
  selected_by_percent: number;
  ict_index: number;
  bps: number;
  transfers_in_event: number;
}

const POSITION_MAP: Record<number, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

function safeParseFloat(s: string | null | undefined): number {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function normalizeClubs(raw: BootstrapStaticResponse): ClubRow[] {
  return raw.teams.map((t) => ({
    id: t.id,
    name: t.name,
    short_name: t.short_name,
    code: t.code,
    strength_overall_home: t.strength_overall_home,
    strength_overall_away: t.strength_overall_away,
    strength_attack_home: t.strength_attack_home,
    strength_attack_away: t.strength_attack_away,
    strength_defence_home: t.strength_defence_home,
    strength_defence_away: t.strength_defence_away,
  }));
}

export function normalizePlayers(raw: BootstrapStaticResponse): PlayerRow[] {
  return raw.elements
    .filter((e) => POSITION_MAP[e.element_type] !== undefined)
    .map((e) => ({
      id: e.id,
      web_name: e.web_name,
      full_name: `${e.first_name} ${e.second_name}`,
      team_id: e.team,
      position: POSITION_MAP[e.element_type],
      now_cost: e.now_cost,
      form: safeParseFloat(e.form),
      total_points: e.total_points,
      status: e.status,
      news: e.news,
      news_added: e.news_added,
      chance_of_playing_next_round: e.chance_of_playing_next_round,
      ep_next: safeParseFloat(e.ep_next),
      ep_this: safeParseFloat(e.ep_this),
      selected_by_percent: safeParseFloat(e.selected_by_percent),
      ict_index: safeParseFloat(e.ict_index),
      bps: e.bps,
      transfers_in_event: e.transfers_in_event,
    }));
}

export interface IngestBootstrapDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

export async function ingestBootstrap(
  runId: string,
  deps: IngestBootstrapDeps,
  opts: { force: boolean },
): Promise<void> {
  const today = deps.now();
  if (!opts.force && !isPLSeasonActive(today) && !isInTransferWindow(today)) {
    await skipRun(deps.supabase, runId, 'outside refresh window');
    return;
  }

  const raw = await fetchJson<BootstrapStaticResponse>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { fetch: deps.fetch },
  );

  const clubs = normalizeClubs(raw);
  const players = normalizePlayers(raw);
  const nowIso = deps.now().toISOString();
  const stampedClubs = clubs.map((c) => ({ ...c, updated_at: nowIso }));
  const stampedPlayers = players.map((p) => ({ ...p, updated_at: nowIso }));

  const clubsRes = await deps.supabase.from('clubs').upsert(stampedClubs);
  if (clubsRes.error) throw clubsRes.error;
  const playersRes = await deps.supabase.from('players').upsert(stampedPlayers);
  if (playersRes.error) throw playersRes.error;

  await finishRun(deps.supabase, runId, {
    rowsUpserted: clubs.length + players.length,
  });
}
