import { assertEquals } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  remapTeamIds,
  runBackfill,
  type BackfillDeps,
  type FixtureTeams,
} from '../../../scripts/backfill-history.ts';
import type { PlayerGwHistoryRow } from '../sources/history.ts';

const BOOTSTRAP = {
  teams: [],
  elements: [
    { id: 1, web_name: 'A', first_name: 'A', second_name: 'A', team: 10,
      element_type: 3, now_cost: 50, form: '0.0', total_points: 0, status: 'a',
      news: '', news_added: null, chance_of_playing_next_round: null,
      ep_next: '0.0', ep_this: '0.0', selected_by_percent: '0.0',
      ict_index: '0.0', bps: 0, transfers_in_event: 0 },
    { id: 2, web_name: 'B', first_name: 'B', second_name: 'B', team: 11,
      element_type: 4, now_cost: 60, form: '0.0', total_points: 0, status: 'a',
      news: '', news_added: null, chance_of_playing_next_round: null,
      ep_next: '0.0', ep_this: '0.0', selected_by_percent: '0.0',
      ict_index: '0.0', bps: 0, transfers_in_event: 0 },
  ],
};

const HISTORY_ROW = {
  fixture: 100, opponent_team: 5, was_home: true, round: 1, minutes: 90,
  starts: 1, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0,
  bonus: 0, bps: 10, total_points: 2, expected_goals: '0.10',
  expected_assists: '0.20', expected_goal_involvements: '0.30',
  expected_goals_conceded: '0.90', ict_index: '5.0', influence: '10.0',
  creativity: '8.0', threat: '12.0', defensive_contribution: 1, value: 50,
};

function fakeFetch(): typeof globalThis.fetch {
  return ((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('bootstrap-static')) {
      return Promise.resolve(new Response(JSON.stringify(BOOTSTRAP)));
    }
    if (u.includes('/fixtures/')) {
      // Matches HISTORY_ROW's fixture:100 with team A (10) at home vs team 5 away.
      return Promise.resolve(
        new Response(JSON.stringify([{ id: 100, team_h: 10, team_a: 5 }])),
      );
    }
    // element-summary/{id}/ → one history row whose element id matches the URL
    const id = Number(u.match(/element-summary\/(\d+)/)![1]);
    return Promise.resolve(
      new Response(JSON.stringify({ history: [{ ...HISTORY_ROW, element: id }] })),
    );
  }) as typeof globalThis.fetch;
}

function fakeSupabase(captured: unknown[][]): SupabaseClient {
  return {
    from: (_table: string) => ({
      upsert: (rows: unknown[], _opts?: unknown) => {
        captured.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
}

function deps(captured: unknown[][]): BackfillDeps {
  return { supabase: fakeSupabase(captured), fetch: fakeFetch(), sleep: () => Promise.resolve(), log: () => {} };
}

Deno.test('runBackfill fetches each player and upserts normalized rows', async () => {
  const captured: unknown[][] = [];
  const result = await runBackfill(deps(captured), { season: '2025/26', delayMs: 0 });
  assertEquals(result.players, 2);
  assertEquals(result.rows, 2);
  const all = captured.flat() as Array<{ player_id: number; season: string; gw: number; team_id: number }>;
  assertEquals(all.map((r) => r.player_id).sort(), [1, 2]);
  assertEquals(all[0].season, '2025/26');
  assertEquals(all[0].gw, 1);
  // team_id derives from the fixture (team_h=10), not the bootstrap club —
  // player 2's current club is 11, but this home row belongs to team 10.
  assertEquals(all.map((r) => r.team_id), [10, 10]);
});

Deno.test('runBackfill respects limit and dryRun (no upsert when dryRun)', async () => {
  const captured: unknown[][] = [];
  const result = await runBackfill(deps(captured), { season: '2025/26', limit: 1, dryRun: true, delayMs: 0 });
  assertEquals(result.players, 1);
  assertEquals(result.rows, 1);
  assertEquals(captured.length, 0); // dryRun → nothing written
});

// ---- remapTeamIds ----------------------------------------------------------

function historyRow(over: Partial<PlayerGwHistoryRow> = {}): PlayerGwHistoryRow {
  return {
    season: '2025/26',
    player_id: 1,
    fixture_id: 100,
    gw: 1,
    position: 'MID',
    team_id: 10,
    opponent_team: 5,
    was_home: true,
    minutes: 90,
    starts: 1,
    goals_scored: 0,
    assists: 0,
    clean_sheets: 0,
    goals_conceded: 0,
    bonus: 0,
    bps: 10,
    total_points: 2,
    expected_goals: 0.1,
    expected_assists: 0.2,
    expected_goal_involvements: 0.3,
    expected_goals_conceded: 0.9,
    ict_index: 5,
    influence: 10,
    creativity: 8,
    threat: 12,
    defensive_contribution: 1,
    value: 50,
    ...over,
  };
}

const FIXTURES = new Map<number, FixtureTeams>([
  [100, { team_h: 10, team_a: 5 }],
  [200, { team_h: 7, team_a: 11 }],
]);

Deno.test('remapTeamIds corrects a mislabeled row in place (mid-season transfer)', () => {
  // Player transferred to club 99 mid-season; the backfill stamped the
  // current club on this pre-transfer home row — the fixture says team 10.
  const row = historyRow({ team_id: 99 });
  const { remapped, unknownFixtures } = remapTeamIds([row], FIXTURES);
  assertEquals(row.team_id, 10);
  assertEquals(remapped, 1);
  assertEquals(unknownFixtures, 0);
});

Deno.test('remapTeamIds leaves an already-correct row untouched and uncounted', () => {
  const row = historyRow({ team_id: 10 });
  const { remapped, unknownFixtures } = remapTeamIds([row], FIXTURES);
  assertEquals(row.team_id, 10);
  assertEquals(remapped, 0);
  assertEquals(unknownFixtures, 0);
});

Deno.test('remapTeamIds counts unknown fixtures and leaves those rows unchanged', () => {
  const row = historyRow({ fixture_id: 999, team_id: 42 });
  const { remapped, unknownFixtures } = remapTeamIds([row], FIXTURES);
  assertEquals(row.team_id, 42);
  assertEquals(remapped, 0);
  assertEquals(unknownFixtures, 1);
});

Deno.test('remapTeamIds derives home from team_h and away from team_a', () => {
  const home = historyRow({ fixture_id: 200, was_home: true, team_id: 1 });
  const away = historyRow({ fixture_id: 200, was_home: false, team_id: 1 });
  const { remapped, unknownFixtures } = remapTeamIds([home, away], FIXTURES);
  assertEquals(home.team_id, 7); // was_home → team_h
  assertEquals(away.team_id, 11); // away → team_a
  assertEquals(remapped, 2);
  assertEquals(unknownFixtures, 0);
});
