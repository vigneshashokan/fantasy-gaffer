-- Widen the FPL bootstrap ingest from Mon+Tue to DAILY so player prices
-- (now_cost), status, news, form, and ep_next refresh every morning in-season
-- (#38). FPL re-prices nightly ~01:30-02:30 UK; 03:00 UTC clears that lock in
-- both BST (04:00 UK) and GMT (03:00 UK).
--
-- cron.schedule upserts by job name, so re-scheduling 'fpl-ingest-bootstrap'
-- updates its schedule in place. Do NOT cron.unschedule first (it errors when
-- the job is absent, e.g. a fresh environment applying migrations in order).
--
-- The function's own gate (!isPLSeasonActive && !isInTransferWindow -> skipRun)
-- keeps the daily run firing in-season and cheaply skipping off-season.

select cron.schedule(
  'fpl-ingest-bootstrap',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=bootstrap',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
