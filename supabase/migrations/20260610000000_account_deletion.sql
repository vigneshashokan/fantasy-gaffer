-- Soft-delete + cron-purge for account deletion (issue #19).
--
-- Architecture:
--   - account_deletions is a one-row-per-user "this user is queued for hard
--     delete" table. Owner can INSERT (mark), SELECT (see pending state),
--     DELETE (restore). No UPDATE — the row is write-once.
--   - purge_expired_account_deletions() runs as security definer so pg_cron
--     can DELETE from auth.users. The existing ON DELETE CASCADE on
--     profiles / notification_prefs / push_tokens (and every future
--     user-owned table) wipes related rows in one shot.
--   - The account_deletions row itself disappears via its own
--     ON DELETE CASCADE FK back to auth.users.
--   - pg_cron schedules the function daily at 03:00 UTC.

create extension if not exists pg_cron;

----------------------------------------------------------------------
-- account_deletions
----------------------------------------------------------------------
create table public.account_deletions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;

create policy "account_deletions: own row select" on public.account_deletions
  for select using (auth.uid() = user_id);

create policy "account_deletions: own row insert" on public.account_deletions
  for insert with check (auth.uid() = user_id);

create policy "account_deletions: own row delete" on public.account_deletions
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.account_deletions to authenticated;
-- No UPDATE: the row is immutable once written.

----------------------------------------------------------------------
-- purge_expired_account_deletions()
----------------------------------------------------------------------
create or replace function public.purge_expired_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
   where id in (
     select user_id from public.account_deletions
      where requested_at < now() - interval '30 days'
   );
end;
$$;

-- Restrict execution: only postgres (the pg_cron runner) may invoke the
-- function. Without this, any authenticated user could trigger the sweep
-- via Supabase's REST RPC endpoint.
revoke execute on function public.purge_expired_account_deletions() from public;
grant execute on function public.purge_expired_account_deletions() to postgres;

----------------------------------------------------------------------
-- Daily 03:00 UTC sweep
----------------------------------------------------------------------
select cron.schedule(
  'purge-expired-account-deletions',
  '0 3 * * *',
  $$select public.purge_expired_account_deletions();$$
);
