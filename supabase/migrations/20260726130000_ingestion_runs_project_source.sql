-- Allow 'project' as an ingestion source, so the nightly fpl-project run lands
-- in the same ledger as every other scheduled job (#194).
--
-- Until now fpl-project wrote nothing to ingestion_runs: a failure left no
-- trace outside the function logs, and #169's legitimate skip path
-- ('no-history-for-season') was indistinguishable from the job never having
-- run at all. #163 showed this function can fail silently AND plausibly.
--
-- Same drop/re-add shape as 20260618000000 and 20260704110000 — the CHECK is
-- the auto-named inline one from 20260610010000_fpl_reference_data.sql.
alter table public.ingestion_runs
  drop constraint ingestion_runs_source_check,
  add constraint ingestion_runs_source_check
    check (source in ('bootstrap', 'fixtures', 'history', 'snapshot', 'project'));
