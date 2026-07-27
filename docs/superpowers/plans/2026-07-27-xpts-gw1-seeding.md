# xPts GW1 Cold-Start Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player a meaningful xPts number at season start by seeding v1's features from the prior two seasons, replacing a degenerate `ep_next` fallback.

**Architecture:** Ingest raw `element-summary.history_past` aggregates into a new `player_season_history` table keyed on the season-stable `element_code`. At projection time, synthesize those aggregates into 6 "pseudo-fixture" rows and prepend them to a player's real history. The existing `FORM_WINDOW = 6` / `DECAY_ALPHA = 0.85` exp-decay then blends the prior out on its own, so no decay schedule, blend function, or handover logic is ever written and GW1 and GW20 share one code path.

**Tech Stack:** Deno edge functions (`fpl-ingest`, `fpl-project`), Supabase Postgres migrations, Python 3 (`model/`, pandas/numpy/statsmodels in `model/requirements.txt`).

**Spec:** `docs/superpowers/specs/2026-07-27-xpts-gw1-seeding-design.md` — read §4 and §7 before starting.

## Global Constraints

- **Read https://docs.expo.dev/versions/v56.0.0/ before writing any Expo code.** (No Expo code in this plan; the constraint stands for the repo.)
- **Never edit an applied migration.** Add a new timestamped one.
- **`supabase/functions/**` is a separate Deno toolchain** — excluded from repo `tsconfig.json` and ignored by Jest. Do not run repo TS/lint/test tooling against it.
- **Run the full `fpl-ingest` suite with `deno test --allow-read`.** Bare `deno test` shows `NotCapable` failures in two pre-existing fixture-reading suites that are **not** regressions.
- **`model/` is excluded from repo tsc/jest.** It uses its own venv and `pytest`.
- **The Deno↔Python parity fixture is the skew guard.** After ANY change to the seed chain, re-run `model/emit_parity_fixture.py` and re-copy **both** `xpts-v1.json` and `parity-fixture.json` into `supabase/functions/fpl-project/artifacts/`.
- **Report writers truncate from their own marker to EOF.** Never run an earlier cycle's writer as `__main__` — it deletes every later section of `docs/xpts-model.md`.
- **Gate criteria are frozen** (spec §7). Do not tune against them and re-register.
- Seeding constants, copied verbatim from spec §4: `SEED_ROWS = 6`, `SEED_DENOMINATOR = 38`, `SEASON_WEIGHTS = (0.7, 0.3)`, `SEED_DEPTH = 2`, `NEWCOMER_K = 10`.

## Task Map & The Decision Point

| Task | Deliverable | Conditional? |
|---|---|---|
| 1 | `players.code` + `player_season_history` schema | no |
| 2 | `?source=season-history` ingest + cron | no |
| 3 | Python synthesis + **Stage 0 smoke test** | no — **go/no-go** |
| 4 | **Stage 1 gate** run + verdict | no — **produces the verdict** |
| — | **DECISION POINT** | — |
| 5 | TS synthesis + parity fixture | only if a candidate passed |
| 6 | `fpl-project` serving wiring | only if a candidate passed |
| 7 | Docs + CLAUDE.md record | always |

Tasks 1–4 are unconditional and independently valuable: even on a total gate failure the captured data is permanent and the verdict is a real finding. **Tasks 5–6 must not begin until Task 4's verdict exists.**

If arm **H** wins rather than **S**, Task 5's synthesis is a strict subset (only `total_points` rates are needed) and Task 6 gains the interval-synthesis work described in spec §6. Task 5 and 6 as written below assume **S**; deviations are called out inline.

---

### Task 1: Schema — `players.code` and `player_season_history`

**Files:**
- Create: `supabase/migrations/20260727090000_player_season_history.sql`
- Modify: `supabase/functions/fpl-ingest/sources/bootstrap.ts` (element type ~line 21, player type ~line 63, mapping ~line 112)
- Test: `supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.player_season_history` with PK `(season, element_code)`; column `public.players.code integer` (nullable); `ingestion_runs.source` accepts `'season-history'`; `BootstrapElement.code: number` and the players upsert row carrying `code`.

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts`. Find the existing test that asserts the mapped player shape and add alongside it:

```ts
Deno.test('bootstrap maps element.code onto the players row', () => {
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
  const players = mapPlayers(raw as never);
  assertEquals(players[0].code, 223094);
  assertEquals(players[0].id, 411);
});
```

If `mapPlayers` is not currently exported from `bootstrap.ts`, export it — the mapping at line ~112 is inside `ingestBootstrap`. Extract it to a named exported function `mapPlayers(raw: BootstrapStaticResponse): PlayerRow[]` and have `ingestBootstrap` call it. This is a pure refactor with no behaviour change.

- [ ] **Step 2: Run the test to verify it fails**

```bash
deno test --allow-read supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts
```

Expected: FAIL — either `mapPlayers is not defined` or `expected 223094, got undefined`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260727090000_player_season_history.sql`:

```sql
-- #212 GW1 cold-start seeding.
--
-- players.code is the season-stable FPL identifier. element ids reset every
-- season (98.9% churn measured 2025/26 -> 2026/27) but code does not, so it is
-- the only safe cross-season join key.
--
-- Added NULLABLE deliberately: `add column ... not null` fails on a populated
-- table without a default, and defaulting to 0 would write a lie into the one
-- column this whole design joins on. The next `bootstrap` run backfills it, and
-- the seed join skips null-code rows, so the system self-heals after one ingest.
-- Tightening to `not null` is a later migration, once saturation is confirmed.
alter table public.players add column if not exists code integer;

create index if not exists players_code_idx on public.players (code);

-- Raw element-summary.history_past aggregates. Season-scoped with NO FK, for
-- the same reason player_gw_history has none: element ids are not stable across
-- seasons and these rows outlive any given season's players table.
--
-- Stores EVERY season the payload returns (up to 4), not just the two the model
-- uses. The Stage 1 gate predicts 2025/26 from 2023/24 + 2024/25, so a
-- two-season table would not contain its own training input. Depth is a
-- synthesis decision in model code, not a schema decision.
create table if not exists public.player_season_history (
  season                      text     not null,
  element_code                integer  not null,
  start_cost                  smallint not null,
  end_cost                    smallint not null,
  total_points                smallint not null,
  minutes                     smallint not null,
  starts                      smallint not null,
  expected_goals              numeric(6,2) not null,
  expected_assists            numeric(6,2) not null,
  expected_goal_involvements  numeric(6,2) not null,
  threat                      numeric(7,1) not null,
  creativity                  numeric(7,1) not null,
  influence                   numeric(7,1) not null,
  bps                         integer  not null,
  defensive_contribution      integer  not null,
  ingested_at                 timestamptz not null default now(),
  primary key (season, element_code)
);

-- Service-role only: RLS on with no policies, matching player_gw_history and
-- projections_shadow. The client never reads this table.
alter table public.player_season_history enable row level security;

-- The auto-named constraint from 20260610010000_fpl_reference_data.sql, most
-- recently widened by 20260726130000_ingestion_runs_project_source.sql.
alter table public.ingestion_runs
  drop constraint ingestion_runs_source_check,
  add constraint ingestion_runs_source_check
    check (source in ('bootstrap', 'fixtures', 'history', 'snapshot', 'project', 'season-history'));
```

