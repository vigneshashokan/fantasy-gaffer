-- Add the FPL points-component columns player_gw_history never captured:
-- saves, penalty saves/misses, cards, own goals. Needed by the #129 event
-- decomposition (explicit save/card modelling; the residual approach works
-- without them, but the raw columns preserve optionality).
--
-- Timing: captured 2026-07-06 while the FPL API still serves 2025/26 —
-- element-summary per-fixture rows become unrecoverable at season rollover.
-- The 2025/26 values are filled by a local re-run of
-- supabase/scripts/backfill-history.ts (idempotent upsert). Rows ingested
-- before this migration in environments where no re-backfill runs (prod)
-- keep the 0 default for 2025/26; the daily in-season capture
-- (fpl-ingest ?source=history) fills the columns from 2026/27 GW1 onward.

alter table public.player_gw_history
  add column saves            smallint not null default 0,
  add column penalties_saved  smallint not null default 0,
  add column penalties_missed smallint not null default 0,
  add column yellow_cards     smallint not null default 0,
  add column red_cards        smallint not null default 0,
  add column own_goals        smallint not null default 0;
