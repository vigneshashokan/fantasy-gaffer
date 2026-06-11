-- FPL reference data tables for issue #20.
--
-- Four tables:
--   - clubs            (20 rows; FPL teams)
--   - players          (~600 rows; FPL elements)
--   - fixtures         (~380 rows per season)
--   - ingestion_runs   (operator-facing; one row per cron fire)
--
-- RLS: clubs/players/fixtures are SELECT-only for `authenticated`; writes
-- go through service_role (Edge Function only). ingestion_runs is
-- service_role only.

----------------------------------------------------------------------
-- clubs
----------------------------------------------------------------------
create table public.clubs (
  id                       smallint  primary key,
  name                     text      not null,
  short_name               text      not null,
  code                     integer   not null,
  strength_overall_home    smallint  not null,
  strength_overall_away    smallint  not null,
  strength_attack_home     smallint  not null,
  strength_attack_away     smallint  not null,
  strength_defence_home    smallint  not null,
  strength_defence_away    smallint  not null,
  updated_at               timestamptz not null default now()
);

alter table public.clubs enable row level security;

create policy "clubs: authenticated select" on public.clubs
  for select to authenticated using (true);

grant select on public.clubs to authenticated;

----------------------------------------------------------------------
-- players
----------------------------------------------------------------------
create table public.players (
  id                              integer   primary key,
  web_name                        text      not null,
  full_name                       text      not null,
  team_id                         smallint  not null references public.clubs(id),
  position                        text      not null check (position in ('GKP','DEF','MID','FWD')),
  now_cost                        smallint  not null,
  form                            numeric(3,1) not null,
  total_points                    smallint  not null,
  status                          char(1)   not null,
  news                            text      not null default '',
  news_added                      timestamptz,
  chance_of_playing_next_round    smallint,
  ep_next                         numeric(4,1) not null,
  ep_this                         numeric(4,1) not null,
  selected_by_percent             numeric(4,1) not null,
  ict_index                       numeric(5,1) not null,
  bps                             integer   not null,
  transfers_in_event              integer   not null,
  updated_at                      timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "players: authenticated select" on public.players
  for select to authenticated using (true);

grant select on public.players to authenticated;

create index players_team_id_idx  on public.players (team_id);
create index players_position_idx on public.players (position);
create index players_status_idx   on public.players (status) where status <> 'a';

----------------------------------------------------------------------
-- fixtures
----------------------------------------------------------------------
create table public.fixtures (
  id                     integer  primary key,
  event                  smallint,
  kickoff_time           timestamptz,
  team_h                 smallint not null references public.clubs(id),
  team_a                 smallint not null references public.clubs(id),
  team_h_difficulty      smallint not null,
  team_a_difficulty      smallint not null,
  team_h_score           smallint,
  team_a_score           smallint,
  started                boolean  not null default false,
  finished               boolean  not null default false,
  finished_provisional   boolean  not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.fixtures enable row level security;

create policy "fixtures: authenticated select" on public.fixtures
  for select to authenticated using (true);

grant select on public.fixtures to authenticated;

create index fixtures_event_idx        on public.fixtures (event);
create index fixtures_kickoff_idx      on public.fixtures (kickoff_time);
create index fixtures_team_h_event_idx on public.fixtures (team_h, event);
create index fixtures_team_a_event_idx on public.fixtures (team_a, event);

----------------------------------------------------------------------
-- ingestion_runs
----------------------------------------------------------------------
create table public.ingestion_runs (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('bootstrap','fixtures')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null check (status in ('success','skipped','error')),
  skip_reason     text,
  rows_upserted   integer,
  content_hash    text,
  error_message   text
);

alter table public.ingestion_runs enable row level security;
-- No policies and no grants: service_role bypasses RLS; authenticated/anon
-- have no access. Operator-only table, queried via Studio SQL.

create index ingestion_runs_source_started_idx
  on public.ingestion_runs (source, started_at desc);