Before writing this, run `grep -A 3 ingestion_runs_source_check supabase/migrations/20260726130000_ingestion_runs_project_source.sql` and copy the **existing** value list verbatim, appending only `'season-history'`. Dropping a value that another source relies on breaks every run of that source.

- [ ] **Step 4: Add `code` to the bootstrap ingest**

In `supabase/functions/fpl-ingest/sources/bootstrap.ts`, add to the `BootstrapElement` interface (~line 21):

```ts
  code: number;
```

Add to the player row interface (~line 63):

```ts
  code: number;
```

And in the mapping (~line 112–118), add `code: e.code,` alongside `web_name`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
deno test --allow-read supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Apply the migration locally and verify**

```bash
supabase db reset
docker exec supabase_db_fantasy-gaffer psql -U postgres -c "\d public.player_season_history"
docker exec supabase_db_fantasy-gaffer psql -U postgres -c "\d public.players" | grep code
```

Expected: the table exists with PK `(season, element_code)`; `players` shows a nullable `code integer`.

Note `psql` is not on PATH — `docker exec` into the container is the documented way.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260727090000_player_season_history.sql \
        supabase/functions/fpl-ingest/sources/bootstrap.ts \
        supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts
git commit -m "feat(#212): players.code + player_season_history schema"
```

---

### Task 2: `?source=season-history` ingest

**Files:**
- Create: `supabase/functions/fpl-ingest/sources/season-history.ts`
- Create: `supabase/migrations/20260727090100_season_history_cron.sql`
- Modify: `supabase/functions/fpl-ingest/index.ts:11-14, 52-60, 41-46`
- Modify: `supabase/functions/fpl-ingest/lib/ingestion-runs.ts:31-33`
- Modify: `supabase/functions/fpl-ingest/sources/history.ts` (`ElementSummaryResponse`)
- Test: `supabase/functions/fpl-ingest/__tests__/season-history.test.ts`

**Interfaces:**
- Consumes: `player_season_history` and `players.code` (Task 1); `fetchJson` from `lib/fpl-client.ts`; `finishRun`/`skipRun` from `lib/ingestion-runs.ts`.
- Produces:
  - `export interface HistoryPastRow` — the `element-summary.history_past` shape.
  - `export function normalizeSeasonHistory(rows: HistoryPastRow[]): PlayerSeasonHistoryRow[]`
  - `export async function ingestSeasonHistory(runId: string, deps: IngestSeasonHistoryDeps): Promise<void>`
  - `ElementSummaryResponse` gains `history_past: HistoryPastRow[]`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/fpl-ingest/__tests__/season-history.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert';
import { normalizeSeasonHistory } from '../sources/season-history.ts';

const HAALAND_2025_26 = {
  season_name: '2025/26',
  element_code: 223094,
  start_cost: 140,
  end_cost: 147,
  total_points: 239,
  minutes: 2953,
  starts: 34,
  bps: 952,
  defensive_contribution: 104,
  influence: '1180.4',
  creativity: '320.1',
  threat: '1520.0',
  expected_goals: '25.50',
  expected_assists: '2.67',
  expected_goal_involvements: '28.17',
};

Deno.test('normalizeSeasonHistory coerces string stats to numbers', () => {
  const [row] = normalizeSeasonHistory([HAALAND_2025_26]);
  assertEquals(row.season, '2025/26');
  assertEquals(row.element_code, 223094);
  assertEquals(row.expected_goals, 25.5);
  assertEquals(row.threat, 1520.0);
  assertEquals(row.total_points, 239);
  assertEquals(row.starts, 34);
});

Deno.test('normalizeSeasonHistory keeps every season returned, not just two', () => {
  const rows = normalizeSeasonHistory([
    { ...HAALAND_2025_26, season_name: '2022/23' },
    { ...HAALAND_2025_26, season_name: '2023/24' },
    { ...HAALAND_2025_26, season_name: '2024/25' },
    { ...HAALAND_2025_26, season_name: '2025/26' },
  ]);
  assertEquals(rows.length, 4);
  assertEquals(rows.map((r) => r.season), ['2022/23', '2023/24', '2024/25', '2025/26']);
});

Deno.test('normalizeSeasonHistory defaults a missing stat to 0, not NaN', () => {
  const partial = { ...HAALAND_2025_26 } as Record<string, unknown>;
  delete partial.defensive_contribution;
  const [row] = normalizeSeasonHistory([partial as never]);
  assertEquals(row.defensive_contribution, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
deno test --allow-read supabase/functions/fpl-ingest/__tests__/season-history.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the source module**

Create `supabase/functions/fpl-ingest/sources/season-history.ts`:

```ts
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

  const seenRes = await deps.supabase
    .from('player_season_history')
    .select('element_code');
  if (seenRes.error) throw seenRes.error;
  const seen = new Set((seenRes.data ?? []).map((r) => (r as { element_code: number }).element_code));

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
```

- [ ] **Step 4: Wire the route**

In `supabase/functions/fpl-ingest/index.ts`:

```ts
import { ingestSeasonHistory } from './sources/season-history.ts';

type Source = 'bootstrap' | 'fixtures' | 'history' | 'snapshot' | 'season-history';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures' || s === 'history' ||
  s === 'snapshot' || s === 'season-history';
```

Update the 400 message to `'missing or invalid ?source= (expected bootstrap|fixtures|history|snapshot|season-history)'`, and extend the dispatch chain — replacing the bare `else` so an unhandled source cannot silently run the wrong ingest:

```ts
    } else if (source === 'snapshot') {
      await ingestSnapshot(runId, deps);
    } else {
      await ingestSeasonHistory(runId, deps);
    }
```

In `supabase/functions/fpl-ingest/lib/ingestion-runs.ts`, widen `startRun`'s union (line ~33):

```ts
  source: 'bootstrap' | 'fixtures' | 'history' | 'snapshot' | 'season-history',
```

In `supabase/functions/fpl-ingest/sources/history.ts`, extend the shared response type:

```ts
export interface ElementSummaryResponse {
  history: ElementSummaryHistoryRow[];
  history_past?: HistoryPastRow[];
}
```

and `import type { HistoryPastRow } from './season-history.ts';` at the top.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
deno test --allow-read supabase/functions/fpl-ingest/
```

Expected: PASS, including the pre-existing suites.

- [ ] **Step 6: Add the cron**

Create `supabase/migrations/20260727090100_season_history_cron.sql`:

```sql
-- #212: daily season-history ingest. Runs at 03:45 UTC — after the daily
-- bootstrap (03:00, since 20260625...) so players.code is fresh, and after the
-- history capture (03:30), before fpl-project (04:00) reads the seeds.
--
-- Self-limiting: the source skips wholesale once every player has a row, so
-- after the first saturating run this is a single cheap query per day. Only
-- genuinely new entrants cost API calls.
select cron.schedule(
  'fpl-ingest-season-history',
  '45 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/fpl-ingest?source=season-history',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 240000
  ) as request_id;
  $$
);
```

