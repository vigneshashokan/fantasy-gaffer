// e2e/seed.mjs — idempotent seeding of the LOCAL Supabase stack for E2E.
// Hard-refuses non-localhost targets. Run via e2e/run.sh (which exports
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from `supabase status`).
import { readFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — run via e2e/run.sh');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(URL_))
  throw new Error(`[seed] REFUSING non-local Supabase URL: ${URL_}`);

const DIR = process.env.E2E_FIXTURES_DIR ?? 'e2e/.artifacts/fixtures';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8'));
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { ...HEADERS, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`[seed] ${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const meta = load('meta');
const bootstrap = load('bootstrap-static');
const POS = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

const clubs = bootstrap.teams.map((t) => ({
  id: t.id, name: t.name, short_name: t.short_name, code: t.code,
  strength_overall_home: t.strength_overall_home, strength_overall_away: t.strength_overall_away,
  strength_attack_home: t.strength_attack_home, strength_attack_away: t.strength_attack_away,
  strength_defence_home: t.strength_defence_home, strength_defence_away: t.strength_defence_away,
}));

// element_type 5 = assistant managers — the players table CHECK only allows GKP/DEF/MID/FWD.
const players = bootstrap.elements
  .filter((e) => e.element_type >= 1 && e.element_type <= 4)
  .map((e) => ({
    id: e.id, web_name: e.web_name, full_name: `${e.first_name} ${e.second_name}`,
    team_id: e.team, position: POS[e.element_type], now_cost: e.now_cost,
    form: num(e.form), total_points: e.total_points, status: e.status,
    news: e.news ?? '', news_added: e.news_added,
    chance_of_playing_next_round: e.chance_of_playing_next_round,
    ep_next: num(e.ep_next), ep_this: num(e.ep_this),
    selected_by_percent: num(e.selected_by_percent), ict_index: num(e.ict_index),
    bps: e.bps, transfers_in_event: e.transfers_in_event,
  }));

const fixtures = load('fixtures')
  .filter((f) => f.event != null)
  .map((f) => ({
    id: f.id, event: f.event, kickoff_time: f.kickoff_time,
    team_h: f.team_h, team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty, team_a_difficulty: f.team_a_difficulty,
    team_h_score: f.team_h_score, team_a_score: f.team_a_score,
    started: f.started, finished: f.finished, finished_provisional: f.finished_provisional,
  }));

// Projections: squad players dominate every position so Top Picks and the
// captain pick are deterministic. Values are position-based + pick-order jitter.
const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
const BASE_P50 = { 1: 7.0, 2: 7.5, 3: 9.0, 4: 9.5 };
const picks = load(`picks-gw${meta.gw}`).picks;
const projections = [];
picks.forEach((p, i) => {
  const el = byId.get(p.element);
  if (!el || el.element_type > 4) return;
  const p50 = BASE_P50[el.element_type] + (15 - i) * 0.05;
  for (const gw of [meta.gw, meta.gw + 1, meta.gw + 2, meta.gw + 3]) {
    projections.push({
      player_id: p.element, gw,
      p25: Number((p50 - 1.5).toFixed(1)),
      p50: Number(p50.toFixed(1)),
      p75: Number((p50 + 2.0).toFixed(1)),
      model_version: 'e2e-fixture',
    });
  }
});

const USERS = [
  { email: 'e2e-a@fantasygaffer.test', last: 'UserA', team: meta.entry },
  { email: 'e2e-b@fantasygaffer.test', last: 'UserB', team: null },
];

async function resetUser({ email, last, team }) {
  const list = await rest('GET', '/auth/v1/admin/users?page=1&per_page=1000');
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) await rest('DELETE', `/auth/v1/admin/users/${existing.id}`); // cascades profiles etc.
  const created = await rest('POST', '/auth/v1/admin/users', {
    email, password: 'e2e-password-1', email_confirm: true,
  });
  await rest('POST', '/rest/v1/profiles', [{
    user_id: created.id, first_name: 'E2E', last_name: last, dob: '1990-01-01', fpl_team_id: team,
  }]);
  await rest('POST', '/rest/v1/notification_prefs', [{ user_id: created.id }]);
  return created.id;
}

await rest('POST', '/rest/v1/clubs?on_conflict=id', clubs, { Prefer: 'resolution=merge-duplicates' });
await rest('POST', '/rest/v1/players?on_conflict=id', players, { Prefer: 'resolution=merge-duplicates' });
await rest('POST', '/rest/v1/fixtures?on_conflict=id', fixtures, { Prefer: 'resolution=merge-duplicates' });
await rest('DELETE', '/rest/v1/projections?model_version=eq.e2e-fixture');
await rest('POST', '/rest/v1/projections?on_conflict=player_id,gw', projections, { Prefer: 'resolution=merge-duplicates' });
for (const u of USERS) await resetUser(u);
console.log(`[seed] ok: ${clubs.length} clubs, ${players.length} players, ${fixtures.length} fixtures, ${projections.length} projections, ${USERS.length} users`);
