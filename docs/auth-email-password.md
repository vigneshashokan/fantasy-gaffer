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
  emailRedirectTo: 'fplgafferreactnativeapp://verify',
} })
  ↓
router.replace('/(onboarding)/verify-pending?email=…')
  ↓ user opens email, taps link
  ↓ link → Supabase verify endpoint → redirect to fplgafferreactnativeapp://verify?code=…
  ↓
useEmailAuthDeepLinks (in src/app/_layout.tsx) catches the URL
  ↓
supabase.auth.exchangeCodeForSession(url) → session lands
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
  redirectTo: 'fplgafferreactnativeapp://reset-password',
})
  ↓ always shows success state (no enumeration)
  ↓ user opens email, taps link
  ↓ link → fplgafferreactnativeapp://reset-password?code=…
  ↓
useEmailAuthDeepLinks catches the URL → exchangeCodeForSession → router.replace('/(onboarding)/reset-password')
  ↓ user enters new password → resetPassword()
  ↓
supabase.auth.updateUser({ password })
supabase.auth.signOut({ scope: 'others' })   ← invalidates other devices
  ↓ (onboarding)/_layout routes home
```

## Manual setup (one-time per Supabase project)

Same pattern as Google sign-in's manual setup. Required before the flow works end-to-end.

1. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:**
   add `fplgafferreactnativeapp://verify` and `fplgafferreactnativeapp://reset-password`
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
- Confirm `fplgafferreactnativeapp://verify` is in the Redirect URLs allow list.
- The link is one-time-use — opening it twice fails the second time.

**Reset link doesn't open the app**
- Confirm `fplgafferreactnativeapp://reset-password` is in the Redirect URLs allow list.
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
