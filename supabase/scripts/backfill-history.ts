// Standalone one-time backfill of 2025/26 per-GW history into player_gw_history.
//
// Run (local stack):
//   export SUPABASE_URL=http://127.0.0.1:54321
//   export SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
//   deno run --allow-net --allow-env \
//     --config supabase/functions/fpl-ingest/deno.json \
//     supabase/scripts/backfill-history.ts
//
// Flags: --season=2025/26  --limit=N  --dry-run  --delay-ms=120

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../functions/fpl-ingest/lib/fpl-client.ts';
import { createAdminClient } from '../functions/fpl-ingest/lib/supabase-admin.ts';
import {
  normalizePlayers,
  type BootstrapStaticResponse,
} from '../functions/fpl-ingest/sources/bootstrap.ts';
import {
  normalizeHistory,
  type ElementSummaryResponse,
  type PlayerGwHistoryRow,
} from '../functions/fpl-ingest/sources/history.ts';

export interface BackfillDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

export interface BackfillOpts {
  season: string;
  limit?: number;
  dryRun?: boolean;
  delayMs?: number;
}

export interface FixtureTeams {
  team_h: number;
  team_a: number;
}

/** A row's true team is derived from its own fixture (home side or away side),
 * never from the player's current club — mid-season transfers otherwise
 * mislabel every pre-transfer row. Rows whose fixture is unknown are left
 * unchanged (and counted, so the caller can log). */
export function remapTeamIds(
  rows: PlayerGwHistoryRow[],
  fixtures: Map<number, FixtureTeams>,
): { remapped: number; unknownFixtures: number } {
  let remapped = 0;
  let unknownFixtures = 0;
  for (const row of rows) {
    const fx = fixtures.get(row.fixture_id);
    if (!fx) {
      unknownFixtures++;
      continue;
    }
    const trueTeam = row.was_home ? fx.team_h : fx.team_a;
    if (row.team_id !== trueTeam) {
      row.team_id = trueTeam;
      remapped++;
    }
  }
  return { remapped, unknownFixtures };
}

const CHUNK = 500;

export async function runBackfill(
  deps: BackfillDeps,
  opts: BackfillOpts,
): Promise<{ players: number; rows: number }> {
  const delayMs = opts.delayMs ?? 120;

  const boot = await fetchJson<BootstrapStaticResponse>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { fetch: deps.fetch },
  );
  let players = normalizePlayers(boot); // { id, position, team_id, ... }
  if (opts.limit !== undefined) players = players.slice(0, opts.limit);

  const fixturesList = await fetchJson<Array<{ id: number; team_h: number; team_a: number }>>(
    'https://fantasy.premierleague.com/api/fixtures/',
    { fetch: deps.fetch },
  );
  const fixtureMap = new Map<number, FixtureTeams>(
    fixturesList.map((f) => [f.id, { team_h: f.team_h, team_a: f.team_a }]),
  );

  const allRows: PlayerGwHistoryRow[] = [];
  let done = 0;
  for (const p of players) {
    const summary = await fetchJson<ElementSummaryResponse>(
      `https://fantasy.premierleague.com/api/element-summary/${p.id}/`,
      { fetch: deps.fetch },
    );
    allRows.push(
      ...normalizeHistory(opts.season, { position: p.position, teamId: p.team_id }, summary.history),
    );
    done++;
    if (done % 50 === 0) deps.log(`fetched ${done}/${players.length} players, ${allRows.length} rows`);
    if (delayMs > 0) await deps.sleep(delayMs);
  }

  const { remapped, unknownFixtures } = remapTeamIds(allRows, fixtureMap);
  deps.log(`team_id remap: ${remapped} corrected, ${unknownFixtures} unknown fixtures`);

  if (!opts.dryRun) {
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error } = await deps.supabase
        .from('player_gw_history')
        .upsert(chunk, { onConflict: 'season,player_id,fixture_id' });
      if (error) throw error;
    }
  }

  deps.log(`done: ${players.length} players, ${allRows.length} rows${opts.dryRun ? ' (dry-run, not written)' : ''}`);
  return { players: players.length, rows: allRows.length };
}

function parseArgs(args: string[]): BackfillOpts {
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  return {
    season: get('season') ?? '2025/26',
    limit: get('limit') ? Number(get('limit')) : undefined,
    dryRun: args.includes('--dry-run'),
    delayMs: get('delay-ms') ? Number(get('delay-ms')) : undefined,
  };
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  const deps: BackfillDeps = {
    supabase: opts.dryRun ? (undefined as unknown as SupabaseClient) : createAdminClient(),
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => console.log(`[backfill] ${m}`),
  };
  const result = await runBackfill(deps, opts);
  console.log(`[backfill] complete:`, result);
}
