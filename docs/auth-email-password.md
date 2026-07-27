# Email/Password Auth

Implements [#15](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/15), [#16](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/16), [#17](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/17). Spec: `docs/superpowers/specs/2026-06-08-auth-email-password-design.md`.

## How it works at runtime

### Sign in

```
User enters email + password on /(onboarding)/signin → taps "Sign in"
  ↓
signInWithEmail() in src/lib/auth/email.ts
  ↓
supabase.auth.signInWithPassword({ email, password })
  ↓ on success: session lands → onAuthStateChange → useAuthStore updates
  ↓ (onboarding)/_layout routes to /(home) or /(onboarding)/complete-profile
  ↓ on email_not_confirmed: route to /(onboarding)/verify-pending?email=…
```

### Sign up

```
User fills sign-up form on /(onboarding)/signup → taps "Create account"
  ↓
signUpWithEmail() in src/lib/auth/email.ts
  ↓
supabase.auth.signUp({ email, password, options: {
  data: { given_name, family_name },
  emailRedirectTo: VERIFY_URL,   // https://fantasy-gaffer.com/verify
} })
  ↓
router.replace('/(onboarding)/verify-pending?email=…')
  ↓ user opens email, taps link
  ↓ link → https://fantasy-gaffer.com/verify?token_hash=…&type=email
    (points straight at our domain — NOT via /auth/v1/verify, see Universal Links)
  ↓
useEmailAuthDeepLinks (in src/app/_layout.tsx) catches the URL
  ↓
supabase.auth.verifyOtp({ token_hash, type })  ← the token, not the URL
  ↓ resolved { error } is checked — auth-js does NOT reject on a dead link
  ↓ session lands
  ↓ (onboarding)/_layout routes to /(onboarding)/complete-profile
  ↓ complete-profile reads user_metadata.given_name / family_name and prefills
  ↓ user picks DOB → /(home)
```

### Forgot / reset password

```
User taps "Forgot password?" → /(onboarding)/forgot-password
  ↓ enters email → sendPasswordReset()
  ↓
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: RESET_PASSWORD_URL,   // https://fantasy-gaffer.com/reset-password
})
  ↓ always shows success state (no enumeration)
  ↓ user opens email, taps link
  ↓ link → https://fantasy-gaffer.com/reset-password?token_hash=…&type=recovery
  ↓
useEmailAuthDeepLinks catches the URL → verifyOtp({ token_hash, type }) → router.replace('/(onboarding)/reset-password')
  ↓ on a resolved { error } (expired / already-used link) it instead
    replaces to /(onboarding)/forgot-password?expired=1
  ↓ user enters new password → resetPassword()
  ↓
supabase.auth.updateUser({ password })
supabase.auth.signOut({ scope: 'others' })   ← invalidates other devices
  ↓ (onboarding)/_layout routes home
```

## Manual setup (one-time per Supabase project)

Same pattern as Google sign-in's manual setup. Required before the flow works end-to-end.

1. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:**
   add `https://fantasy-gaffer.com/verify` and `https://fantasy-gaffer.com/reset-password`.
   Keep the old `fplgafferreactnativeapp://verify` / `://reset-password` entries too —
   the custom scheme is still what the web fallback pages' "Open in the app" button
   uses, and what any email sent before #71 shipped still carries
   (alongside the wildcard added during sub-project C).
2. **Authentication → Providers → Email:** confirm "Confirm email" is **on**.
3. **Authentication → Rate Limits:** defaults are acceptable for Phase 1 (5 sign-in attempts /
   15 min per IP, conservative email send caps). Adjust before public launch.
4. **Authentication → Email Templates:** customise "Confirm signup" and "Reset password" to use
   the app's name and brand. Defaults work for dev.

## Files

- `src/lib/auth/email.ts` — wrappers for signInWithEmail, signUpWithEmail, sendPasswordReset,
  resetPassword, resendVerification. Normalises Supabase errors into `AuthErrorKind`.
- `src/lib/auth/deepLink.ts` — `parseAuthDeepLink` + `useEmailAuthDeepLinks` hook (called from
  `src/app/_layout.tsx`).
- `src/lib/auth/validation.ts` — zod schemas for email / password / signup / reset.
- `src/app/(onboarding)/signup.tsx` — sign-up screen.
- `src/app/(onboarding)/verify-pending.tsx` — post-signup "Check your inbox" screen + Resend
  (30 s throttle).
- `src/app/(onboarding)/forgot-password.tsx` — request reset; always shows success state.
- `src/app/(onboarding)/reset-password.tsx` — new-password form reached via deep link.

## Troubleshooting

**Sign-up succeeds but the verify email never arrives**
- Check Supabase Dashboard → Auth → Logs → Emails for sent attempts.
- Check the Supabase project's email rate-limit isn't tripped.

**Verify link opens but stays on signin (or shows "Verification link expired")**
- Confirm `https://fantasy-gaffer.com/verify` is in the Redirect URLs allow list. An
  unlisted `redirect_to` is not an error — GoTrue silently rewrites it to the project's
  Site URL, so the link will look fine and land somewhere useless.
- The link is one-time-use — opening it twice fails the second time.

**Every link reports "expired" even when freshly sent — CONFIRMED, then FIXED (2026-07-27)**
- The risk flagged here was real and the #71 on-device pass hit it exactly.
  `exchangeCodeForSession` is a **PKCE** grant needing the
  `<storageKey>-code-verifier` auth-js stashes when the flow begins.
  `src/lib/supabase.ts` never set `flowType`, and auth-js@2.107 defaults to
  **`implicit`** — under which no verifier is ever written, so the exchange
  could never succeed. Worse, under implicit GoTrue returns tokens in the URL
  **fragment**, so there was no `?code=` to read either: the handler saw a
  null code, took its expired branch, and bounced the user to
  `forgot-password?expired=1` — which reads as an infinite loop on a link
  that was perfectly valid.
- **The fix was NOT `flowType: 'pkce'`.** That would have fixed this symptom
  while leaving Universal Links dead, because PKCE *requires* the
  `/auth/v1/verify` round-trip through `*.supabase.co` and iOS matches
  associated domains against the **tapped** URL — so the link always opened
  Safari first. The two constraints are mutually exclusive. We moved to
  **`token_hash` + `verifyOtp`** instead, which lets the email point straight
  at our own domain and needs no stored verifier. See Universal Links below.
- **Trade-off accepted:** PKCE would have bound the reset to the device that
  requested it. A `token_hash` link works from any device, so possession of
  the mailbox is the only factor — the same model as most email reset flows,
  and the reason reset links are short-lived and single-use.

**Reset link doesn't open the app**
- Confirm `https://fantasy-gaffer.com/reset-password` is in the Redirect URLs allow list.
- Confirm `app.config.ts` still has `scheme: 'fplgafferreactnativeapp'` (unchanged since #10).

**"Invalid login credentials" on a freshly verified account**
- The session from the verify link IS the sign-in. The user shouldn't need to re-enter the
  password — routing should land them in the app. If they do see signin, the verify deep link
  didn't reach `useEmailAuthDeepLinks` (root layout). Confirm the hook is wired.

## Future work

- **Resend rate-limit display:** show the actual server-side cooldown rather than a fixed
  client-side 30 s. Supabase returns the retry-after header but our wrapper doesn't surface it
  yet.
- **Email-change flow:** the current spec only covers sign-up and reset. Changing the address
  on an existing account is a Phase 2 ticket.
- **Server-side audit log:** track failed-login bursts for the security event view (Phase 5).

## Universal Links (#71)

Since #71 the auth emails point at `https://fantasy-gaffer.com/…` rather than
the `fplgafferreactnativeapp://` scheme. iOS opens the app directly; a device
without the app (or a desktop browser) gets a real web page instead of a dead
tab, which is the gap the custom scheme could never close.

- **The email must link DIRECTLY at our domain — a redirect does not work, and
  this is the single easiest way to break the feature.** iOS matches Universal
  Links against the **tapped** URL only; they do not survive a server-side
  redirect. GoTrue's stock `{{ .ConfirmationURL }}` expands to
  `<project>.supabase.co/auth/v1/verify?…&redirect_to=…`, whose host is
  **not** in our associated domains — so the OS hands it to Safari, Safari
  follows the 302, and the user lands on our page *in the browser* having
  never had a chance to open the app. That is exactly what the #71 on-device
  pass found (2026-07-27). **The templates are therefore hand-written against
  `{{ .TokenHash }}` and must stay that way:**

  ```
  Confirm signup:  https://fantasy-gaffer.com/verify?token_hash={{ .TokenHash }}&type=email
  Reset password:  https://fantasy-gaffer.com/reset-password?token_hash={{ .TokenHash }}&type=recovery
  ```

  These live in **Supabase Dashboard → Authentication → Email Templates** and
  are **not** in version control — a project restore or a second environment
  needs them re-entered by hand, and reverting either one to
  `{{ .ConfirmationURL }}` silently reintroduces the Safari bounce.
  `emailRedirectTo` / `redirectTo` in `lib/auth/email.ts` still matter (GoTrue
  validates them against the allowlist), but they no longer determine the
  link's host.

- **Association file:** `/.well-known/apple-app-site-association`, served from
  the `vigneshashokan/fantasy-gaffer-site` repo, claiming
  `Q6G9ABTUH5.com.fantasygaffer.app` for `/verify` and `/reset-password`.
- **Verify it end to end** by asking Apple, not the origin — Apple's CDN is what
  the device actually reads, and it caches for an hour:

  ```
  curl -s -D- https://app-site-association.cdn-apple.com/a/v1/fantasy-gaffer.com | head -20
  ```

  A healthy response carries `Apple-From:` pointing at our URL and
  `Apple-Origin-Format: json`.

- **GitHub Pages serves the file as `application/octet-stream`** and offers no
  way to set headers. Apple's docs ask for `application/json`, but its fetcher
  parses ours anyway — confirmed by the CDN response above. If Universal Links
  ever stop resolving, re-check that first: it is the one part of this setup
  that is tolerated rather than correct.

- **Ordering rule.** iOS fetches the association at install time. Publishing the
  file must precede shipping `associatedDomains`, or every link silently
  degrades to Safari for anyone who installed in between.

- **`parseAuthDeepLink` accepts both shapes** and checks the *host*, not just
  the path — otherwise any https link the OS handed the app would be read as an
  auth callback. The custom scheme is still live for Google OAuth and the
  fallback pages' "Open in the app" button (the only route in on Android).

- **The fallback pages forward `window.location.search`**, which is why the
  token has to ride in the **query string** and not a fragment — a fragment is
  never sent anywhere the page can forward it. Under the old implicit flow
  `search` was empty and that button produced a token-less deep link, which the
  app correctly read as expired. Both pages also had copy that the flow change
  falsified: `/verify` announced "Email confirmed" (true only while GoTrue
  confirmed server-side before redirecting — with `token_hash` nothing is
  consumed until the app calls `verifyOtp`), and `/reset-password` claimed the
  reset was bound to the requesting device. Both rewritten.

- **Android has no App Links.** `assetlinks.json` needs the Play app-signing
  certificate and Play is parked, so on Android an auth email opens the web page
  and the "Open in the app" button (custom scheme) is the only route in. Add
  `assetlinks.json` + `intentFilters` when Play enrollment happens.
