import { assertEquals } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handler, upcomingGws, seasonLabel } from '../index.ts';

Deno.test('upcomingGws picks current/next and caps at 38', () => {
  const events = [{ id: 7, is_current: true, is_next: false }, { id: 8, is_current: false, is_next: true }];
  assertEquals(upcomingGws(events), [7, 8, 9]);
  assertEquals(upcomingGws([{ id: 37, is_current: false, is_next: true }]), [37, 38]);
});

Deno.test('seasonLabel uses the Aug boundary', () => {
  assertEquals(seasonLabel(new Date('2026-06-17')), '2025/26');
  assertEquals(seasonLabel(new Date('2026-09-01')), '2026/27');
});

Deno.test('handler reads inputs, builds projections, upserts', async () => {
  const captured: { table: string; rows: unknown[] }[] = [];
  const selects: Record<string, unknown[]> = {
    players: [{ id: 7, position: 'MID', team_id: 1, now_cost: 70 }],
    clubs: [
      { id: 1, strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
      { id: 2, strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
    ],
    fixtures: [{ event: 10, team_h: 1, team_a: 2 }],
    player_gw_history: [{ player_id: 7, gw: 9, fixture_id: 90, starts: 1, total_points: 5,
      expected_goals: 0.2, expected_assists: 0.1, expected_goal_involvements: 0.3, threat: 20,
      creativity: 10, influence: 15, bps: 20, defensive_contribution: 2 }],
  };
  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: selects[table], error: null }),
        in: () => Promise.resolve({ data: selects[table], error: null }),
        then: (r: (v: { data: unknown[]; error: null }) => void) => r({ data: selects[table], error: null }),
      }),
      upsert: (rows: unknown[]) => { captured.push({ table, rows }); return Promise.resolve({ error: null }); },
    }),
  } as unknown as SupabaseClient;

  const fetch = (() => Promise.resolve(new Response(JSON.stringify({
    events: [{ id: 10, is_current: false, is_next: true }],
  })))) as typeof globalThis.fetch;

  const res = await handler(new Request('http://x/'), { supabase, fetch, now: () => new Date('2026-06-17') });
  assertEquals(res.status, 200);
  const proj = captured.find((c) => c.table === 'projections');
  assertEquals(!!proj, true);
  assertEquals((proj!.rows as { player_id: number }[])[0].player_id, 7);
});
