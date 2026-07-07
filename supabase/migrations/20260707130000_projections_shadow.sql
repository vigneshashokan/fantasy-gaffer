-- #128: shadow-serving target for the v3.1 candidate
-- (spec docs/superpowers/specs/2026-07-07-xpts-serving-revival-design.md §4).
-- Mirrors public.projections (the frozen client contract) plus nullable depth
-- columns unique to the simulator. NO FK on player_id: FPL element ids are
-- season-scoped and the shadow writer must not depend on the players table.
-- RLS enabled with NO policies: service-role only — client exposure of depth
-- data is a separate post-promotion product decision.

create table public.projections_shadow (
  player_id      integer  not null,
  gw             smallint not null,
  p25            numeric(4,1) not null,
  p50            numeric(4,1) not null,
  p75            numeric(4,1) not null,
  model_version  text     not null,
  computed_at    timestamptz not null default now(),
  mean           numeric(5,2),
  p_goal         numeric(4,3),
  p_assist       numeric(4,3),
  p_cs           numeric(4,3),
  p_haul         numeric(4,3),
  p60            numeric(4,3),
  primary key (player_id, gw)
);

alter table public.projections_shadow enable row level security;

create index projections_shadow_gw_idx on public.projections_shadow (gw);
