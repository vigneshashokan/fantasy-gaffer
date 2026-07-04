# xPts v2 Plan 1: Prospective Snapshotter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the live-only FPL fields (`ep_next`, ownership, set-piece order, …) into a new `player_gw_snapshots` table every 6 hours, frozen per GW at its deadline — so the 2026/27 season's prospective model evaluation has real `ep_next` to benchmark against (unrecoverable if not captured; must be deployed before GW1, ~2026-08-15).

**Architecture:** A new `?source=snapshot` route on the existing `fpl-ingest` Deno Edge Function (same pattern as `?source=history`): one FPL bootstrap fetch → resolve the next upcoming GW (`is_next` + future-deadline guard) → upsert one row per player for that GW. Rows keep being refreshed until the deadline passes, then are never touched again (the frozen value = last pre-deadline capture). Off-season → clean skip, so it deploys now and arms itself when FPL publishes the calendar.

**Tech Stack:** Deno (Supabase Edge Function toolchain — NOT covered by repo tsc/jest), Postgres migrations, `pg_cron` + Vault-secret HTTP invocation.

**Spec:** `docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md` §4.

## Global Constraints

- **Never edit an applied migration** — all schema changes are new timestamped files under `supabase/migrations/`.
- `supabase/functions/**` is a separate Deno toolchain: run its tests with `deno test` from the function directory; do NOT run repo `tsc`/`jest`/`eslint` against it.
- **No CI workflow change needed**: `fpl-ingest` is already in the deploy list of `.github/workflows/deploy-supabase.yml`; `snapshot` is a query param, not a new function.
- `player_gw_snapshots` is **season-scoped with NO FK to `players`** (FPL element ids reset each season) — same rationale as `player_gw_history`.
- RLS on the new table: **enabled, no client policies** (server-side readers use `service_role`, which bypasses RLS).
- **Season label derives from the GW's deadline date, not `now()`**: `currentSeasonLabel(new Date(deadline_time))`. A July run capturing an August GW1 must label it `2026/27`, but `currentSeasonLabel(julyDate)` returns `2025/26`.
- **Freeze invariant is ours, not FPL's**: never upsert a GW whose deadline is in the past, even if FPL's `is_next` still points at it.
- Work on branch `feat/xpts-v2-snapshotter` (cut from `feat/xpts-v2-match-engine`, which holds the spec).

---

### Task 1: `player_gw_snapshots` table migration

**Files:**
- Create: `supabase/migrations/20260704100000_player_gw_snapshots.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `public.player_gw_snapshots` table with `PK (season, gw, player_id)` that Tasks 2–4 upsert into with `onConflict: 'season,gw,player_id'`.

- [ ] **Step 1: Create the branch**

```bash
git checkout feat/xpts-v2-match-engine
git checkout -b feat/xpts-v2-snapshotter
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260704100000_player_gw_snapshots.sql`:

```sql
-- Prospective per-GW capture of live-only FPL bootstrap fields (spec:
-- docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md §4).
-- ep_next / ownership / set-piece order are overwritten weekly by FPL and are
-- unrecoverable if not captured contemporaneously. Rows for a GW are upserted
-- by the fpl-ingest ?source=snapshot cron until the GW's deadline passes, then
-- never touched again — the surviving value is the last pre-deadline capture.
--
-- Season-scoped with NO FK to players: FPL element ids reset each season
-- (same rationale as player_gw_history).

create table public.player_gw_snapshots (
  season                                text        not null,
  gw                                    smallint    not null,
  player_id                             integer     not null,  -- FPL element id (season-scoped, NOT a FK)
  -- benchmark
  ep_next                               numeric(4,1) not null,
  ep_this                               numeric(4,1) not null,
  -- future v2.1+ features (live-only)
  selected_by_percent                   numeric(4,1) not null,
  penalties_order                       smallint,
  corners_and_indirect_freekicks_order  smallint,
  direct_freekicks_order                smallint,
  -- eval context
  now_cost                              smallint    not null,
  form                                  numeric(3,1) not null,
  status                                char(1)     not null,
  chance_of_playing_next_round          smallint,
  transfers_in_event                    integer     not null,
  transfers_out_event                   integer     not null,
  -- audit
  captured_at                           timestamptz not null,
  primary key (season, gw, player_id)
);

