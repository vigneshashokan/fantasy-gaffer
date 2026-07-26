-- Two ingest-reliability fixes (#177).
--
-- 1. ingestion_runs.status gains 'running'.
--
--    startRun inserted a provisional 'success' that finish/skip/error later
--    corrected. But errorRun only fires on a thrown JS error, so an isolate
--    kill mid-run left the optimistic row behind claiming the run had
--    succeeded — precisely the failure the ledger exists to make visible.
--
--    Runs now open as 'running' and are closed by the existing paths. A row
--    still marked 'running' well after its started_at is a run that died, and
--    now reads that way.
--
--    Ships together with the code change: startRun writes 'running' from the
--    same commit, so this constraint must be in place before it deploys.
--
-- 2. projections p25/p50/p75 widen from numeric(4,1) to numeric(6,1).
--
--    numeric(4,1) caps at 999.9. The model writes p-values RAW — that is a
--    documented v2 decision, since flooring naively would break p25 <= p50 <=
--    p75 — so one out-of-distribution input at 1000+ raised a numeric overflow
--    that failed the ENTIRE nightly upsert, not just the offending row. The
--    widened range keeps a bad row from taking every good one with it.
--    projections_shadow already uses plain `numeric`.

alter table public.ingestion_runs
  drop constraint if exists ingestion_runs_status_check;

alter table public.ingestion_runs
  add constraint ingestion_runs_status_check
  check (status in ('success', 'skipped', 'error', 'running'));

alter table public.projections
  alter column p25 type numeric(6,1),
  alter column p50 type numeric(6,1),
  alter column p75 type numeric(6,1);
