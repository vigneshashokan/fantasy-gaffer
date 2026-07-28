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
