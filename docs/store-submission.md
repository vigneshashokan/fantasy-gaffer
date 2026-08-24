# App Store submission reference (#45)

Working notes for App Store Connect. The App Privacy section below is derived
from what the code actually does — re-derive it if the data layer changes.

**Last verified against the code on 2026-08-24** (build `39d04ae1`, buildNumber
4, commit `d165677`). That pass checked every column of every user table, the
analytics options and event catalog, the Sentry options, and grepped for
tracking APIs — the findings are inline below. Nothing between 2026-07-26 and
then added a data type; the only dependency change in that window was eslint,
a devDependency.

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

**Column-by-column audit (2026-08-24).** Every user-data table was enumerated
from the migrations; there are only four, plus Supabase's own `auth.users`:

- `profiles` — `first_name`, `last_name` (Name), `dob` (COPPA CHECK),
  `fpl_team_id`, timestamps. **No undisclosed column.**
- `push_tokens` — `token` (Device ID), `platform`, timestamps.
- `notification_prefs` — four booleans. Deliberately **not** a questionnaire
  row: these are app settings the user toggles, not data collected about them.
- `account_deletions` — `user_id` + `requested_at`.

Every other table (`players`, `clubs`, `fixtures`, `projections`,
`projections_shadow`, `player_gw_history`, `player_gw_snapshots`,
`player_season_history`, `ingestion_runs`, `health`) is ingested reference or
ops data with no user column at all.

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

Note that PostHog's autocapture is **off** (`autocapture={false}`,
`provider.tsx:40`) and there is no session replay in either tool.

**Correction (2026-08-24):** an earlier version of this doc said only the
declared events in `events.ts` are sent. That is not quite true —
`captureAppLifecycleEvents: true` in `src/lib/analytics/index.ts` also emits
`Application Opened` / `Backgrounded` / `Installed` / `Updated`, outside the
typed catalog (the code comments the exception). It changes **no** answer in the
table — those are Product Interaction like the rest — but do not repeat the
"only declared events" phrasing to a reviewer, because it is wrong.

The catalog itself is `sign_in`, `sign_up`, `squad_imported`, `screen_viewed`,
`decision_viewed`, `suggestion_expanded`, `pick_row_opened`,
`transfer_target_opened`, `notification_opened`, `push_permission_granted` /
`_denied`. The only id-shaped property is `player_id`, which is an **FPL element
id — a footballer, not a user**.

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
- **Off-season caveat — no longer applies (2026-08-24).** The 2026/27 season
  started 2026-08-21, so the app now shows live fixtures, points and
  projections. This was a real hazard while submitting between late May and
  mid-August, when the FPL API served no fixtures and several surfaces
  legitimately showed empty/hold states. Re-read this if a submission ever
  falls in that window again.
- **Explain the carried-over squad, or it reads as a bug.** FPL keeps a
  manager's squad private until each gameweek's deadline, so the upcoming
  gameweek's page shows the *live* gameweek's squad with the caption "Carried
  over from GW*n*…". That is correct and deliberate (there is no public
  endpoint for an unstarted gameweek), but a reviewer comparing the app to the
  FPL website mid-week could file it as stale data.

### Guideline 5.3 — Gaming, Gambling, and Lotteries

Not raised previously, and it is the category question most likely to snag a
fantasy-sports app. State plainly in the review notes: **the app offers no
real-money gaming, no contests, no wagering, no prizes, and no in-app
purchases.** It is an advisory tool over Fantasy Premier League, which is
itself a free-to-play game. Nothing in 5.3 applies, but say so rather than
letting a reviewer decide what it looks like.

### Guideline 5.2.1 — third-party IP

The app renders a kit and a three-letter code for each of the 20 Premier League
clubs, and names clubs and footballers. Worth pre-empting, and the specifics
are favourable: **the kits are original generic shirt silhouettes in club
colours carrying only a three-letter text abbreviation — no crest, no badge, no
sponsor, and no kit-manufacturer mark** (see `assets/jerseys/`). Player and club
names are factual references to a public dataset (the FPL API).

Say explicitly that the app is **not affiliated with, endorsed by, or licensed
by the Premier League or Fantasy Premier League**. The in-app copy and the
legal pages should be checked to match that claim before submitting.

### Age rating

- No objectionable content of any kind; the 13+ floor is **ours** (COPPA, via
  the `profiles.dob` CHECK), not Apple's.
- **No unrestricted web access — answer "no".** `expo-web-browser` appears in
  the codebase but is used *only* for the Google OAuth session
  (`openAuthSessionAsync` in `src/lib/auth/google.ts`). There is no WebView and
  no in-app browser; the two outbound links (`Linking.openURL` to FPL's site)
  open in Safari.

## Still outstanding for #45

Status as of 2026-08-24. Build `39d04ae1` (buildNumber 4) is on TestFlight, so
the "needs a running build" blocker is gone.

- [ ] **Screenshots** — 6.7" and 6.5" iPhone at minimum. **Now unblocked.** Take
      them from the TestFlight build, and note #91's open pitch/player visual
      issues (lines, pills, jersey fit on narrow phones) are exactly what shows
      up in a pitch screenshot — worth fixing those first rather than
      screenshotting around them.
- [ ] **Reviewer test account** with a completed profile and an FPL team already
      connected. Operator decision, nobody else can make it, and a reviewer
      landing on the empty-squad state is a plausible rejection.
- [ ] Short description, full description, keywords, promotional text.
- [ ] **Support URL** and marketing URL. `fantasy-gaffer.com` serves only `/`,
      `/privacy/` and `/terms/` — the support URL has nowhere to point yet, and
      it is a required field. Cross-repo: pages are served from
      `vigneshashokan/fantasy-gaffer-site`, pull-based, so publishing one is
      four steps (see the legal-copy note in `CLAUDE.md`).
- [ ] **App Privacy questionnaire** — answers are the table above. Drafted, never
      entered. Apple blocks submission until it is filled in.
- [ ] **Age rating questionnaire** — see the Age rating section above.
- [x] Privacy policy URL — `https://fantasy-gaffer.com/privacy`, live, and
      mirrored into `app.config.ts` `extra.privacyPolicyUrl`.

**Not an App Store Connect field, but do not ship past it: #206, the three
DPAs** (Supabase, PostHog, Sentry). The live privacy policy already states that
international transfers happen "under data processing agreements with each
provider" — that sentence is untrue until they are signed, and GDPR Art. 28
requires them regardless of Apple. Supabase's is a request-then-PandaDoc round
trip, so it is the long pole; start it before the listing content.
