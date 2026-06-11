-- Cron schedules for the FPL ingestion Edge Function (issue #20).
--
-- pg_cron fires on UTC. Two entries:
--   - 'fpl-ingest-bootstrap': Mon + Tue 02:00 UTC. Calendar gate inside the
--     function decides whether to actually fetch.
--   - 'fpl-ingest-fixtures': Tue 03:00 UTC. Content-hash gate inside the
--     function decides whether to upsert.
--
-- The URL + anon key live in Supabase Vault (operator runs the
-- vault.create_secret calls once per environment — see docs/architecture.md).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'fpl-ingest-bootstrap',
  '0 2 * * 1,2',
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

select cron.schedule(
  'fpl-ingest-fixtures',
  '0 3 * * 2',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=fixtures',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
