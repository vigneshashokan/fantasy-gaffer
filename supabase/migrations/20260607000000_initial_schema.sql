-- Initial application schema for issue #11.
--
-- Drops the smoke-test `health` table from #10 (no longer needed — real
-- tables exist now) and creates the three foundation tables:
--   - profiles            (1:1 with auth.users, app-specific user data)
--   - notification_prefs  (1:1 with auth.users, push channel toggles)
--   - push_tokens         (1:many with auth.users, one row per device)
--
-- All three are gated by RLS: owners can read/write their own row only.
-- The service_role key (used by future server-side jobs) bypasses RLS by design.
-- The anon role gets no access.

----------------------------------------------------------------------
-- Cleanup: drop the smoke-test table from #10.
----------------------------------------------------------------------
drop table if exists public.health;

----------------------------------------------------------------------
-- profiles
----------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  first_name   text    not null,
  last_name    text    not null,
  dob          date    not null,
  fpl_team_id  integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_dob_coppa check (dob <= current_date - interval '13 years')
);

alter table public.profiles enable row level security;

create policy "profiles: own row select" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles: own row insert" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles: own row update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;

----------------------------------------------------------------------
-- notification_prefs
----------------------------------------------------------------------
create table public.notification_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  deadlines   boolean not null default true,
  prices      boolean not null default true,
  gw_confirm  boolean not null default true,
  transfer    boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs: own row select" on public.notification_prefs
  for select using (auth.uid() = user_id);

create policy "notification_prefs: own row insert" on public.notification_prefs
  for insert with check (auth.uid() = user_id);

create policy "notification_prefs: own row update" on public.notification_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.notification_prefs to authenticated;

----------------------------------------------------------------------
-- push_tokens
----------------------------------------------------------------------
create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens: own rows select" on public.push_tokens
  for select using (auth.uid() = user_id);

create policy "push_tokens: own rows insert" on public.push_tokens
  for insert with check (auth.uid() = user_id);

create policy "push_tokens: own rows update" on public.push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_tokens: own rows delete" on public.push_tokens
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

create index push_tokens_user_id_idx       on public.push_tokens (user_id);
create index push_tokens_last_seen_at_idx  on public.push_tokens (last_seen_at);