-- RLS on, NO client policies: only server-side jobs (service_role, which
-- bypasses RLS) write, and the Python eval harness reads via direct DB
-- connection. The app never queries this table.
alter table public.player_gw_snapshots enable row level security;

create index player_gw_snapshots_season_gw_idx
  on public.player_gw_snapshots (season, gw);
```

- [ ] **Step 3: Verify the migration applies**

If Docker is running (`supabase status` succeeds), apply all migrations from scratch:

```bash
supabase db reset
```

Expected: every migration applies; output ends with `Finished supabase db reset`. If Docker/the local stack is not available, verification defers to CI's `db push` — note that in the commit message body.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260704100000_player_gw_snapshots.sql
git commit -m "feat(db): player_gw_snapshots table for prospective capture (#107)"
```

---

### Task 2: Snapshot pure functions (`selectSnapshotGw`, `snapshotRows`)

**Files:**
- Create: `supabase/functions/fpl-ingest/sources/snapshot.ts`
- Test: `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes: `currentSeasonLabel(d: Date): string` from `../lib/calendar.ts`.
- Produces (used by Task 3):
  - `interface SnapshotEvent { id: number; is_next: boolean; deadline_time: string | null }`
  - `interface SnapshotElement` (13 fields, below)
  - `interface PlayerGwSnapshotRow` (DB row shape, below)
  - `selectSnapshotGw(events: SnapshotEvent[], now: Date): { gw: number; season: string } | null`
  - `snapshotRows(season: string, gw: number, elements: SnapshotElement[], capturedAt: string): PlayerGwSnapshotRow[]`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import {
  selectSnapshotGw,
  snapshotRows,
  type SnapshotElement,
  type SnapshotEvent,
} from '../sources/snapshot.ts';

// ---- selectSnapshotGw ------------------------------------------------------

const AUG_GW1: SnapshotEvent = { id: 1, is_next: true, deadline_time: '2026-08-15T10:00:00Z' };

Deno.test('selectSnapshotGw: is_next with a future deadline -> that gw', () => {
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-08-10T00:00:00Z'));
  assertEquals(out?.gw, 1);
});

Deno.test('selectSnapshotGw: season derives from the DEADLINE date, not now (July run -> 2026/27)', () => {
  // currentSeasonLabel(July 2026) would say "2025/26"; the August deadline says "2026/27".
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-07-10T00:00:00Z'));
  assertEquals(out, { gw: 1, season: '2026/27' });
});

Deno.test('selectSnapshotGw: no is_next event (off-season) -> null', () => {
  const events: SnapshotEvent[] = [{ id: 38, is_next: false, deadline_time: '2026-05-20T10:00:00Z' }];
  assertEquals(selectSnapshotGw(events, new Date('2026-06-20T00:00:00Z')), null);
});

Deno.test('selectSnapshotGw: is_next but deadline already passed -> null (freeze guard)', () => {
  const out = selectSnapshotGw([AUG_GW1], new Date('2026-08-15T10:00:01Z'));
  assertEquals(out, null);
});

Deno.test('selectSnapshotGw: deadline exactly now -> null (frozen at the deadline instant)', () => {
  assertEquals(selectSnapshotGw([AUG_GW1], new Date('2026-08-15T10:00:00Z')), null);
});

Deno.test('selectSnapshotGw: null deadline_time -> null', () => {
  const events: SnapshotEvent[] = [{ id: 1, is_next: true, deadline_time: null }];
  assertEquals(selectSnapshotGw(events, new Date('2026-07-10T00:00:00Z')), null);
});

Deno.test('selectSnapshotGw: mid-season May deadline -> prior-year season label', () => {
  const events: SnapshotEvent[] = [{ id: 36, is_next: true, deadline_time: '2027-05-01T10:00:00Z' }];
  const out = selectSnapshotGw(events, new Date('2027-04-28T00:00:00Z'));
  assertEquals(out, { gw: 36, season: '2026/27' });
});

// ---- snapshotRows ----------------------------------------------------------

function element(over: Partial<SnapshotElement> = {}): SnapshotElement {
  return {
    id: 100,
    ep_next: '5.5',
    ep_this: '4.0',
    selected_by_percent: '32.1',
    now_cost: 75,
    form: '6.2',
    status: 'a',
    chance_of_playing_next_round: null,
    transfers_in_event: 12345,
    transfers_out_event: 678,
    penalties_order: 1,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: 2,
    ...over,
  };
}

Deno.test('snapshotRows: maps one row per element with PK fields + captured_at', () => {
  const rows = snapshotRows('2026/27', 1, [element(), element({ id: 200 })], '2026-08-10T06:15:00Z');
  assertEquals(rows.length, 2);
  assertEquals(rows[0].season, '2026/27');
  assertEquals(rows[0].gw, 1);
  assertEquals(rows[0].player_id, 100);
  assertEquals(rows[1].player_id, 200);
  assertEquals(rows[0].captured_at, '2026-08-10T06:15:00Z');
});

Deno.test('snapshotRows: parses string-typed ep/ownership/form to numbers', () => {
  const r = snapshotRows('2026/27', 1, [element()], '2026-08-10T06:15:00Z')[0];
  assertEquals(r.ep_next, 5.5);
  assertEquals(r.ep_this, 4.0);
  assertEquals(r.selected_by_percent, 32.1);
  assertEquals(r.form, 6.2);
  assertEquals(typeof r.ep_next, 'number');
});

Deno.test('snapshotRows: unparseable numeric strings coerce to 0', () => {
  const r = snapshotRows('2026/27', 1, [element({ ep_next: '', form: 'x' })], 't')[0];
  assertEquals(r.ep_next, 0);
  assertEquals(r.form, 0);
});

Deno.test('snapshotRows: preserves nullable set-piece order and chance fields', () => {
  const r = snapshotRows('2026/27', 1, [element()], 't')[0];
  assertEquals(r.penalties_order, 1);
  assertEquals(r.corners_and_indirect_freekicks_order, null);
  assertEquals(r.direct_freekicks_order, 2);
  assertEquals(r.chance_of_playing_next_round, null);
});

Deno.test('snapshotRows: passes through integer/status fields', () => {
  const r = snapshotRows('2026/27', 1, [element({ status: 'd', chance_of_playing_next_round: 75 })], 't')[0];
  assertEquals(r.now_cost, 75);
  assertEquals(r.status, 'd');
  assertEquals(r.chance_of_playing_next_round, 75);
  assertEquals(r.transfers_in_event, 12345);
  assertEquals(r.transfers_out_event, 678);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test __tests__/snapshot.test.ts
```

