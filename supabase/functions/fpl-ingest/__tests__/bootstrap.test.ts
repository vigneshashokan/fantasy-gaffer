import { assertEquals } from '@std/assert';
import {
  normalizeClubs,
  normalizePlayers,
  type BootstrapStaticResponse,
} from '../sources/bootstrap.ts';

async function loadFixture(): Promise<BootstrapStaticResponse> {
  const url = new URL('./_fixtures/bootstrap-static.json', import.meta.url);
  const txt = await Deno.readTextFile(url);
  return JSON.parse(txt) as BootstrapStaticResponse;
}

Deno.test('normalizeClubs maps all 11 columns for every team', async () => {
  const raw = await loadFixture();
  const rows = normalizeClubs(raw);
  assertEquals(rows.length, 2);
  assertEquals(rows[0], {
    id: 1,
    name: 'Arsenal',
    short_name: 'ARS',
    code: 3,
    strength_overall_home: 1300,
    strength_overall_away: 1290,
    strength_attack_home: 1280,
    strength_attack_away: 1270,
    strength_defence_home: 1320,
    strength_defence_away: 1310,
  });
});

Deno.test('normalizePlayers maps element_type 1-4 to GKP/DEF/MID/FWD', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saliba = rows.find((p) => p.id === 300);
  const saka = rows.find((p) => p.id === 100);
  assertEquals(saliba?.position, 'DEF');
  assertEquals(saka?.position, 'MID');
});

Deno.test('normalizePlayers parses string-typed numeric FPL fields to numbers', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saka = rows.find((p) => p.id === 100)!;
  assertEquals(typeof saka.form, 'number');
  assertEquals(saka.form, 5.6);
  assertEquals(saka.ep_next, 5.3);
  assertEquals(saka.ep_this, 5.1);
  assertEquals(saka.selected_by_percent, 32.5);
  assertEquals(saka.ict_index, 215.4);
});

Deno.test('normalizePlayers builds full_name as first + last', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200);
  assertEquals(salah?.full_name, 'Mohamed Salah');
});

Deno.test('normalizePlayers preserves nullable chance_of_playing_next_round + news_added', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200)!;
  const saliba = rows.find((p) => p.id === 300)!;
  assertEquals(salah.chance_of_playing_next_round, null);
  assertEquals(salah.news_added, null);
  assertEquals(saliba.chance_of_playing_next_round, 50);
  assertEquals(saliba.news_added, '2026-06-09T10:00:00Z');
});

Deno.test('normalizePlayers propagates status code + news string', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saliba = rows.find((p) => p.id === 300)!;
  assertEquals(saliba.status, 'i');
  assertEquals(saliba.news, 'Knock - 50% chance of playing');
});

Deno.test('normalizePlayers passes through team_id, bps, transfers_in_event, total_points, now_cost', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200)!;
  assertEquals(salah.team_id, 12);
  assertEquals(salah.bps, 815);
  assertEquals(salah.transfers_in_event, 99999);
  assertEquals(salah.total_points, 198);
  assertEquals(salah.now_cost, 130);
});

Deno.test('normalizePlayers maps element.code onto the players row', () => {
  const raw = {
    teams: [],
    elements: [{
      id: 411,
      code: 223094,
      web_name: 'Haaland',
      first_name: 'Erling',
      second_name: 'Haaland',
      team: 13,
      element_type: 4,
      now_cost: 155,
      form: '0.0',
      total_points: 0,
      status: 'a',
      news: '',
      news_added: null,
      chance_of_playing_next_round: null,
      ep_next: '4.0',
      ep_this: '0.0',
      selected_by_percent: '55.0',
      ict_index: '0.0',
      bps: 0,
      transfers_in_event: 0,
    }],
  };
  const players = normalizePlayers(raw as never);
  assertEquals(players[0].code, 223094);
  assertEquals(players[0].id, 411);
});
