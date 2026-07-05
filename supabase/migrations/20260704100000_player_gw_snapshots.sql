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
  -- injury-news text + when it landed: the injury TYPE ("hamstring" vs "knock")
  -- and news-vs-deadline timing exist ONLY here; feeds the v2.1 minutes model
  -- (#127) and injury-proneness advice (#132). Live-only -> capture or lose.
  news                                  text        not null,
  news_added                            timestamptz,
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
