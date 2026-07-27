# Privacy request runbook (#77)

How to handle a data-subject request that lands in `privacy@fantasy-gaffer.com`.

**SLA: 30 days from receipt** (GDPR Art. 12(3); CCPA is 45). Acknowledge on
arrival, then fulfil. Extending to 60 days is allowed for complex requests but
you must tell the requester within the first 30.

**Verify identity before doing anything.** Only act on a request sent from the
account's own registered email address. If it comes from anywhere else, reply
asking them to resend from the account email — do not accept a screenshot or a
stated user id as proof.

## What we actually hold

Five places, and only the first is ours:

| Where | What | Keyed by |
|---|---|---|
| `auth.users` | email, timestamps, sign-in providers | `id` (uuid) |
| `public.profiles` | first/last name, DOB, FPL team id | `user_id` |
| `public.notification_prefs` | four booleans | `user_id` |
| `public.push_tokens` | Expo/APNs device tokens | `user_id` |
| `public.account_deletions` | pending-deletion marker | `user_id` |
| PostHog | product-interaction events | `distinct_id` = user id |
| Sentry | crash/performance events | `user.id` = user id |

Everything else in the database — `players`, `clubs`, `fixtures`,
`projections`, `player_gw_history`, `player_gw_snapshots` — is public FPL
reference data. It contains no user data and is out of scope for every request
type below.

**We do not store squads, picks, transfers, or chips.** Those are read live
from the public FPL API at request time and never persisted (see CLAUDE.md →
"Reads + advisory only"). If asked for "my team data", the honest answer is
that we hold only the FPL entry id in `profiles.fpl_team_id`; the squad itself
lives with FPL and must be requested from them.

## Access / portability (Art. 15, Art. 20)

Run in the Supabase SQL editor, substituting the user's uuid. One query,
returns the complete export as JSON:

```sql
select jsonb_pretty(jsonb_build_object(
  'account', (select jsonb_build_object(
      'id', id, 'email', email, 'created_at', created_at,
      'last_sign_in_at', last_sign_in_at,
      'providers', raw_app_meta_data->'providers')
    from auth.users where id = :uid),
  'profile',            (select to_jsonb(p)          from profiles           p where p.user_id = :uid),
  'notification_prefs', (select to_jsonb(n)          from notification_prefs n where n.user_id = :uid),
  'push_tokens',        (select jsonb_agg(to_jsonb(t)) from push_tokens      t where t.user_id = :uid),
  'deletion_request',   (select to_jsonb(d)          from account_deletions  d where d.user_id = :uid)
));
```

Find the uuid with `select id from auth.users where email = '...'`.

For a complete Art. 15 response, also export the two processors:

- **PostHog** — Persons → search the user id → Export person (JSON).
- **Sentry** — issue search `user.id:<uuid>`; note that events are 90-day
  retained and scrubbed to `{id}` only, so there is rarely anything meaningful.

Send as a JSON attachment. No self-serve export UI exists and none is required
for launch — #77 explicitly scopes this as manual-first.

## Erasure (Art. 17)

**Point them at the app first:** Settings → Profile → Danger zone → Delete
account. It is self-serve, gives a 30-day grace period, and `pg_cron` hard-
deletes on day 30 with cascades wiping every table above. That is the
preferred path — it needs no action from you.

Only act manually if they cannot access the account. Then:

```sql
delete from auth.users where id = :uid;  -- cascades to all four tables
```

Then delete from the processors, which do **not** cascade:

- **PostHog** — Persons → user id → Delete person.
- **Sentry** — Settings → Security & Privacy → Data Scrubbing, or the
  `/api/0/projects/{org}/{proj}/users/{id}/` DELETE endpoint.

Reply confirming deletion is complete and irreversible.

## Rectification (Art. 16)

Self-serve: name and DOB are editable in the app under Profile; email changes
go through Supabase Auth's own email-change flow. Only touch the DB if the
CHECK constraint on `dob` (13+) is blocking a legitimate correction.

## Objection to analytics (Art. 21)

Self-serve: Settings → "Share usage data" toggle. Crash reporting stays on as
an essential service — it is scrubbed to `{id}` only, carries no email or IP,
and this is disclosed in the privacy policy.

## Logging

Keep a row per request in a private sheet or note: date received, requester
email, request type, date fulfilled, what was sent or deleted. You need this
if a regulator ever asks whether you met the SLA. Do not store it in this repo.