Expected: FAIL — `Module not found ... sources/snapshot.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/fpl-ingest/sources/snapshot.ts`:

```ts
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
```

(`ingestSnapshot` is included here because the module is one file; its I/O tests come in Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test __tests__/snapshot.test.ts
```

Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/sources/snapshot.ts supabase/functions/fpl-ingest/__tests__/snapshot.test.ts
git commit -m "feat(ingest): snapshot source — pure GW/row builders (#107)"
```

---

### Task 3: `ingestSnapshot` I/O behavior

**Files:**
- Modify: `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts` (append)

**Interfaces:**
- Consumes: `ingestSnapshot(runId: string, deps: IngestSnapshotDeps): Promise<void>` and the types from Task 2.
- Produces: verified upsert/skip/log behavior that Task 4's routing relies on.

- [ ] **Step 1: Append the failing-or-passing I/O tests**

Append to `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts` (stub pattern copied from `history-capture.test.ts`):

```ts
import { ingestSnapshot, type IngestSnapshotDeps } from '../sources/snapshot.ts';

function makeSnapshotDeps(opts: {
  events: SnapshotEvent[];
  elements: SnapshotElement[];
  now: Date;
}): {
  deps: IngestSnapshotDeps;
  upserts: Array<{ table: string; rows: unknown[]; onConflict?: string }>;
  runUpdates: Array<Record<string, unknown>>;
} {
  const upserts: Array<{ table: string; rows: unknown[]; onConflict?: string }> = [];
  const runUpdates: Array<Record<string, unknown>> = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      return {
        upsert(rows: unknown[], upsertOpts?: { onConflict?: string }) {
          upserts.push({ table, rows, onConflict: upsertOpts?.onConflict });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, _val: string) {
              runUpdates.push(payload);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  const fetchStub: typeof fetch = (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('bootstrap-static')) {
      return Promise.resolve(
        new Response(JSON.stringify({ events: opts.events, elements: opts.elements }), { status: 200 }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  return { deps: { supabase, fetch: fetchStub, now: () => opts.now }, upserts, runUpdates };
}

Deno.test('ingestSnapshot: upserts one row per element for the next GW and closes success', async () => {
  const { deps, upserts, runUpdates } = makeSnapshotDeps({
    events: [AUG_GW1],
    elements: [element(), element({ id: 200, ep_next: '2.1' })],
    now: new Date('2026-08-10T06:15:00Z'),
  });

  await ingestSnapshot('run-1', deps);

  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].table, 'player_gw_snapshots');
  assertEquals(upserts[0].onConflict, 'season,gw,player_id');
  const rows = upserts[0].rows as Array<Record<string, unknown>>;
  assertEquals(rows.length, 2);
  assertEquals(rows[0].season, '2026/27');
  assertEquals(rows[0].gw, 1);
  assertEquals(rows[0].captured_at, '2026-08-10T06:15:00.000Z');
  assertEquals(rows[1].ep_next, 2.1);
  assertEquals(runUpdates.at(-1)?.status, 'success');
  assertEquals(runUpdates.at(-1)?.rows_upserted, 2);
});

Deno.test('ingestSnapshot: off-season (no is_next) -> skip, no upsert', async () => {
  const { deps, upserts, runUpdates } = makeSnapshotDeps({
    events: [{ id: 38, is_next: false, deadline_time: '2026-05-20T10:00:00Z' }],
    elements: [element()],
    now: new Date('2026-07-04T06:15:00Z'),
  });

  await ingestSnapshot('run-1', deps);

  assertEquals(upserts.length, 0);
  assertEquals(runUpdates.at(-1)?.status, 'skipped');
  assertEquals(runUpdates.at(-1)?.skip_reason, 'no upcoming gameweek deadline (off-season or frozen)');
});

Deno.test('ingestSnapshot: deadline passed but is_next stale -> skip (freeze guard)', async () => {
  const { deps, upserts, runUpdates } = makeSnapshotDeps({
    events: [AUG_GW1],
    elements: [element()],
    now: new Date('2026-08-15T11:00:00Z'), // 1h after the GW1 deadline
  });

  await ingestSnapshot('run-1', deps);

  assertEquals(upserts.length, 0);
  assertEquals(runUpdates.at(-1)?.status, 'skipped');
});
```

- [ ] **Step 2: Run the suite**

```bash
cd supabase/functions/fpl-ingest && deno test __tests__/snapshot.test.ts
```

Expected: PASS — 15 tests (the implementation landed in Task 2; these tests verify the I/O path against the stub. If any fail, fix `snapshot.ts`, not the tests, unless the test contradicts the spec).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fpl-ingest/__tests__/snapshot.test.ts
git commit -m "test(ingest): snapshot I/O — upsert, off-season skip, freeze guard (#107)"
```

---

### Task 4: Route `?source=snapshot` through the handler

**Files:**
- Modify: `supabase/functions/fpl-ingest/index.ts`
- Modify: `supabase/functions/fpl-ingest/lib/ingestion-runs.ts` (the `startRun` source union)
- Modify: `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts` (append routing test)
- Possibly modify: `supabase/functions/fpl-ingest/__tests__/index.test.ts` (if it asserts the 400 message text — check before editing)

**Interfaces:**
- Consumes: `ingestSnapshot` (Task 3), `handler(req, depsOverride)` from `index.ts`.
- Produces: `GET /fpl-ingest?source=snapshot` → 200 `{ ok: true, runId, source: 'snapshot' }`.

- [ ] **Step 1: Append the failing routing test**

Append to `supabase/functions/fpl-ingest/__tests__/snapshot.test.ts`:

```ts
import { handler } from '../index.ts';

Deno.test('handler: ?source=snapshot routes to ingestSnapshot and returns 200', async () => {
  const { deps } = makeSnapshotDeps({
    events: [AUG_GW1],
    elements: [element()],
    now: new Date('2026-08-10T06:15:00Z'),
  });
  // handler also inserts an ingestion_runs row via startRun -> stub needs insert()
  // deno-lint-ignore no-explicit-any
  const anySupabase = deps.supabase as any;
  const origFrom = anySupabase.from.bind(anySupabase);
  anySupabase.from = (table: string) => ({
    ...origFrom(table),
    insert(_row: Record<string, unknown>) {
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'run-x' }, error: null }),
        }),
      };
    },
  });

  const res = await handler(new Request('http://localhost/fpl-ingest?source=snapshot'), deps);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.source, 'snapshot');
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd supabase/functions/fpl-ingest && deno test __tests__/snapshot.test.ts
```

Expected: FAIL — the handler returns 400 (`invalid ?source=`) because `snapshot` is not in the `Source` union yet.

- [ ] **Step 3: Wire the route**

In `supabase/functions/fpl-ingest/index.ts`, change:

```ts
import { ingestHistory } from './sources/history.ts';
```
to:
```ts
import { ingestHistory } from './sources/history.ts';
import { ingestSnapshot } from './sources/snapshot.ts';
```

Change:
```ts
type Source = 'bootstrap' | 'fixtures' | 'history';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures' || s === 'history';
```
to:
```ts
type Source = 'bootstrap' | 'fixtures' | 'history' | 'snapshot';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures' || s === 'history' || s === 'snapshot';
```

Change the 400 message:
```ts
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures|history)' },
```
to:
```ts
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures|history|snapshot)' },
```

Change the dispatch:
```ts
    } else {
      await ingestHistory(runId, deps);
    }
