# Google Sign-In

Implements [issue #13](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/13). Spec: `docs/superpowers/specs/2026-06-07-auth-google-oauth-design.md`.

## How it works at runtime

```
User taps "Continue with Google" on /(onboarding)/signin
  ↓
signInWithGoogle() in src/lib/auth/google.ts
  ↓
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })
  ↓ returns { url } — the Google OAuth URL
WebBrowser.openAuthSessionAsync(url, redirectTo)
  ↓ Google sheet opens; user signs in
  ↓ Google redirects to fplgafferreactnativeapp://?code=...
supabase.auth.exchangeCodeForSession(result.url)
  ↓ Supabase session lands in client + AsyncStorage (adapter from #10)
supabase.auth.onAuthStateChange fires
  ↓ useAuthStore session updates
useProfileGate hook queries profiles table
  ↓
First-time user → status === 'missing' → (onboarding) layout redirects to /(onboarding)/complete-profile
Returning user → status === 'complete' → routing falls through to /(home)/(tabs)/team
```

The whole flow takes ~3 seconds end-to-end (network-dependent).

## First-time user-facing flow

1. Open the app for the first time on a device → `(onboarding)/signin` screen.
2. Tap "Continue with Google" → in-app browser opens Google's sign-in page.
3. Pick or enter a Google account, approve the OAuth consent (name + email).
4. Browser closes; you land back in the app on `(onboarding)/complete-profile`.
5. First name and last name are pre-filled from your Google profile. Pick your date of birth (must be 13+).
6. Tap "Continue" → home tab.

On every subsequent app launch you skip steps 1–5 entirely — the persisted Supabase session restores automatically.

## Manual setup (one-time per Supabase project)

These steps are out-of-band and require a logged-in human. Same pattern as #10's Supabase manual provisioning.

1. **Google Cloud Console** — open https://console.cloud.google.com and create or pick a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
3. **Application type: Web application.** Name it "Fantasy Gaffer Supabase" (or similar).
4. **Authorised redirect URIs:** add `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`. The project ref comes from your Supabase project's Settings → General.
5. Save → copy the **Client ID** and **Client Secret**.
6. **(First time only)** Configure the OAuth consent screen:
   - User type: External
   - App name + support email
   - Scopes: `openid`, `email`, `profile`
   - Publishing status: **Testing** (caps you at 100 test users — fine for dev/beta; publish before public launch)
   - Test users: add the Google accounts you'll use to test
7. **Supabase Dashboard → Authentication → Providers → Google.** Toggle on, paste the Client ID + Client Secret from step 5, save.
8. **Supabase Dashboard → Authentication → URL Configuration.** Under "Redirect URLs", add `fplgafferreactnativeapp://*`.

## Files

- `src/lib/auth/google.ts` — the `signInWithGoogle()` helper
- `src/lib/useProfileGate.ts` — checks for an existing `profiles` row
- `src/store/authStore.ts` — Supabase-backed auth store (replaces the old mock)
- `src/app/(onboarding)/complete-profile.tsx` — first-time profile form
- `src/app/(onboarding)/_layout.tsx` — inverse-protection routing (signed-in users skip onboarding)
- `src/app/(home)/_layout.tsx` — protection routing (unsigned users → onboarding; signed-in-but-incomplete → complete-profile)
- `src/app/_layout.tsx` — gates render on auth hydration alongside fonts + theme

## Troubleshooting

**Google sheet opens but redirect doesn't return to the app**
- Check `fplgafferreactnativeapp://*` is in Supabase's URL Configuration allow list.
- Check `app.config.ts` still has `scheme: 'fplgafferreactnativeapp'` (it should — set in #10).

**`redirect_uri_mismatch` error from Google**
- The redirect URI in Google Cloud doesn't exactly match Supabase's callback URL.
- Confirm step 4 above used `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback` with no trailing slash, no path typos.

**Sign-in succeeds but app stays on signin screen**
- `onAuthStateChange` likely failed to fire. Check the Supabase session was actually persisted (`AsyncStorage.getItem('sb-<ref>-auth-token')`).
- Make sure the AsyncStorage adapter was wired in `src/lib/supabase.ts` (from #10).

**"You must be 13 or older" appears for a valid DOB**
- The CHECK constraint on `profiles.dob` uses the server's clock and timezone. If you're testing exactly on someone's 13th birthday, the day may differ. Pick a clearly-older DOB to verify the flow works.

## Future work

- **Native Google Sign-In SDK** — when the dev-build pipeline lands (Phase 5), swap `expo-auth-session` + the in-app browser flow for `@react-native-google-signin/google-signin` + `supabase.auth.signInWithIdToken`. No in-app browser switch, slightly nicer UX.
- **Editing profile fields after completion** — currently the Profile screen shows name + DOB as read-only. Edit support is its own ticket (the DOB CHECK constraint has subtleties when `dob` is updated — see #11's spec review).
- **Publish OAuth consent screen** — required before opening to all users (currently capped at 100 test users).
