# Apple Sign-In

Implements [issue #14](https://github.com/vigneshashokan/fantasy-gaffer/issues/14).

**iOS only.** `expo-apple-authentication` has no Android or web implementation, so
the button is not rendered off iOS — there is nothing to fall back to.

## Why it is not optional

App Store Review Guideline **4.8** requires Sign in with Apple in any app that
offers a third-party login. Fantasy Gaffer offers Google, so shipping without
this is a rejection. Guideline **5.1.1(v)** additionally requires in-app account
deletion for apps with accounts — already shipped, see `docs/auth-account-deletion.md`.

## How it works at runtime

Unlike Google this **never opens a browser**. iOS presents the system sheet and
returns a signed identity token, which Supabase verifies directly.

```
User taps "Continue with Apple" on /(onboarding)/signin   (iOS only)
  ↓
signInWithApple() in src/lib/auth/apple.ts
  ↓
AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })
  ↓ system sheet; Face ID / password; returns an AppleAuthenticationCredential
supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })
  ↓ Supabase verifies the JWT against Apple's keys and mints a session
  ↓ (first sign-in only) supabase.auth.updateUser({ data: { given_name, family_name } })
supabase.auth.onAuthStateChange fires
  ↓ useAuthStore session updates
useProfileGate queries profiles
  ↓
First-time user → 'missing' → /(onboarding)/complete-profile (name pre-filled)
Returning user  → 'complete' → /(home)/(tabs)/team
```

The issue listed "backend endpoint to exchange Apple identity token for our
session token" as a dependency. **There is no such endpoint and none is needed** —
`signInWithIdToken` is the exchange, performed by Supabase's auth server. No
redirect URI, no `exchangeCodeForSession`, and the app's deep-link scheme is not
involved at all.

## The two Apple-specific behaviours

### The name arrives exactly once

Apple returns `fullName` **only on the first authorization for this app**, and
never again — not after signing out, not after reinstalling. It is also **not in
the identity token**, so Supabase cannot pick it up on its own.

`signInWithApple()` therefore writes it straight into `user_metadata` under
`given_name` / `family_name` — the same keys `complete-profile.tsx` already reads
for Google's `profile` scope payload. One code path serves both providers and
nothing new has to be stored.

The write is **non-fatal**: if `updateUser` fails the user is still signed in and
types their name on the next screen. Dropping a session over a prefill would be
the worse trade.

> To re-test the first-sign-in path, revoke the app under **Settings → [your
> name] → Sign in with Apple → Fantasy Gaffer → Stop Using Apple ID**. Deleting
> the app is not enough.

### "Hide My Email"

If the user picks *Hide My Email*, Apple issues a per-app relay address
(`…@privaterelay.appleid.com`) and that is what the identity token carries — so
that is what Supabase stores as the user's email, with no special handling on our
side. It routes real mail to them, so password-reset and transactional email
still work.

Two consequences worth knowing:

- The same person signing in later with Google gets a **different** Supabase user,
  because the emails differ. Account linking is not implemented.
- If the app is ever removed from their Apple ID, the relay stops forwarding.

## Manual setup (one-time)

Requires the paid Apple Developer Program. For the **native** flow only the
bundle identifier is needed — no Services ID, no key, no client secret. (Those
are only required for a web/OAuth Apple flow, which this app does not use.)

1. **Apple Developer → Certificates, Identifiers & Profiles → Identifiers.**
   Select `com.fantasygaffer.app` and enable the **Sign in with Apple**
   capability. (`ios.usesAppleSignIn: true` in `app.config.ts` adds the matching
   entitlement to the build; EAS provisions the profile.)
2. **Supabase Dashboard → Authentication → Providers → Apple.** Toggle on, and
   under **Authorized Client IDs** add `com.fantasygaffer.app`. Leave the
   Services ID / Secret Key fields empty.
3. Nothing to add to the redirect-URL allowlist — the native flow has no redirect.

## Testing

**Needs a dev build or TestFlight** — the sheet does not work in Expo Go, and
simulator support is limited (the sim can sign in with a signed-in Apple ID, but
Face ID and the Hide-My-Email chooser behave differently). Do the acceptance pass
on a real device.

| Path | Expected |
|---|---|
| First sign-in, real email | Lands on complete-profile with the name pre-filled |
| First sign-in, Hide My Email | Same, and the profile email is `…@privaterelay.appleid.com` |
| Second sign-in | Straight to the team tab; no name prompt |
| Dismiss the sheet | Returns to sign-in, **no error shown** |
| Airplane mode | "Apple sign-in failed. Please try again." |
| Android | Button is not rendered at all |

Unit coverage: `src/__tests__/auth/apple.test.ts` (helper, including the
"never log the identity token" guard from #166) and the `SignIn screen — Apple`
block in `src/__tests__/signinScreen.test.tsx`.

## Files

- `src/lib/auth/apple.ts` — the `signInWithApple()` helper
- `src/app/(onboarding)/signin.tsx` — the button, iOS-gated
- `src/components/forms/SocialBtn.tsx` — the button itself (shared with Google)
- `app.config.ts` — `ios.usesAppleSignIn: true`

## Known review risk

The button is our own `SocialBtn`, not Apple's `AppleAuthenticationButton`.
Apple permits a custom button that follows the Human Interface Guidelines — ours
is black, carries the Apple mark, says "Continue with Apple", is 54pt tall
(minimum 44), and is no less prominent than the Google button. The one deviation
is the typeface (Archivo, matching the rest of the screen, rather than SF Pro).

If review objects, the fix is a one-line swap in `signin.tsx` to
`<AppleAuthentication.AppleAuthenticationButton …>` — but it will then look
different from the Google button sitting above it.