```
to:
```ts
    } else if (source === 'history') {
      await ingestHistory(runId, deps);
    } else {
      await ingestSnapshot(runId, deps);
    }
```

In `supabase/functions/fpl-ingest/lib/ingestion-runs.ts`, change the `startRun` signature:
```ts
  source: 'bootstrap' | 'fixtures' | 'history',
```
to:
```ts
  source: 'bootstrap' | 'fixtures' | 'history' | 'snapshot',
```

- [ ] **Step 4: Check `index.test.ts` for the old 400 message**

```bash
grep -n "expected bootstrap" supabase/functions/fpl-ingest/__tests__/index.test.ts
```

If it asserts the old literal `(expected bootstrap|fixtures|history)`, update that assertion to `(expected bootstrap|fixtures|history|snapshot)`.

- [ ] **Step 5: Run the FULL fpl-ingest suite**

```bash
cd supabase/functions/fpl-ingest && deno test
```

Expected: PASS — all suites (snapshot + history + bootstrap + fixtures + index + libs).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/fpl-ingest/index.ts supabase/functions/fpl-ingest/lib/ingestion-runs.ts supabase/functions/fpl-ingest/__tests__/snapshot.test.ts supabase/functions/fpl-ingest/__tests__/index.test.ts
git commit -m "feat(ingest): route ?source=snapshot through the handler (#107)"
```