Before writing this, open the most recent existing cron migration (`20260704110000_snapshot_source_and_cron.sql`) and copy its `net.http_post` block verbatim, changing only the job name, schedule and `?source=`. The vault secret names and header shape must match exactly or the job 401s.

- [ ] **Step 7: Verify end-to-end against the local stack**

```bash
supabase db reset
supabase functions serve fpl-ingest &
# Seed players first so the source has codes to work with:
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "http://127.0.0.1:54321/functions/v1/fpl-ingest?source=bootstrap" | jq
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "http://127.0.0.1:54321/functions/v1/fpl-ingest?source=season-history" | jq
docker exec supabase_db_fantasy-gaffer psql -U postgres -c \
  "select season, count(*) from public.player_season_history group by season order by season;"
```

Expected: 3–4 season rows, several hundred players each. Then re-run the same `season-history` call and confirm the response reports a skip — that is the incremental path working.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/fpl-ingest/sources/season-history.ts \
        supabase/functions/fpl-ingest/__tests__/season-history.test.ts \
        supabase/functions/fpl-ingest/index.ts \
        supabase/functions/fpl-ingest/lib/ingestion-runs.ts \
        supabase/functions/fpl-ingest/sources/history.ts \
        supabase/migrations/20260727090100_season_history_cron.sql
git commit -m "feat(#212): season-history ingest source + daily cron"
```

> **Deploy note for the reviewer:** `.github/workflows/deploy-supabase.yml` deploys functions **by name**. `season-history` is a *source* of the existing `fpl-ingest` function, not a new function, so **no workflow change is needed.** Confirm this rather than assuming — if a future task adds a genuinely new function, that file must gain a `supabase functions deploy <name>` line or the cron 404s in prod.

---

### Task 3: Python synthesis + Stage 0 smoke test (GO/NO-GO)

**Files:**
- Create: `model/seed_spec.py`
- Create: `model/seed.py`
- Create: `model/smoke_seed.py`
- Test: `model/tests/test_seed.py`

**Interfaces:**
- Consumes: `FORM_STATS`, `FORM_WINDOW` from `model/feature_spec.py`.
- Produces:
  - `model/seed_spec.py`: `SEED_ROWS`, `SEED_DENOMINATOR`, `SEASON_WEIGHTS`, `SEED_DEPTH`, `NEWCOMER_K`, `SEED_MODEL_VERSION`.
  - `blend_rates(seasons: list[dict]) -> dict | None` — `seasons` most-recent-first; returns `{**{stat: rate}, "starts": xm}` or `None` if empty.
  - `pseudo_rows(rates: dict) -> list[dict]` — 6 rows shaped like `player_gw_history`.
  - `newcomer_rates(position: str, now_cost: int, pool: list[dict]) -> dict | None` — `pool` entries are `{"position", "end_cost", "element_code", "rates"}`.

- [ ] **Step 1: Write the failing test**

Create `model/tests/test_seed.py`:

```python
import pytest

from feature_spec import FORM_STATS, FORM_WINDOW
from seed import blend_rates, newcomer_rates, pseudo_rows
from seed_spec import NEWCOMER_K, SEASON_WEIGHTS, SEED_DENOMINATOR, SEED_ROWS


def season(**over):
    base = {s: 0.0 for s in FORM_STATS}
    base.update({"starts": 0, "end_cost": 100, "element_code": 1})
    base.update(over)
    return base


def test_seed_rows_matches_form_window():
    # The whole decay mechanism relies on the pseudo-rows exactly filling the
    # window. If FORM_WINDOW moves and SEED_ROWS does not, the prior either
    # never fully clears or under-fills at GW1.
    assert SEED_ROWS == FORM_WINDOW


def test_blend_single_season_renormalises_to_one():
    r = blend_rates([season(total_points=380, starts=38)])
    assert r["total_points"] == pytest.approx(380 / SEED_DENOMINATOR)
    assert r["starts"] == pytest.approx(1.0)


def test_blend_two_seasons_applies_declared_weights():
    r = blend_rates([
        season(total_points=380, starts=38),
        season(total_points=38, starts=0),
    ])
    expected = SEASON_WEIGHTS[0] * (380 / 38) + SEASON_WEIGHTS[1] * (38 / 38)
    assert r["total_points"] == pytest.approx(expected)
    assert r["starts"] == pytest.approx(SEASON_WEIGHTS[0] * 1.0)


def test_blend_ignores_seasons_beyond_depth():
    two = blend_rates([season(total_points=380), season(total_points=38)])
    three = blend_rates([
        season(total_points=380), season(total_points=38), season(total_points=999),
    ])
    assert two["total_points"] == pytest.approx(three["total_points"])


def test_blend_empty_returns_none():
    assert blend_rates([]) is None


def test_pseudo_rows_sort_below_every_real_gameweek():
    rows = pseudo_rows(blend_rates([season(total_points=380, starts=38)]))
    assert len(rows) == SEED_ROWS
    # Real gameweeks start at 1; every pseudo-row must lose the descending sort.
    assert all(r["gw"] == 0 for r in rows)
    assert len({r["fixture_id"] for r in rows}) == SEED_ROWS


def test_pseudo_rows_carry_fractional_starts():
    # xmin is mean(starts) over the window, so a fraction here IS the mechanism
    # for availability — not a type error to be rounded away.
    rows = pseudo_rows(blend_rates([season(starts=19)]))
    assert rows[0]["starts"] == pytest.approx(0.5)


def mk(position, end_cost, code, total_points):
    return {"position": position, "end_cost": end_cost, "element_code": code,
            "rates": {**{s: 0.0 for s in FORM_STATS},
                      "total_points": float(total_points), "starts": 1.0}}


def test_newcomer_takes_exactly_k_nearest_by_price_within_position():
    # end_cost 50..89, total_points == end_cost, so the expected mean is
    # computable exactly. Asserting the precise value is the point: a loose
    # bound would pass for almost any wrong selection.
    pool = [mk("MID", 50 + i, i, 50 + i) for i in range(40)]
    # An outlier in another position at the exact target price: if position
    # filtering is broken this dominates the mean and the assert fails loudly.
    pool.append(mk("FWD", 90, 999, 100000.0))

    r = newcomer_rates("MID", 90, pool)
    # The 10 MIDs nearest 90 are end_cost 80..89; mean total_points = 84.5.
    assert r["total_points"] == pytest.approx(84.5)
    assert r["starts"] == pytest.approx(1.0)


def test_newcomer_no_pool_returns_none():
    assert newcomer_rates("GKP", 45, []) is None


def test_newcomer_pool_smaller_than_k_uses_all_of_it():
    pool = [mk("GKP", 45, 1, 3.0), mk("GKP", 55, 2, 5.0)]
    assert newcomer_rates("GKP", 50, pool)["total_points"] == pytest.approx(4.0)


