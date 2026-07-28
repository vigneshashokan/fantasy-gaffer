-- #212: daily season-history ingest. Runs at 03:45 UTC — after the daily
-- bootstrap (03:00, since 20260625...) so players.code is fresh, and after the
-- history capture (03:30), before fpl-project (04:00) reads the seeds.
--
-- Self-limiting: the source skips wholesale once every player has a row, so
-- after the first saturating run this is a single cheap query per day. Only
-- genuinely new entrants cost API calls.
--
-- Block copied verbatim from 20260726120000_cron_shared_secret_and_daily_fixtures.sql
-- (the most recent cron migration — supersedes the older shape in
-- 20260704110000_snapshot_source_and_cron.sql, which predates the #165
-- x-ingest-secret gate and would silently 401 every run if reused as-is).
-- Only the job name, schedule and ?source= differ.
select cron.schedule(
  'fpl-ingest-season-history',
  '45 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=season-history',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
