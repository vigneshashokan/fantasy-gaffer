-- Allow 'snapshot' as an ingestion source (fpl-ingest ?source=snapshot) and
-- schedule the 6-hourly prospective capture. A missed snapshot window is
-- unrecoverable (live-only fields), so frequency is the redundancy: one failed
-- run costs ~6h staleness, not a gameweek. Off-season runs no-op cleanly, so
-- this deploys now and arms itself when FPL publishes the 2026/27 calendar.
-- :15 offset avoids the 03:00 bootstrap+fixtures / 03:30 history / 04:00 project jobs.

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