def test_newcomer_tie_break_is_order_independent():
    # The k-th and (k+1)-th candidates are EQUIDISTANT from the target, so
    # which one lands inside k is decided purely by the tie-break. Shuffling
    # the input must not change the answer, or the TS port will diverge here
    # and the parity fixture will flake intermittently.
    pool = [mk("DEF", 50 + i, 100 + i, 50 + i) for i in range(9)]   # dist 0..8
    pool.append(mk("DEF", 41, 200, 41))   # dist 9, lower end_cost -> wins
    pool.append(mk("DEF", 59, 201, 59))   # dist 9, loses the tie

    forward = newcomer_rates("DEF", 50, pool)["total_points"]
    reverse = newcomer_rates("DEF", 50, list(reversed(pool)))["total_points"]
    assert forward == pytest.approx(reverse)
    # 50..58 plus 41 => mean 52.7. Had 59 won the tie instead it would be 54.5,
    # so this assertion actually discriminates between the two orderings.
    assert forward == pytest.approx(52.7)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python -m pytest tests/test_seed.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'seed'`.

Use absolute paths; the persistent shell cwd has previously made a relative `cd model` fail because it was already there.

- [ ] **Step 3: Write `model/seed_spec.py`**

```python
"""Single source of truth for the GW1 seeding contract (#212).

model/seed.py and supabase/functions/fpl-project/lib/seed.ts MUST agree on
these constants, guarded by the `seed` block of the parity fixture.
"""
from feature_spec import FORM_WINDOW

SEED_MODEL_VERSION = "v1.0.0-seed"

# Pseudo-rows exactly fill the exp-decay window, so the prior is 100% of the
# feature at GW1 and provably gone once six real gameweeks exist.
SEED_ROWS = FORM_WINDOW

# Season totals -> per-fixture rates. 38 matches v1's blank-inclusive semantics
# (player_gw_history carries a row per player per gameweek regardless of
# minutes). Known to under-rate mid-season arrivals; see spec §4.2.
SEED_DENOMINATOR = 38

# Most-recent-first. Truncated and renormalised when fewer seasons exist.
SEASON_WEIGHTS = (0.7, 0.3)
SEED_DEPTH = len(SEASON_WEIGHTS)

# Capped at 2 because defensive_contribution did not exist before 2024/25 and
# FPL returns it as a literal 0 for earlier seasons — a deeper blend would
# silently dilute that feature toward zero with no error anywhere.

NEWCOMER_K = 10
```

- [ ] **Step 4: Write `model/seed.py`**

```python
"""Prior-season seeding for the GW1 cold start (#212). Pure; no I/O.

Synthesizes SEED_ROWS pseudo-fixture rows from element-summary.history_past
season aggregates. Those rows are prepended to a player's real history and
consumed by the UNCHANGED feature builder, so the existing exp-decay blends the
prior out as real gameweeks arrive.
"""
from __future__ import annotations

from feature_spec import FORM_STATS
from seed_spec import (
    NEWCOMER_K,
    SEASON_WEIGHTS,
    SEED_DENOMINATOR,
    SEED_DEPTH,
    SEED_ROWS,
)


def blend_rates(seasons: list[dict]) -> dict | None:
    """seasons: season-aggregate dicts, MOST RECENT FIRST. Uses up to SEED_DEPTH."""
    use = seasons[:SEED_DEPTH]
    if not use:
        return None
    w = list(SEASON_WEIGHTS[:len(use)])
    total = sum(w)
    w = [x / total for x in w]

    out: dict[str, float] = {}
    for stat in FORM_STATS:
        out[stat] = sum(
            wi * (float(s.get(stat, 0.0)) / SEED_DENOMINATOR)
            for wi, s in zip(w, use)
        )
    # Fractional on purpose: xmin is mean(starts) over the window, so this IS
    # the availability signal. Do not round to 0/1.
    out["starts"] = sum(
        wi * (float(s.get("starts", 0.0)) / SEED_DENOMINATOR)
        for wi, s in zip(w, use)
    )
    return out


def pseudo_rows(rates: dict | None) -> list[dict]:
    """SEED_ROWS identical rows shaped like player_gw_history.

    gw=0 puts them below every real gameweek under the existing
    sort_values(["gw", "fixture_id"], ascending=False), so real rows always
    fill the window first. fixture_id is negative and distinct only to keep
    that sort total.
    """
    if rates is None:
        return []
    return [
        {
            "gw": 0,
            "fixture_id": -(i + 1),
            "starts": rates["starts"],
            **{stat: rates[stat] for stat in FORM_STATS},
        }
        for i in range(SEED_ROWS)
    ]


def newcomer_rates(position: str, now_cost: int, pool: list[dict]) -> dict | None:
    """k-nearest-by-price prior for a player with no prior-season history.

    pool entries: {"position", "end_cost", "element_code", "rates"} for every
    player that DOES have blended rates. Reference price is last season's
    end_cost; the newcomer is matched on now_cost.

    The sort key includes element_code so the ordering is TOTAL — two players
    equidistant from the target must resolve identically here and in the TS
    port, or the parity fixture flakes.
    """
    same = [p for p in pool if p["position"] == position]
    if not same:
        return None
    same = sorted(
        same,
        key=lambda p: (abs(p["end_cost"] - now_cost), p["end_cost"], p["element_code"]),
    )[:NEWCOMER_K]

    n = float(len(same))
    keys = list(FORM_STATS) + ["starts"]
    return {k: sum(float(p["rates"][k]) for p in same) / n for k in keys}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python -m pytest tests/test_seed.py -v
