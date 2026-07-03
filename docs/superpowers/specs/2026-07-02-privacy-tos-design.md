# Privacy Policy & Terms of Service — Design

**Issue:** [#46 — [Phase 5] Privacy policy + Terms of Service](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/46)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-07-02

## Goal

Both app stores require a public Privacy Policy URL, and most jurisdictions require Terms of Service. Ship both as: (1) drafted, source-controlled legal text tailored to our real stack; (2) native in-app screens reachable from Settings and signup; (3) matching static HTML the operator deploys to get the store-required public URLs.

## Scope decisions (from brainstorming)

- **We draft the content.** Complete Privacy Policy + ToS text authored from the issue's mandated checklist and our actual data practices (Supabase auth, FPL data, push token, PostHog, Sentry, RevenueCat, account deletion). Clearly marked "review by counsel recommended" — a lawyer is recommended, not strictly required per the issue.
- **Single source of truth = typed TS content modules.** No markdown parser, no in-tree markdown renderer. Legal docs are naturally sectioned (headings → paragraphs/bullets), which a small typed model captures cleanly and testably. This matches the repo's custom-token / avoid-heavy-native-deps ethos.
- **In-app native screens + hosted mirror.** The store requires a public URL regardless, so hosting is mandatory. The app renders the docs natively (offline, themed, better UX); the *same* content is emitted as static HTML for hosting. A drift-guard test keeps the two in sync.
- **In-app links navigate to native screens**, not the WebBrowser. The existing `openTerms()` → `WebBrowser.openBrowserAsync(TERMS_URL)` path is replaced by `router.push('/legal/terms')`. The URL constants remain for store/config use.
- **Legal routes live at the app root** (`src/app/legal/*`), reachable from both the `(onboarding)` and `(home)` groups (signup + Settings both link to them).
- **Signup gets a disclosure line**; signin does not (v1). Account creation is the moment consent is expected.
- **Values the operator must supply** are left as clearly-marked placeholders in the draft (see "Values the operator supplies").

## Non-goals

- **No deploy / DNS.** This task produces ready-to-deploy HTML in `legal-site/`; deploying to Cloudflare Pages / Vercel and pointing DNS is an operator step.
- **No store-listing entry.** Entering the privacy URL into App Store Connect / Play Console is **#45** (paid-account gated). We add the URLs to `app.config.ts` `extra` so #45 can consume them.
- **No lawyer engagement** — recommended, tracked as a follow-up.
- **No tappable inline links in-app** (URLs/emails render as plain text in v1). Hosted HTML may linkify later.
- **No localization.** English only; localized legal copy ties to #50 i18n.
- **No signin disclosure**, no changes to the analytics-consent `PrivacyCard` (that is separate, already shipped).

## Architecture

```
CONTENT (single source of truth)          IN-APP                         HOSTED
─────────────────────────────────         ──────                         ──────
src/content/legal/
  types.ts       (LegalDoc model)   ┌──►  src/app/legal/privacy.tsx  ┐
  privacyPolicy.ts ─────────────────┤     src/app/legal/terms.tsx    ├─► LegalDocView
  termsOfService.ts ────────────────┤       (thin screens)           ┘   (themed native)
  renderHtml.ts  (pure fn) ─────────┴──►  scripts/build-legal-html.ts ──► legal-site/privacy.html
  index.ts                                   (npm run legal:html)          legal-site/terms.html
                                                                            (operator deploys)
WIRING
──────
src/constants/links.ts       (PRIVACY_URL + TERMS_URL constants)
app.config.ts                (extra.privacyPolicyUrl / extra.termsUrl)
src/app/(home)/settings.tsx  (Terms row → router.push; new Privacy row)
src/app/(onboarding)/signup.tsx (disclosure line → legal routes)
```

### Content model (`src/content/legal/types.ts`)

```ts
export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

export type Section = { heading: string; blocks: Block[] };

export type LegalDoc = {
  title: string;
  lastUpdated: string; // ISO date, e.g. '2026-07-02'
  intro?: string;
  sections: Section[];
};
```

### Content requirements

**Privacy Policy (`privacyPolicy.ts`)** — sections covering, at minimum:
- **What data we collect** — account/auth data (email, Supabase auth tokens), FPL data you connect (entry id, team, picks — read from the public FPL API), push notification token (when enabled), anonymous analytics events.
- **Third parties** — Supabase (backend/auth), PostHog (analytics), Sentry (crash reporting), RevenueCat (subscriptions, when live), Apple & Google (auth + app distribution). Named with their role; each processes limited data.
- **How we use data** — provide the service, improve the app, crash diagnostics, deliver notifications.
- **Data retention & deletion** — references the in-app account-deletion flow (Settings → account deletion) and its grace period; deleting the account removes profile data.
- **Your rights** — access/export, deletion, correction (GDPR-aligned language for EU users).
- **Analytics choice** — the Settings "Share usage data" toggle opts out of analytics; crash reporting is essential service.
- **Children** — not directed at under-13s (COPPA-exempt posture).
- **Contact** — privacy contact email.
- **Changes to this policy** — how updates are communicated (effective date).

**Terms of Service (`termsOfService.ts`)** — sections covering:
- **Acceptance / account terms** — accurate info, you're responsible for your account.
- **Acceptable use** — no abuse, scraping, reverse engineering, unlawful use.
- **Subscriptions & cancellation** — paid tiers billed via the app stores; cancel through the store; store refund policies apply.
- **Disclaimers** — service "as is"; advisory outputs (xPts, captain/transfer/chip suggestions) are informational, not guarantees.
- **Limitation of liability.**
- **Governing law.**
- **Not affiliated** — Fantasy Gaffer is not affiliated with, endorsed by, or associated with the Premier League or the official Fantasy Premier League; "FPL" refers to the public data source.
- **Changes to terms** — effective date.

### In-app rendering (`src/components/legal/LegalDocView.tsx`)

`LegalDocView({ doc, tk })` renders inside the screen: doc `title`, a "Last updated {lastUpdated}" line, optional `intro`, then each section (heading + its blocks: paragraphs as `<Text>`, bullets as a simple bulleted list) in a `ScrollView`. Uses existing theme tokens (`ApexTokens`) + fonts. Imports only React Native + tokens — **no `@/lib/supabase`, no `@/api/*` chain**, so it renders in tests without an AsyncStorage mock.

### Legal screens (`src/app/legal/privacy.tsx`, `src/app/legal/terms.tsx`)

Thin screens: a `ScreenHeader` (title + back) over `LegalDocView` with the corresponding doc. Placed at app root so both onboarding and post-auth link to them. No folder `_layout` — they inherit the root `<Stack>`.

### HTML emission (`renderHtml.ts` + `scripts/build-legal-html.ts`)

- `renderLegalHtml(doc: LegalDoc): string` — pure function producing a self-contained, minimally-styled HTML document. **All text is HTML-escaped** (`& < > " '`) to prevent broken markup from legal prose. Deterministic output (stable whitespace) so the drift-guard can string-compare.
- `scripts/build-legal-html.ts` — imports both docs, writes `legal-site/privacy.html` + `legal-site/terms.html`. Run via `npm run legal:html` (`tsx scripts/build-legal-html.ts`; `tsx` added as a devDependency).
- The generated HTML files are committed (the operator can point static hosting at `legal-site/` directly).

### Wiring

- **`src/constants/links.ts`** — add `PRIVACY_URL = 'https://fantasy-gaffer.com/privacy'`, keep `TERMS_URL = 'https://fantasy-gaffer.com/terms'`; update the comment (no longer "nothing references these" — store config will).
- **`app.config.ts`** — add `extra.privacyPolicyUrl` + `extra.termsUrl` (from the same literal values) so store-submission tooling / #45 can read them. Note: there is no native Expo config key for a privacy URL — it is App Store Connect / Play Console listing metadata — so `extra` is the reference point, consumed by #45.
- **`src/app/(home)/settings.tsx`** — the *Terms & Conditions* row `onPress` changes from `openTerms()` to `router.push('/legal/terms')` (drop the `external` prop / external-link icon); add a new **Privacy Policy** `SettingsRow` above or below it → `router.push('/legal/privacy')`.
- **`src/app/(onboarding)/signup.tsx`** — add a disclosure line beneath the submit button: "By creating an account, you agree to our **Terms of Service** and **Privacy Policy**." The two doc names are `Pressable`/`Text` links → `router.push('/legal/terms')` / `router.push('/legal/privacy')`.
- **`src/lib/external.ts`** — `openTerms()` is no longer used by Settings. Remove it (and its `TERMS_URL` import there) if nothing else references it, or leave it if still consumed; the plan verifies references before deleting. `shareApp`/`sendFeedback` are untouched.

## Data flow

Static content only. `LegalDoc` structures are compile-time constants imported directly by the screens and the HTML script. No network, no store, no async. Navigation is `expo-router` `router.push` to the two static routes.

## Error handling

Minimal by construction — content is a static import, so a "missing doc" state cannot occur (TS guarantees presence). No loading/error UI. The only runtime surface is navigation; typed routes make the paths compile-checked once Metro regenerates `router.d.ts`.

## Testing

Unit / component (all under `src/__tests__/` mirroring the tree):
- **`renderLegalHtml`** — asserts the HTML contains the title, each section heading, paragraph and bullet text, and that special characters (`&`, `<`) are escaped (e.g. a fixture doc with `A & B <x>` yields `A &amp; B &lt;x&gt;`).
- **`LegalDocView`** — renders a small fixture `LegalDoc`; asserts title, "Last updated", a section heading, a paragraph, and a bullet item appear.
- **Content completeness** — `privacyPolicy` and `termsOfService` each contain the issue-mandated topics. Implemented as case-insensitive keyword assertions over the concatenated text (e.g. privacy: "collect", "third part", "delet", "rights", "contact"; terms: "acceptable use", "liability", "governing law", "not affiliated", "premier league"). Guards against a section being dropped in future edits.
- **Legal screens** — `legal/privacy.tsx` + `legal/terms.tsx` render (mock `expo-router`); assert the doc title shows.
- **Drift-guard parity** — reads the committed `legal-site/privacy.html` / `legal-site/terms.html` and asserts each `=== renderLegalHtml(doc)`. Fails with a message pointing at `npm run legal:html` so content edits can't silently desync the hosted copy.
- **Updated existing tests** — `settings` test (new Privacy row + Terms now navigates) and `signup` test (disclosure line + links), adjusted to match.

`tsc` note: `typedRoutes` will flag `/legal/privacy` and `/legal/terms` (and the `router.push` calls) until the dev server regenerates `.expo/types/router.d.ts`. Tests mock `expo-router`, so they're unaffected; this is the known typedRoutes-staleness gotcha, not a real error.

Manual / external ACs (operator): deploy `legal-site/*` → public URLs; enter the privacy URL into store listings (#45).

## Values the operator supplies

The draft uses clearly-marked placeholders for facts only the operator knows. Each appears as an obvious token (e.g. `[OPERATOR LEGAL NAME]`) so a search finds them:
- **Legal entity / operator name** (who "we" is).
- **Governing-law jurisdiction** (e.g. England & Wales) — I cannot invent this.
- **Privacy contact email** — default `privacy@fantasy-gaffer.com`; confirm it routes or swap to `admin@fantasy-gaffer.com`.
- **Effective / last-updated date** — default 2026-07-02.
- **Final hosted URLs** — default `https://fantasy-gaffer.com/{privacy,terms}`; adjust to the real deploy paths.

## Follow-ups (not now)

Tappable inline links in-app · signin disclosure · localized legal copy (#50) · lawyer review · replacing placeholders with counsel-approved final values.

## Acceptance criteria mapping (issue #46)

- **Both pages publicly accessible at stable URLs** → this task produces the deployable HTML (`legal-site/`); the operator deploys them (non-goal to deploy).
- **Linked from Settings → Terms (already wired)** → Terms row re-pointed to the in-app screen; a Privacy row added.
- **Privacy URL added to app.json + both store listings** → added to `app.config.ts` `extra`; the store-listing entry is #45.