---

### Task 5: `ingestion_runs` CHECK widening + 6-hourly cron migration

**Files:**
- Create: `supabase/migrations/20260704110000_snapshot_source_and_cron.sql`

**Interfaces:**
- Consumes: the deployed `?source=snapshot` route (Task 4) and the Vault secrets (`supabase_url`, `supabase_anon_key`) seeded for the existing fpl-ingest crons.
- Produces: `ingestion_runs.source` accepts `'snapshot'`; cron job `fpl-ingest-snapshot` fires 00:15/06:15/12:15/18:15 UTC.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260704110000_snapshot_source_and_cron.sql`:

```sql
-- Allow 'snapshot' as an ingestion source (fpl-ingest ?source=snapshot) and
-- schedule the 6-hourly prospective capture. A missed snapshot window is
-- unrecoverable (live-only fields), so frequency is the redundancy: one failed
-- run costs ~6h staleness, not a gameweek. Off-season runs no-op cleanly, so
-- this deploys now and arms itself when FPL publishes the 2026/27 calendar.
-- :15 offset avoids the 02:00 bootstrap / 03:00 fixtures / 03:30 history jobs.

alter table public.ingestion_runs
  drop constraint ingestion_runs_source_check,
  add constraint ingestion_runs_source_check
    check (source in ('bootstrap', 'fixtures', 'history', 'snapshot'));