```

Expected: all PASS.

- [ ] **Step 6: Write the Stage 0 smoke test**

Create `model/smoke_seed.py`. This is a **diagnostic script, not a gate** — it prints a report and exits 0 regardless.

```python
"""Stage 0 smoke test for #212 — is the synthesized feature vector in
distribution for v1's frozen coefficients?

Builds pseudo-rows from 2025/26 GW1-19 aggregates, scores GW20-24, and compares
against real v1 running on full history. No API calls, no survivorship: the
population is one season's players scored against themselves.

This is NOT the gate (that is model/backtest_seed.py). Its job is to catch a
broken synthesis BEFORE the ingest, migration and harness are built.

Usage: python smoke_seed.py [--history model/data/player_gw_history_2025-26.csv.gz]
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from feature_spec import FEATURE_COLUMNS, FORM_STATS
from features import build_feature_row
from seed import blend_rates, pseudo_rows

TRAIN_THROUGH_GW = 19
EVAL_GWS = (20, 21, 22, 23, 24)


def season_aggregate(rows: pd.DataFrame, n_fixtures: int) -> dict:
    """Collapse per-fixture rows into a history_past-shaped aggregate.

    n_fixtures is passed rather than assumed so this can use the TRUE window
    length (19) here, while serving uses SEED_DENOMINATOR (38). That difference
    is exactly what Step 7 measures.
    """
    agg = {stat: float(rows[stat].sum()) for stat in FORM_STATS}
    agg["starts"] = float(rows["starts"].sum())
    agg["_n_fixtures"] = n_fixtures
    return agg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", default="data/player_gw_history_2025-26.csv.gz")
    args = ap.parse_args()

    hist = pd.read_csv(args.history)
    print(f"loaded {len(hist)} rows, gw {hist.gw.min()}-{hist.gw.max()}")

    prior = hist[hist.gw <= TRAIN_THROUGH_GW]
    evalr = hist[hist.gw.isin(EVAL_GWS)]

    seeded_form, real_form = [], []
    for pid, pdf in prior.groupby("player_id"):
        rates = blend_rates([season_aggregate(pdf, TRAIN_THROUGH_GW)])
        if rates is None:
            continue
        rows = pseudo_rows(rates)
        seeded_form.append({"player_id": pid, **{s: rows[0][s] for s in FORM_STATS},
                            "xmin": rows[0]["starts"]})
        # What v1 actually sees at GW20: the last 6 real rows.
        last6 = pdf.sort_values(["gw", "fixture_id"], ascending=False).head(6)
        real_form.append({"player_id": pid,
                          **{s: float(last6[s].mean()) for s in FORM_STATS},
                          "xmin": float(last6["starts"].mean())})

    sf = pd.DataFrame(seeded_form).set_index("player_id")
    rf = pd.DataFrame(real_form).set_index("player_id")
    joined = sf.join(rf, lsuffix="_seed", rsuffix="_real", how="inner")

    print(f"\n{'feature':<34} {'seed mean':>10} {'real mean':>10} {'ratio':>7} {'corr':>7}")
    for col in list(FORM_STATS) + ["xmin"]:
        s, r = joined[f"{col}_seed"], joined[f"{col}_real"]
        ratio = s.mean() / r.mean() if r.mean() else float("nan")
        print(f"{col:<34} {s.mean():>10.4f} {r.mean():>10.4f} "
              f"{ratio:>7.3f} {s.corr(r):>7.3f}")

    print("\nDenominator check — which divisor reproduces real form best?")
    for label, denom in (("window length (19)", 19), ("SEED_DENOMINATOR (38)", 38),
                         ("mean appearances", None)):
        errs = []
        for pid, pdf in prior.groupby("player_id"):
            d = denom or max(1.0, float((pdf["minutes"] > 0).sum()))
            last6 = pdf.sort_values(["gw", "fixture_id"], ascending=False).head(6)
            errs.append(abs(float(pdf["total_points"].sum()) / d
                            - float(last6["total_points"].mean())))
        print(f"  {label:<24} MAE vs real form_total_points: {np.mean(errs):.4f}")

    print(f"\neval rows available GW{EVAL_GWS[0]}-{EVAL_GWS[-1]}: {len(evalr)}")
    print("\nRead this as: ratios near 1.0 and correlations >0.7 mean the "
          "synthesis is in distribution. A ratio far from 1.0 on any single "
          "feature means the frozen coefficient for it is being fed a value it "
          "never saw in training — stop and fix before Task 4.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Run the smoke test — THIS IS THE GO/NO-GO**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python smoke_seed.py 2>&1 | tee /tmp/xpts-seed/smoke.txt
```

If `model/data/player_gw_history_2025-26.csv.gz` is missing, restore it per `model/README.md`.

**GO** if per-feature ratios sit roughly in 0.7–1.4 and correlations exceed ~0.7. **NO-GO** if any feature's ratio is wildly off (>2× or <0.5×) — that means the frozen coefficient for it is being fed out-of-distribution values, and the mechanism needs rethinking before any more is built.

If the denominator check shows a divisor clearly better than the window length, **change `SEED_DENOMINATOR` now, before Task 4 runs.** Changing it after seeing gate numbers would violate the pre-registration discipline.

Record the verdict and the numbers in the commit message.

- [ ] **Step 8: Commit**

```bash
git add model/seed_spec.py model/seed.py model/smoke_seed.py model/tests/test_seed.py
git commit -m "feat(#212): prior-season seed synthesis + Stage 0 smoke test

Stage 0 verdict: <GO|NO-GO>. Feature ratios: <paste key numbers>."
```

---

### Task 4: Stage 1 gate

**Files:**
- Create: `model/backtest_seed.py`
- Modify: `docs/xpts-model.md` (appends below a new `<!-- xpts-seed-results -->` marker)
- Test: `model/tests/test_backtest_seed.py`

**Interfaces:**
- Consumes: `blend_rates`, `pseudo_rows`, `newcomer_rates` (Task 3); `player_season_history` (Task 2); `load_history` and `DEFAULT_DATABASE_URL` from `model/data.py`; the frozen `model/artifacts/xpts-v1.json`.
- Produces: `run_gate(...) -> dict` with keys `g0`, `g1`, `g2`, `verdict`; `write_report_seed(results: dict) -> None`.

- [ ] **Step 1: Write the failing test**

Create `model/tests/test_backtest_seed.py`:

```python
import pandas as pd
import pytest

from backtest_seed import G2_MIN_STARTS, evaluate_g2, join_by_code


def test_join_by_code_maps_prior_season_to_current_element_ids():
    # The whole cross-season join. Element ids churn ~99% between seasons;
    # code does not. Getting this backwards silently pairs each player with a
    # different footballer, which is the failure mode that would look like a
    # merely mediocre model rather than a bug.
    seeds = pd.DataFrame({"element_code": [223094, 154561], "total_points": [6.3, 3.1]})
    bootstrap = pd.DataFrame({"id": [430, 1], "code": [223094, 154561]})
    out = join_by_code(seeds, bootstrap)
    assert set(out["player_id"]) == {430, 1}
    assert out.loc[out.player_id == 430, "total_points"].iloc[0] == pytest.approx(6.3)


def test_join_by_code_drops_unmatched_codes_rather_than_guessing():
    seeds = pd.DataFrame({"element_code": [999999], "total_points": [1.0]})
    bootstrap = pd.DataFrame({"id": [1], "code": [154561]})
    assert len(join_by_code(seeds, bootstrap)) == 0


def test_g2_fails_on_a_goalkeeper_top_pick():
    preds = pd.DataFrame({
        "gw": [1, 2], "player_id": [10, 11], "p50": [9.0, 9.0],
        "position": ["GKP", "MID"], "prior_starts": [38, 38],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is False
    assert any("GKP" in r for r in reasons)


def test_g2_fails_on_an_unproven_top_pick():
    preds = pd.DataFrame({
        "gw": [1], "player_id": [10], "p50": [9.0],
        "position": ["FWD"], "prior_starts": [G2_MIN_STARTS - 1],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is False


def test_g2_passes_a_clean_slate():
    preds = pd.DataFrame({
        "gw": [1, 2], "player_id": [10, 11], "p50": [9.0, 8.0],
        "position": ["FWD", "MID"], "prior_starts": [34, 30],
    })
    ok, reasons = evaluate_g2(preds)
    assert ok is True
    assert reasons == []
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python -m pytest tests/test_backtest_seed.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the gate module**

Create `model/backtest_seed.py`. Structure it as follows (write the full implementation; the skeleton below fixes the contract the tests depend on):

```python
"""Stage 1 gate for #212 — cross-season seeding.

