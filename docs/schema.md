# Database Schema

Authoritative source: `supabase/migrations/20260607000000_initial_schema.sql`.
This doc is the human-readable map of what's in the DB and why.

## Scope

Three tables in the `public` schema, plus the Supabase-managed `auth.users` for identity. We deliberately do **not** persist FPL game state (squads, transfers, fixtures, chip usage, gameweek points) — that's the official FPL API's responsibility and is fetched live + cached client-side via TanStack Query. We are an "extended view" of FPL, not a parallel ledger.

## Relationships

```
auth.users                (Supabase-managed)
   │
   ├── profiles           (1:1, FK + cascade on delete)
   ├── notification_prefs (1:1, FK + cascade on delete)
   └── push_tokens        (1:many — one row per device, FK + cascade)
```

## `public.profiles`

App-specific user data. Always 1:1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | FK → `auth.users(id)` `on delete cascade` |
| `first_name` | `text NOT NULL` | OAuth pre-fills from `raw_user_meta_data->>'given_name'`; user confirms on completion screen |
| `last_name` | `text NOT NULL` | Same as `first_name` |
| `dob` | `date NOT NULL` | Required by COPPA. A CHECK constraint refuses anyone under 13 even if client checks are bypassed |
| `fpl_team_id` | `integer` | Nullable until the user links a team (own onboarding step, see #22) |
| `created_at` / `updated_at` | `timestamptz` | App sets `updated_at = now()` on UPDATE; no Postgres trigger for MVP |

**COPPA constraint:** `check (dob <= current_date - interval '13 years')`. Belt-and-suspenders to the client-side age check.

## `public.notification_prefs`

Push channel toggles. One column per channel — the channel list is small and stable, so a row-per-channel shape adds no flexibility.

| Column | Type | Default | Notes |
|---|---|---|---|
| `user_id` | `uuid` PK | — | FK → `auth.users(id)` `on delete cascade` |
| `deadlines` | `boolean NOT NULL` | `true` | Gameweek deadline reminders |
| `prices` | `boolean NOT NULL` | `true` | Player price rises / falls |
| `gw_confirm` | `boolean NOT NULL` | `true` | When your XI is locked in |
| `transfer` | `boolean NOT NULL` | `false` | Transfer window open — defaults off (noisy) |
| `updated_at` | `timestamptz` | `now()` | |

Adding a 5th channel later is a one-line `ALTER TABLE`.

## `public.push_tokens`

One row per device. Multi-device support and token rotation both work cleanly with this shape.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` — separate from `(user_id, token)` so individual rows can be unregistered by ID |
| `user_id` | `uuid NOT NULL` | FK → `auth.users(id)` `on delete cascade` |
| `token` | `text NOT NULL` | Expo push token, e.g. `ExponentPushToken[...]` — treated as opaque |
| `platform` | `text NOT NULL` | `check (platform in ('ios', 'android', 'web'))` |
| `created_at` | `timestamptz` | |
| `last_seen_at` | `timestamptz` | Bumped on app open. The Phase 4 cleanup job deletes tokens not seen in 90 days |
| `unique (user_id, token)` | — | Prevents the same device being recorded twice |

Index: `(last_seen_at)` for the cleanup job. The `(user_id, token)` unique constraint also produces a B-tree index, which Postgres uses to satisfy `user_id`-only queries.

## Profile-creation flow (no auto-trigger)

The standard Supabase pattern is a Postgres trigger that auto-creates a `profiles` row on `auth.users INSERT`. We deliberately do **not** install that trigger.

The reason: our `profiles` table has `NOT NULL` columns (`first_name`, `last_name`, `dob`) that OAuth providers don't always supply. Google gives `given_name`/`family_name` but no `dob`. Apple gives name only on the very first sign-in if the user shared it. If we kept the trigger with NOT NULL columns, OAuth signups would fail at INSERT time, leaving a broken half-state (`auth.users` row but no `profiles` row).

Instead we use **profile-as-gate**:

1. Auth row creation creates only the `auth.users` row.
2. App routing checks for a `profiles` row after sign-in. If absent → force the "Complete your profile" screen.
3. Completion screen collects `first_name`, `last_name`, `dob`. For OAuth users it pre-fills from `raw_user_meta_data` so the user confirms rather than retypes.
4. Client-side COPPA check; under-13 is refused with a clear message. No row written.
5. On submit, the client `INSERT`s the `profiles` row directly (RLS allows users to insert their own row only). The CHECK constraint on `dob` is the DB-level guarantee.
6. The same client step `INSERT`s a default `notification_prefs` row so toggle changes immediately persist.

This makes the gate visible to the user (they understand what's happening) rather than relying on a hidden trigger.

## Row Level Security summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row | own row | own row | — (cascade from auth) |
| `notification_prefs` | own row | own row | own row | — (cascade from auth) |
| `push_tokens` | own rows | own rows | own rows | own rows |

`service_role` bypasses RLS by design — used only server-side by future jobs (e.g. the push-send worker). The `anon` role has no access; it only powers session bootstrap via Supabase Auth.

## Future tables (deferred to other issues)

- `squads` — server-side cache for the live-scoring push job (#37). Until then, squads are fetched live from FPL on every render and cached client-side via TanStack Query.
- `players`, `fixtures` — populated by the FPL data ingestion service (#20).
- Anything else — appears only when a feature genuinely requires it.