select cron.schedule(
  'fpl-ingest-snapshot',
  '15 0,6,12,18 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=snapshot',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Verify migrations apply**

Same as Task 1 Step 3: `supabase db reset` if the local stack is available, otherwise defer to CI.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704110000_snapshot_source_and_cron.sql
git commit -m "feat(db): allow snapshot ingestion source + 6-hourly capture cron (#107)"
```

---

### Task 6: Final verification + PR

**Files:** none new.

- [ ] **Step 1: Full Deno suite one more time**

```bash
cd supabase/functions/fpl-ingest && deno test
```

Expected: PASS, zero failures.

- [ ] **Step 2: Confirm repo toolchain untouched**

```bash
git diff --stat feat/xpts-v2-match-engine..HEAD -- 'src/*' 'package.json'
```

Expected: empty (this plan touches only `supabase/**` and docs — the app/jest/tsc surface is unchanged, so `npm test`/`tsc` runs are not required).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/xpts-v2-snapshotter
gh pr create --title "feat(ingest): prospective per-GW snapshot capture (#107)" --body "$(cat <<'EOF'
## Summary
- New `player_gw_snapshots` table + `fpl-ingest ?source=snapshot` + 6-hourly cron
- Captures live-only FPL fields (ep_next, ownership, set-piece order, price, status) per upcoming GW, frozen at each deadline
- Off-season runs no-op cleanly → deploy now, arms itself when the 2026/27 calendar lands
- Deadline-bound: must be live before GW1 (~2026-08-15) — these fields are unrecoverable

Spec: docs/superpowers/specs/2026-07-04-xpts-v2-match-engine-design.md (§4)
Part 1 of #107 (xPts v2). No client changes; no CI changes (fpl-ingest already deployed by name).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created against `main`.

---

## Self-review checklist (spec §4 coverage)

- Table + PK + season-scoped no-FK + RLS-no-policies → Task 1 ✓
- Upsert-until-deadline-freezes semantics + freeze guard being OURS → Tasks 2–3 ✓
- Season label from deadline date (July→GW1 bug) → Task 2 ✓
- 6-hourly cron, Vault pattern, `:15` offset, off-season no-op → Tasks 3, 5 ✓
- `ingestion_runs` CHECK widening → Task 5 ✓
- No CI change (query param, not new function) → Global Constraints + Task 6 ✓
- Tests mirror `history.test.ts` conventions → Tasks 2–4 ✓