Seed from 2024/25 (0.7) + 2023/24 (0.3), predict 2025/26 GW1-5, score against
player_gw_history actuals.

GATE CRITERIA ARE FROZEN IN spec §7. Do not tune against them and re-register.

Arms:
  S — seeded pseudo-rows -> frozen v1 coefficients
  H — blended total_points/38 (r_total_points), the naive prior-season signal
  V — real v1 on its 1-4 rows of history; what ships today; GW2-5 only

Usage: python backtest_seed.py /tmp/xpts-seed/results.csv
"""
from __future__ import annotations

import gzip
import json
import sys

import numpy as np
import pandas as pd

from feature_spec import FEATURE_COLUMNS, FORM_STATS
from seed import blend_rates, newcomer_rates, pseudo_rows

MARKER = "<!-- xpts-seed-results -->"
EVAL_GWS = (1, 2, 3, 4, 5)
SEED_SEASONS = ("2024/25", "2023/24")   # most recent first
G1_MIN_PRIOR_STARTS = 10
G2_MIN_STARTS = 20
BOOTSTRAP_2025_26 = "../e2e/fixtures/raw/bootstrap-static.json.gz"


def load_2025_26_code_map(path: str = BOOTSTRAP_2025_26) -> pd.DataFrame:
    """The committed E2E capture is a 2025/26 bootstrap, so it is the only
    code->id map for that season now that the API has rolled over."""
    with gzip.open(path, "rt") as fh:
        boot = json.load(fh)
    return pd.DataFrame(
        [{"id": e["id"], "code": e["code"], "position": e["element_type"],
          "now_cost": e["now_cost"]} for e in boot["elements"]]
    )


def join_by_code(seeds: pd.DataFrame, bootstrap: pd.DataFrame) -> pd.DataFrame:
    """Map element_code -> that season's element id. Inner join: an unmatched
    code is dropped, never guessed."""
    out = seeds.merge(
        bootstrap[["id", "code"]], left_on="element_code", right_on="code", how="inner"
    )
    return out.rename(columns={"id": "player_id"}).drop(columns=["code"])


def evaluate_g2(preds: pd.DataFrame) -> tuple[bool, list[str]]:
    """Pathology guard: across the eval gameweeks the top-ranked pick must never
    be a goalkeeper and must have prior-season starts >= G2_MIN_STARTS.

    Encodes exactly the two failures observed in #211. A pathology check, NOT a
    points comparison — n=5 gameweeks cannot power a paired bootstrap.
    """
    reasons: list[str] = []
    for gw, gdf in preds.groupby("gw"):
        top = gdf.sort_values(["p50", "player_id"], ascending=[False, True]).iloc[0]
        if top["position"] == "GKP":
            reasons.append(f"GW{gw}: top pick is a GKP (player {int(top.player_id)})")
        if top["prior_starts"] < G2_MIN_STARTS:
            reasons.append(
                f"GW{gw}: top pick has {int(top.prior_starts)} prior starts "
                f"(< {G2_MIN_STARTS})"
            )
    return (not reasons), reasons
```

Then implement, in this order:

1. `build_arms(...)` — assembles S, H and V predictions for GW1–5.
2. `evaluate_g0(preds)` — per-position constant predictor whose constant is computed **strictly from `SEED_SEASONS`**, never from the 2025/26 eval window. A floor computed on its own answer is unbeatable by construction.
3. `evaluate_g1(preds)` — MAE among rows with `prior_starts >= G1_MIN_PRIOR_STARTS`, plus uncapped-population MAE reported alongside (the #144 convention).
4. `run_gate(dump_path)` — **dumps the full results CSV to `dump_path` BEFORE evaluating anything**, so diagnostics analyse the exact gate run. This is the #127 lesson; do not reorder it.
5. `write_report_seed(results)` — appends below `MARKER` in `docs/xpts-model.md`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python -m pytest tests/test_backtest_seed.py -v
```

Expected: all PASS.

- [ ] **Step 5: Run the gate**

```bash
mkdir -p /tmp/xpts-seed
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python backtest_seed.py /tmp/xpts-seed/results.csv 2>&1 | tee /tmp/xpts-seed/gate.txt
```

**Always pass the dump path.** Running `__main__` with no argv on the sibling `backtest_v31.py` starts a 50-minute job that produces no dumps — same trap here.

This needs `player_season_history` populated locally (Task 2, Step 7) and 2025/26 history in the local DB. A fresh clone hits a loud `IndexError` in the parity fixture because `clubs`/`fixtures` also need restoring — the `model/README.md` restore recipe covers history only.

- [ ] **Step 6: Record the verdict**

Add the `<!-- xpts-seed-results -->` marker to `docs/xpts-model.md` and run `write_report_seed`. Then hand-write a diagnostics subsection **below** the generated content, noting:

- the survivorship caveat (spec §7) — reported, explicitly not disqualifying
- which arm won and by how much
- whether V (today's behaviour) was beaten at GW2–5, which is the "this fixes more than GW1" claim
- G2's per-gameweek top picks, named

Every prior cycle's hand-written diagnostics were clobbered by re-running its writer. Note in the section that `write_report_seed` truncates from `MARKER` to EOF.

- [ ] **Step 7: Commit**

```bash
git add model/backtest_seed.py model/tests/test_backtest_seed.py docs/xpts-model.md
git commit -m "feat(#212): Stage 1 gate + verdict

G0: <pass|fail>. G1: <winner> MAE <x> vs <y>. G2: <pass|fail>.
Verdict: <SHIP S|SHIP H|SHIP NOTHING>."
```

---

## DECISION POINT

**Stop here and report the verdict before continuing.**

| Verdict | Next |
|---|---|
| G0 fails | **Stop.** Ship nothing; `ep_next` holds. Tasks 1–4 remain merged — the data is permanent and the finding is real. Go to Task 7. |
| S wins | Continue to Task 5 as written. |
| H wins | Continue to Task 5, but implement **only** `blendTotalPointsRate` (H needs no form vector), and add interval synthesis to Task 6 per spec §6. Use `model_version = 'seed-h-1.0.0'`. |

---

### Task 5: TypeScript synthesis + parity fixture

**Files:**
- Create: `supabase/functions/fpl-project/lib/seed.ts`
- Create: `supabase/functions/fpl-project/__tests__/seed.test.ts`
- Modify: `supabase/functions/fpl-project/feature-spec.ts` (append seeding constants)
- Modify: `model/emit_parity_fixture.py`
- Modify: `model/artifacts/parity-fixture.json` (regenerated)
- Modify: `supabase/functions/fpl-project/artifacts/parity-fixture.json` (re-copied)

**Interfaces:**
- Consumes: `blend_rates`/`pseudo_rows`/`newcomer_rates` semantics from Task 3 — the TS must match to 1e-6.
- Produces:
  - `export function blendRates(seasons: SeasonAggregate[]): SeedRates | null`
  - `export function pseudoRows(rates: SeedRates | null): SeedRow[]`
  - `export function newcomerRates(position: string, nowCost: number, pool: NewcomerPoolEntry[]): SeedRates | null`

- [ ] **Step 1: Extend the parity emitter**

In `model/emit_parity_fixture.py`, add a `build_seed_cases()` returning input/output pairs covering: a two-season blend, a single-season renormalisation, a fractional-`starts` case, and a newcomer k-NN case **including an exact-tie** (the tie-break is the likeliest divergence between the two ports). Add the result under a `"seed"` key.

- [ ] **Step 2: Regenerate and copy the fixture**

```bash
cd /Users/vigneshashokan/Workspace/github/fantasy-gaffer/model
python emit_parity_fixture.py
cp artifacts/parity-fixture.json ../supabase/functions/fpl-project/artifacts/parity-fixture.json
cp artifacts/xpts-v1.json ../supabase/functions/fpl-project/artifacts/xpts-v1.json
```

Both files, every time. Deno bundles its own artifacts directory and will not see `model/`.

- [ ] **Step 3: Write the failing parity test**

Create `supabase/functions/fpl-project/__tests__/seed.test.ts`:

```ts
import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert';
import { blendRates, newcomerRates, pseudoRows } from '../lib/seed.ts';
import { SEED_ROWS } from '../feature-spec.ts';

const fixture = JSON.parse(
  await Deno.readTextFile(new URL('../artifacts/parity-fixture.json', import.meta.url)),
);

Deno.test('seed synthesis matches the Python implementation to 1e-6', () => {
  for (const c of fixture.seed.blend) {
    const got = blendRates(c.input);
    for (const [k, want] of Object.entries(c.expected as Record<string, number>)) {
      assertAlmostEquals(got![k], want, 1e-6, `blend mismatch on ${k}`);
    }
  }
});

Deno.test('newcomer k-NN matches Python, including the exact-tie case', () => {
  for (const c of fixture.seed.newcomer) {
    const got = newcomerRates(c.position, c.now_cost, c.pool);
    for (const [k, want] of Object.entries(c.expected as Record<string, number>)) {
      assertAlmostEquals(got![k], want, 1e-6, `newcomer mismatch on ${k}`);
    }
  }
});

Deno.test('pseudo rows sort below every real gameweek', () => {
  const rows = pseudoRows(blendRates(fixture.seed.blend[0].input));
  assertEquals(rows.length, SEED_ROWS);
  assertEquals(rows.every((r) => r.gw === 0), true);
  assertEquals(new Set(rows.map((r) => r.fixture_id)).size, SEED_ROWS);
});

Deno.test('pseudo rows carry fractional starts', () => {
  const rows = pseudoRows(blendRates([{
    starts: 19, end_cost: 100, element_code: 1,
    expected_goals: 0, expected_assists: 0, expected_goal_involvements: 0,
    threat: 0, creativity: 0, influence: 0, bps: 0,
    defensive_contribution: 0, total_points: 0,
  }]));
  assertAlmostEquals(rows[0].starts, 0.5, 1e-6);
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
deno test --allow-read supabase/functions/fpl-project/__tests__/seed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Port the constants and the implementation**

Append to `supabase/functions/fpl-project/feature-spec.ts`:

```ts
// #212 seeding contract. MUST stay byte-identical in meaning to
// model/seed_spec.py — the `seed` block of the parity fixture is the guard.
export const SEED_ROWS = FORM_WINDOW;
export const SEED_DENOMINATOR = 38;
export const SEASON_WEIGHTS = [0.7, 0.3] as const;
export const SEED_DEPTH = SEASON_WEIGHTS.length;
export const NEWCOMER_K = 10;
export const SEED_MODEL_VERSION = 'v1.0.0-seed';
```

Write `lib/seed.ts` as a direct port of `model/seed.py`. The sort key must be `(|end_cost − nowCost|, end_cost, element_code)` — a partial order will pass locally and diverge from Python on ties.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
deno test --allow-read supabase/functions/fpl-project/
```

Expected: all PASS, including the pre-existing `scorer.test.ts` parity suite.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/fpl-project/lib/seed.ts \
        supabase/functions/fpl-project/__tests__/seed.test.ts \
        supabase/functions/fpl-project/feature-spec.ts \
        supabase/functions/fpl-project/artifacts/parity-fixture.json \
        model/emit_parity_fixture.py model/artifacts/parity-fixture.json
git commit -m "feat(#212): TS seed synthesis + parity fixture guard"
```

---

### Task 6: Serving wiring

**Files:**
- Modify: `supabase/functions/fpl-project/index.ts:131-153, 174-184, 186-196`
- Test: `supabase/functions/fpl-project/__tests__/index.test.ts:215, 263`

**Interfaces:**
- Consumes: `blendRates`/`pseudoRows`/`newcomerRates` (Task 5); `player_season_history` (Task 2).
- Produces: no new exports. Behaviour change only.

- [ ] **Step 1: Write the failing tests**

In `supabase/functions/fpl-project/__tests__/index.test.ts`, the existing tests at lines ~215 and ~263 assert the `no-history-for-season` skip. **Do not delete them** — narrow them to the new condition and add the seeded path:

```ts
Deno.test('skips when there is neither history nor seeds', async () => {
  const deps = makeDeps({ historyRows: [], seasonHistoryRows: [] });
  const res = await handler(new Request('http://x/'), deps);
  assertEquals((await res.json()).skipped, 'no-history-or-seeds');
});

Deno.test('projects from seeds alone when the season has no history yet', async () => {
  const deps = makeDeps({
    historyRows: [],
    seasonHistoryRows: [{
      season: '2025/26', element_code: 223094, end_cost: 147,
      total_points: 239, minutes: 2953, starts: 34, bps: 952,
      defensive_contribution: 104, influence: 1180.4, creativity: 320.1,
      threat: 1520.0, expected_goals: 25.5, expected_assists: 2.67,
      expected_goal_involvements: 28.17, start_cost: 140,
    }],
    players: [{ id: 411, code: 223094, position: 'FWD', team_id: 13, now_cost: 155 }],
  });
  const res = await handler(new Request('http://x/'), deps);
  const body = await res.json();
  assertEquals(body.skipped, undefined);
  assertEquals(body.rows > 0, true);
});

Deno.test('a player with six real gameweeks sees no seed influence', async () => {
  // The G3 assertion. head(FORM_WINDOW) provably cannot reach a pseudo-row
  // once six real rows exist, so seeded and unseeded runs must agree exactly.
  const real = Array.from({ length: 6 }, (_, i) => makeHistoryRow({ gw: i + 1 }));
  const withSeed = await handler(new Request('http://x/'),
    makeDeps({ historyRows: real, seasonHistoryRows: [SEED_ROW] }));
  const without = await handler(new Request('http://x/'),
    makeDeps({ historyRows: real, seasonHistoryRows: [] }));
  assertEquals(await withSeed.json(), await without.json());
});
```

Extend the test's `makeDeps` helper so the `supabase` stub answers a `player_season_history` select.

- [ ] **Step 2: Run them to verify they fail**

```bash
deno test --allow-read supabase/functions/fpl-project/__tests__/index.test.ts
```

Expected: FAIL — the seeded tests fail because seeds are never read.

- [ ] **Step 3: Read the seeds**

In `index.ts`, add to the `Promise.all` at line ~131:

```ts
      deps.supabase.from('player_season_history').select(
        'season, element_code, end_cost, total_points, minutes, starts, bps, ' +
        'defensive_contribution, influence, creativity, threat, ' +
        'expected_goals, expected_assists, expected_goal_involvements',
      ),
```

Add `code` to the `players` select on line ~132.

- [ ] **Step 4: Change the skip condition**

Replace the block at lines ~143–153:

```ts
    // Pre-season the new season has no finished gameweeks. Where a player has
    // prior-season aggregates we can still seed real features (#212), so the
    // skip now fires only when there is NOTHING to work from — an unsaturated
    // season-history cron on first deploy must fail safe, not project noise.
    if (historyRows.length === 0 && seasonHistoryRows.length === 0) {
      await skipRun(deps.supabase, runId, 'no-history-or-seeds');
      return Response.json(
        { ok: true, runId, season, gws, rows: 0, skipped: 'no-history-or-seeds' },
        { status: 200 },
      );
    }
```

- [ ] **Step 5: Prepend the pseudo-rows**

After the `historyByPlayer` loop (line ~184), build the newcomer pool and prepend. Seasons must be sorted **most recent first** before `blendRates` — it takes the first `SEED_DEPTH`, so reversed input silently seeds from the oldest data:

```ts
    // Group aggregates by code, most-recent season FIRST (blendRates takes the
    // leading SEED_DEPTH). Season labels sort lexicographically: '2024/25' <
    // '2025/26', so descending string order is descending chronological order.
    const seasonsByCode: Record<number, SeasonAggregate[]> = {};
    for (const r of seasonHistoryRows) {
      (seasonsByCode[r.element_code] ??= []).push(r);
    }
    for (const list of Object.values(seasonsByCode)) {
      list.sort((a, b) => (a.season < b.season ? 1 : a.season > b.season ? -1 : 0));
    }

    const pool: NewcomerPoolEntry[] = [];
    const ratesByPlayer = new Map<number, SeedRates>();
    for (const p of players) {
      if (p.code == null) continue;          // pre-backfill row; self-heals
      const rates = blendRates(seasonsByCode[p.code] ?? []);
      if (!rates) continue;
      ratesByPlayer.set(p.id, rates);
      pool.push({
        position: p.position,
        end_cost: seasonsByCode[p.code][0].end_cost,
        element_code: p.code,
        rates,
      });
    }

    for (const p of players) {
      const rates = ratesByPlayer.get(p.id)
        ?? newcomerRates(p.position, p.now_cost, pool);
      const seeded = pseudoRows(rates);
      if (seeded.length === 0) continue;
      (historyByPlayer[p.id] ??= []).push(...seeded);
    }
```

Note the two-pass shape: the pool must be complete before any newcomer is resolved against it, or early players see a partial pool and the result depends on iteration order.

Set `model_version` on the emitted rows to `SEED_MODEL_VERSION` when the player's window contains any pseudo-row, and to the existing v1 version otherwise.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
deno test --allow-read supabase/functions/fpl-project/
```

Expected: all PASS.

- [ ] **Step 7: Verify on the local stack**

```bash
supabase db reset
# populate players + season history first
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "http://127.0.0.1:54321/functions/v1/fpl-ingest?source=bootstrap"
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "http://127.0.0.1:54321/functions/v1/fpl-ingest?source=season-history"
supabase functions serve fpl-project &
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "http://127.0.0.1:54321/functions/v1/fpl-project" | jq
docker exec supabase_db_fantasy-gaffer psql -U postgres -c \
  "select model_version, count(*), round(min(p50),1), round(max(p50),1)
     from public.projections group by model_version;"
```

Expected: several hundred rows, `model_version` = the seeded version, and a **spread** of `p50` — not the 23-value clustering that motivated this. Sanity-check that the top few by `p50` are recognisable premium players and that none is a goalkeeper.

- [ ] **Step 8: Verify in the app**

```bash
./e2e/dev.sh
```

Open Top Picks and confirm the ranking is sensible and no longer falls back to `ep_next`. If port 54322 is held by another project's Supabase stack, `dev.sh` names the holder and stops — do not stop another project's stack without asking.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/fpl-project/index.ts \
        supabase/functions/fpl-project/__tests__/index.test.ts
git commit -m "feat(#212): seed projections from prior-season history at season start"
```

---

### Task 7: Documentation and record

**Files:**
- Modify: `CLAUDE.md` (the xPts section)
- Modify: `docs/xpts-model.md` (verdict, if not already written in Task 4)
- Modify: `docs/architecture.md` (the new cron + table)

- [ ] **Step 1: Record in `CLAUDE.md`**

Add to the xPts roadmap a bullet covering: the mechanism in one sentence, the gate verdict, the `SEED_DENOMINATOR` = 38 approximation, the `defensive_contribution` depth trap (§2.1), the "do not read prior-season aggregates off the bootstrap" trap (§2.2), and the parity-fixture obligation.

- [ ] **Step 2: Record the new cron in `docs/architecture.md`**

Add `fpl-ingest?source=season-history` at 03:45 UTC to the cron table, and `player_season_history` to `docs/schema.md`.

- [ ] **Step 3: Update the issue**

```bash
gh issue comment 212 --body "Shipped: <verdict summary>. Spec: docs/superpowers/specs/2026-07-27-xpts-gw1-seeding-design.md"
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/architecture.md docs/schema.md docs/xpts-model.md
git commit -m "docs(#212): record cross-season seeding + gate verdict"
```

---

## Self-Review Notes

**Spec coverage.** §2.1 depth cap → Task 3 Step 3 comment + `SEED_DEPTH`. §2.2 bootstrap trap → Task 7 Step 1. §4.1 synthesis → Task 3 Step 4. §4.2 denominator → Task 3 Step 7 measures it. §4.3 newcomers → Task 3 Step 4, Task 5. §4.4 availability/transfers → no code, by design. §5.1–5.4 → Tasks 1, 2, 5, 6. §5.6 client-unchanged → no task, correctly. §6 arms → Task 4. §7 G0/G1/G2 → Task 4 Step 3; G3 → Task 6 Step 1 third test. §8 testing → each task. §9 rollout → task order.

**Known gap, deliberate.** Spec §6's conditional interval synthesis for arm H is specified but has no task, because it is only reachable through the DECISION POINT's H branch. Writing it speculatively would violate YAGNI and it would very likely be discarded. The decision table names it so it cannot be silently skipped.

**Type consistency.** `blend_rates`/`blendRates`, `pseudo_rows`/`pseudoRows`, `newcomer_rates`/`newcomerRates` are consistent across Tasks 3, 5, 6. `SEED_ROWS`/`SEED_DENOMINATOR`/`SEASON_WEIGHTS`/`SEED_DEPTH`/`NEWCOMER_K` are identical in `seed_spec.py` and `feature-spec.ts`. `element_code` is the join key throughout; `player_id` appears only after `join_by_code`.
