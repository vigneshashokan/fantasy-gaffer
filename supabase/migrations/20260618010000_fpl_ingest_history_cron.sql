-- Per-GW history capture cron (fpl-ingest ?source=history).
-- Daily 03:30 UTC — after the Tue bootstrap (02:00) + fixtures (03:00) jobs.
-- The function is self-healing: it captures any finished+data_checked GW not
-- yet in player_gw_history, so a daily fire is a cheap no-op on quiet days and
-- catches weekend- and midweek-settling GWs with ~a day's lag.
-- Reuses the Vault secrets seeded for the other fpl-ingest jobs.

select cron.schedule(
  'fpl-ingest-history',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=history',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
