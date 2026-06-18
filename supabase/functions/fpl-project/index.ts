import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './lib/supabase-admin.ts';
import { fetchJson } from './lib/fpl-client.ts';
import { artifact } from './lib/scorer.ts';
import { buildProjections, type FixtureLite, type PlayerInput } from './lib/project.ts';
import type { ClubStrength, HistoryRow } from './lib/features.ts';

export interface Deps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

interface EventLite { id: number; is_current: boolean; is_next: boolean }

export function upcomingGws(events: EventLite[], max = 38): number[] {
  const cur = events.find((e) => e.is_current) ?? events.find((e) => e.is_next);
  const start = cur ? cur.id : 1;
  const gws: number[] = [];
  for (let g = start; g <= Math.min(max, start + 2); g++) gws.push(g);
  return gws;
}

export function seasonLabel(now: Date): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function defaultDeps(): Deps {
  return { supabase: createAdminClient(), fetch: globalThis.fetch, now: () => new Date() };
}

export async function handler(req: Request, depsOverride?: Deps): Promise<Response> {
  const deps = depsOverride ?? defaultDeps();
  try {
    const boot = await fetchJson<{ events: EventLite[] }>(
      'https://fantasy.premierleague.com/api/bootstrap-static/',
      { fetch: deps.fetch },
    );
    const gws = upcomingGws(boot.events);
    const season = seasonLabel(deps.now());

    const [playersRes, clubsRes, fixturesRes, historyRes] = await Promise.all([
      deps.supabase.from('players').select('id, position, team_id, now_cost'),
      deps.supabase.from('clubs').select(
        'id, strength_defence_home, strength_defence_away, strength_attack_home, strength_attack_away',
      ),
      deps.supabase.from('fixtures').select('event, team_h, team_a').in('event', gws),
      deps.supabase.from('player_gw_history').select(
        'player_id, gw, fixture_id, starts, expected_goals, expected_assists, expected_goal_involvements, threat, creativity, influence, bps, defensive_contribution, total_points',
      ).eq('season', season),
    ]);
    for (const r of [playersRes, clubsRes, fixturesRes, historyRes]) {
      if (r.error) throw r.error;
    }

    const players = (playersRes.data ?? []) as PlayerInput[];
    const clubStrengths: Record<number, ClubStrength> = {};
    for (const c of (clubsRes.data ?? []) as Record<string, number>[]) {
      clubStrengths[c.id] = {
        strength_defence_home: num(c.strength_defence_home),
        strength_defence_away: num(c.strength_defence_away),
        strength_attack_home: num(c.strength_attack_home),
        strength_attack_away: num(c.strength_attack_away),
      };
    }
    const fixturesByGw: Record<number, FixtureLite[]> = {};
    for (const f of (fixturesRes.data ?? []) as FixtureLite[]) {
      (fixturesByGw[f.event] ??= []).push(f);
    }
    const historyByPlayer: Record<number, HistoryRow[]> = {};
    for (const h of (historyRes.data ?? []) as Record<string, unknown>[]) {
      const pid = Number(h.player_id);
      (historyByPlayer[pid] ??= []).push({
        gw: num(h.gw), fixture_id: num(h.fixture_id), starts: num(h.starts),
        expected_goals: num(h.expected_goals), expected_assists: num(h.expected_assists),
        expected_goal_involvements: num(h.expected_goal_involvements), threat: num(h.threat),
        creativity: num(h.creativity), influence: num(h.influence), bps: num(h.bps),
        defensive_contribution: num(h.defensive_contribution), total_points: num(h.total_points),
      });
    }

    const rows = buildProjections({
      players, historyByPlayer, fixturesByGw, clubStrengths, artifact, gws,
    });
    const stamped = rows.map((r) => ({ ...r, computed_at: deps.now().toISOString() }));
    if (stamped.length > 0) {
      const up = await deps.supabase.from('projections').upsert(stamped, { onConflict: 'player_id,gw' });
      if (up.error) throw up.error;
    }
    return Response.json({ ok: true, season, gws, rows: stamped.length }, { status: 200 });
  } catch (err) {
    console.error('[fpl-project] handler caught:', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

if (import.meta.main) Deno.serve((req) => handler(req));
