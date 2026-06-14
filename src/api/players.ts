// src/api/players.ts
//
// usePlayers() returns all players in UI shape, joining against the clubs
// table for the ClubCode. useTopPicks() derives a per-position top-8 by
// ep_next from the same cache entry — no extra fetch.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './queryKeys';
import type { Player, Position, TopPickPlayer, ClubCode, PlayerStatus } from '@/types/fpl';

interface PlayerRow {
  id: number;
  web_name: string;
  team_id: number;
  position: Position;
  now_cost: number;
  form: string;
  total_points: number;
  selected_by_percent: string;
  ep_next: string;
  status: PlayerStatus;
  news: string;
  chance_of_playing_next_round: number | null;
  ict_index: string;
  bps: number;
}

const safeFloat = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export function playersFromRows(
  rows: PlayerRow[],
  clubByTeamId: Record<number, string>,
): Player[] {
  const out: Player[] = [];
  for (const row of rows) {
    const code = clubByTeamId[row.team_id];
    if (!code) continue;
    out.push({
      id: String(row.id),
      name: row.web_name,
      pos: row.position,
      club: code as ClubCode,
      p: row.now_cost / 10,
      f: safeFloat(row.form),
      tp: row.total_points,
      own: safeFloat(row.selected_by_percent),
      gw: safeFloat(row.ep_next),
      status: row.status,
      news: row.news,
      chanceNext: row.chance_of_playing_next_round,
      ict: safeFloat(row.ict_index),
      bps: row.bps,
    });
  }
  return out;
}

async function queryPlayers(): Promise<Player[]> {
  const [playersRes, clubsRes] = await Promise.all([
    supabase.from('players').select(
      'id, web_name, team_id, position, now_cost, form, total_points, selected_by_percent, ep_next, status, news, chance_of_playing_next_round, ict_index, bps',
    ),
    supabase.from('clubs').select('id, short_name'),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (clubsRes.error) throw clubsRes.error;

  const clubByTeamId: Record<number, string> = {};
  for (const c of clubsRes.data ?? []) clubByTeamId[c.id] = c.short_name;
  return playersFromRows((playersRes.data ?? []) as PlayerRow[], clubByTeamId);
}

export function usePlayers() {
  return useQuery({
    queryKey: queryKeys.players,
    queryFn: queryPlayers,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

const TOP_N_PER_POS = 8;

export function useTopPicks() {
  const players = usePlayers();

  const data = useMemo<Record<Position, TopPickPlayer[]> | undefined>(() => {
    if (!players.data) return undefined;
    const buckets: Record<Position, TopPickPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const p of players.data) {
      buckets[p.pos].push({
        id: p.id, name: p.name, club: p.club, p: p.p, f: p.f, tp: p.tp, own: p.own, gw: p.gw,
      });
    }
    for (const pos of Object.keys(buckets) as Position[]) {
      buckets[pos].sort((a, b) => b.gw - a.gw);
      buckets[pos] = buckets[pos].slice(0, TOP_N_PER_POS);
    }
    return buckets;
  }, [players.data]);

  return { ...players, data };
}
