-- Two changes to the scheduled function calls.
--
-- 1. (#165) Every job now sends `x-ingest-secret`, read from Vault. The edge
--    functions deploy with --no-verify-jwt and, until now, checked nothing, so
--    anyone who read the anon key out of the shipped app bundle could invoke a
--    full FPL fetch and ~600-player upsert, insert unbounded ingestion_runs
--    rows, or hammer fantasy.premierleague.com from our egress IP under a fixed
--    User-Agent. Re-enabling JWT verification would not have helped — the anon
--    key is in the bundle. The secret is the one thing the client never sees.
--
--    The functions FAIL CLOSED on an unset secret, so seed it BEFORE this
--    migration reaches an environment:
--
--      supabase secrets set INGEST_SHARED_SECRET=<value>              -- function side
--      select vault.create_secret('<value>', 'ingest_shared_secret'); -- cron side
--
--    Both must hold the same value.
--
-- 2. (#177) fpl-ingest-fixtures moves from Tuesdays to daily. It was scheduled
--    '0 3 * * 2' and never revisited, while every downstream comment assumed
--    daily. A midweek postponement or double-gameweek announcement left the
--    fixtures table up to six days stale — fpl-project projecting points for a
--    moved fixture, history capture joining the wrong event, chip and FDR advice
--    wrong for days — and a failed Tuesday run was not retried for a week. The
--    content-hash gate in fixtures.ts keeps quiet days cheap.
--
--    It runs at 03:15, between bootstrap (03:00) and history (03:30), so the
--    three jobs do not fetch from FPL concurrently on one egress IP.
--
-- cron.schedule upserts by job name, so re-declaring updates in place. Do NOT
-- unschedule first: that errors when the job is absent, e.g. a fresh
-- environment applying migrations in order.

-- Helper-free by design: net.http_post is called identically in each job so a
-- reader can see the whole request in one place.

select cron.schedule(
  'fpl-ingest-bootstrap',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=bootstrap',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fpl-ingest-fixtures',
  '15 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=fixtures',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fpl-ingest-history',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=history',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fpl-ingest-snapshot',
  '15 0,6,12,18 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=snapshot',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fpl-project',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-project',
    headers := jsonb_build_object(
      'Authorization',   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_shared_secret'),
      'Content-Type',    'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
