-- Allow 'history' as an ingestion source for the per-GW history capture
-- (fpl-ingest ?source=history). The inline column CHECK from
-- 20260610010000_fpl_reference_data.sql is auto-named ingestion_runs_source_check.
alter table public.ingestion_runs
  drop constraint ingestion_runs_source_check,
  add constraint ingestion_runs_source_check
    check (source in ('bootstrap', 'fixtures', 'history'));
