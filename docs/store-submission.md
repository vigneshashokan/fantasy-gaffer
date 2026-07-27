# App Store submission reference (#45)

Working notes for App Store Connect. The App Privacy section below is derived
from what the code actually does — re-derive it if the data layer changes.

## App Privacy questionnaire

Apple asks, per data type: **is it collected**, **what for**, **is it linked to
the user's identity**, and **is it used for tracking**.

"Linked" is the key one here. `handleAuthChange` in `src/store/authStore.ts`
calls `identify(userId)` and `setSentryUser(userId)` on any event carrying a
session — so analytics and crash reports are keyed to the Supabase user id.
Everything below is therefore **Linked to You**.

| Apple data type | Collected | Purpose | Where it lives |
|---|---|---|---|
| Contact Info → **Email Address** | Yes | App Functionality | `auth.users` (Supabase) |
| Contact Info → **Name** | Yes | App Functionality | `profiles.first_name` / `last_name` |
| Identifiers → **User ID** | Yes | App Functionality, Analytics | Supabase UUID; PostHog `distinct_id`; Sentry `user.id` |
| Identifiers → **Device ID** | Yes | App Functionality | `push_tokens.token` (APNs token, per device) |
| Usage Data → **Product Interaction** | Yes | Analytics | PostHog — the typed catalog in `src/lib/analytics/events.ts` |
| Diagnostics → **Crash Data** | Yes | App Functionality | Sentry |
| Diagnostics → **Performance Data** | Yes | App Functionality | Sentry, `tracesSampleRate 0.15` |
| Other Data → **Date of birth** | Yes | App Functionality | `profiles.dob` — COPPA 13+ gate, enforced by a CHECK constraint |
| Other Data → **FPL team id** | Yes | App Functionality | `profiles.fpl_team_id` |

**Used for Tracking: No — for every row.** Apple's definition of tracking is
linking user data with third-party data for targeted advertising, or sharing it
with a data broker. PostHog and Sentry are first-party analytics and crash
tooling; there is no ad SDK, no IDFA access, and no `AppTrackingTransparency`
usage anywhere in the app. So **no ATT prompt is required** — and adding one
without a tracking purpose is itself a review flag.

Not collected, worth stating plainly because reviewers check: no Location, no
Contacts, no Photos, no Health, no Financial Info, no Search History, no
Browsing History, no Audio, no Sensitive Info (Apple's special category —
race, sexual orientation, and so on).

Note that PostHog's autocapture is **off** (`autocapture={false}` in
`provider.tsx`) — only the explicitly declared events in `events.ts` are sent.
There is no session replay in either tool.

### GeoIP — already settled, no Location row

PostHog can derive coarse geography from the request IP server-side (`$geoip_*`
properties), which would force a **Location → Coarse Location** disclosure. It
is **off**, and it is off in code rather than in the dashboard:
`src/lib/analytics/index.ts` passes `disableGeoip: true` to the client
constructor, so the SDK tells ingest to skip the lookup on every request.

Do not go looking for a project setting to toggle — there isn't one to find,
and the code is the authority. If anyone ever removes that line, the Coarse
Location row has to be added here *and* a matching line added to
`src/content/legal/privacyPolicy.ts` (then re-run `npm run legal:html`, or the
parity test fails).

So the table above is complete as written: every row in this questionnaire is
determined by our own code.

## Review notes (the "App Review Information" box)

Reviewers need a working account and a way to see the actual product, which is
squad-dependent.

- Supply a **test account** (email + password) whose profile is already complete
  and which has an FPL team connected — a reviewer landing on the empty-squad
  state may report the app as non-functional.
- Note that the app **reads** Fantasy Premier League data and gives advice; it
  does not modify the user's FPL team. There is no write-back (that's Phase 6),
  so nothing the reviewer does can affect a real FPL account.
- Note that **Sign in with Apple**, Google, and email are all available.
- Off-season caveat: between late May and mid-August the FPL API serves no
  fixtures, so several surfaces legitimately show empty/hold states. If
  submitting in that window, say so explicitly or the reviewer will file it as
  a bug.

## Still outstanding for #45

- Screenshots — 6.7" and 6.5" iPhone at minimum. Needs a running build.
- Short description, full description, keywords, promotional text.
- Support URL and marketing URL (the `fantasy-gaffer.com` site currently serves
  only `/`, `/privacy/`, `/terms/`).
- Privacy policy URL: `https://fantasy-gaffer.com/privacy` — already live, and
  already mirrored into `app.config.ts` `extra.privacyPolicyUrl`.
- Age rating questionnaire. The app has no objectionable content; the 13+ floor
  is ours (COPPA), not Apple's.
