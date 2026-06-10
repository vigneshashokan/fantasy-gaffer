# Biometric Session Unlock

Implements [#18](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/18). Spec: `docs/superpowers/specs/2026-06-09-biometric-unlock-design.md`.

## How it works at runtime

### Enrollment (via the SignIn checkbox)

```
User types email + password (or taps Continue with Google)
  ↓
User ticks "Remember to use Face ID" (only visible if device supports biometrics
                                      and biometric is not already enabled)
  ↓
signInWithEmail / signInWithGoogle succeeds
  ↓
biometricStore.enable() runs (after the success branch, before navigation)
  ↓
capability.promptBiometric("Confirm Face ID to enable") — proves user
  ↓
supabase.auth.getSession() → current access + refresh tokens
  ↓
storage.saveSession(...) → expo-secure-store (single slot)
AsyncStorage.setItem('biometric_enabled', 'true')
  ↓
(onboarding)/_layout sees the new session → routes home
```

Enrollment failure (user cancels biometric, no hardware, etc.) is logged via
`console.warn` and never blocks the sign-in itself.

### Enrollment (via the Profile toggle)

Signed-in user toggles "Face ID login" ON in Profile → Security:

```
ToggleRow.onChange(true) → biometricStore.enable()
  ↓
capability.promptBiometric("Confirm Face ID to enable")
  ↓ confirm
storage.saveSession + AsyncStorage flag — same as above
```

On cancel, the toggle bounces back to off (the toggle reads
`biometricStore.enabled` directly; failed enable doesn't flip state).

### Auto-unlock (next launch, signed-out scenario)

```
App cold-starts → fonts/theme/auth/biometric stores hydrate
  ↓
useAuthStore.session is null AND biometricStore.enabled is true AND
  biometricStore.justSignedOut is false
  ↓
(onboarding)/_layout renders SignIn
  ↓
SignIn useEffect fires attemptUnlock() automatically
  ↓
storage.loadSession() → { access_token, refresh_token }
  ↓ (no stored session → return no_session, skip prompt)
capability.promptBiometric("Unlock FPL Gaffer with Face ID")
  ↓ confirm
supabase.auth.setSession({ access_token, refresh_token })
  ↓ Supabase validates, rotates if needed
session lands → onAuthStateChange → useAuthStore.session updates
  ↓
(onboarding)/_layout redirects to /(home)/(tabs)/team
```

### Sign-out

```
useAuthStore.signOut() (e.g. Profile → Sign out)
  ↓
Supabase clears the session → onAuthStateChange('SIGNED_OUT')
  ↓
biometricStore listener sets justSignedOut = true
SecureStore and the AsyncStorage flag are LEFT IN PLACE
  ↓
Next SignIn mount checks justSignedOut, calls consumeJustSignedOut(),
  and skips auto-unlock that one render
  ↓
Subsequent renders / cold-starts auto-unlock normally
```

To clear biometric, the user toggles Face ID OFF in Profile.

### Auto-unlock failure → fallback

If `supabase.auth.setSession` rejects (refresh token expired beyond Supabase's
60-day default TTL, or revoked via `signOut({ scope: 'others' })` from another
device), `attemptUnlock` internally calls `disable()` and returns
`{ ok: false, error: 'expired_link' }`. The SignIn screen shows the banner
"Face ID session expired — sign in with your password to re-enable." The user
signs in with their password; if they re-tick the checkbox, biometric is
re-enrolled.

## Manual setup

No external service required — this is fully on-device. But:

1. Use a **dev build** or production build, not Expo Go. Custom URL schemes and
   biometric prompts both require a real build to behave correctly.
2. On the iOS simulator, set up Face ID: Features → Face ID → Enrolled. Then
   trigger matches via Features → Face ID → Matching Face / Non-matching Face.
3. On Android emulator, set up fingerprint: Settings → Security → Fingerprint.
   Then trigger via `adb -e emu finger touch <id>`.

## Files

- `src/lib/auth/biometric/capability.ts` — thin wrapper around
  `expo-local-authentication`.
- `src/lib/auth/biometric/storage.ts` — single-slot wrapper around
  `expo-secure-store`.
- `src/lib/auth/biometric/enrollment.ts` — orchestration: `enable`, `disable`,
  `attemptUnlock`, `persistCurrentSession`. Defines `BiometricErrorKind`.
- `src/lib/auth/biometric/index.ts` — public re-exports.
- `src/store/biometricStore.ts` — Zustand store; subscribes to
  `supabase.auth.onAuthStateChange` for token rotation and sign-out tracking.
- `src/components/forms/Checkbox.tsx` — themed checkbox primitive (used by
  SignIn's Remember-Face-ID opt-in).

## Troubleshooting

**Auto-unlock prompt appears even after I signed out**
- Check that `biometricStore.justSignedOut` is being set. The store subscribes
  to `supabase.auth.onAuthStateChange('SIGNED_OUT')` — if that event isn't
  firing (some custom sign-out paths), the flag won't flip. Verify the sign-out
  call goes through `supabase.auth.signOut()`.

**Unlock works but routes back to SignIn**
- The session might be landing without the `(onboarding)/_layout.tsx` picking
  it up. Confirm `useAuthStore.session` updates after `setSession`. If
  `onAuthStateChange` is not firing on `setSession`, the layout won't see the
  session change.

**"Face ID session expired" appears immediately after enrollment**
- Likely cause: `storage.saveSession` wrote the old (about-to-be-rotated)
  tokens, and the very next refresh invalidated them. `biometricStore`'s
  `TOKEN_REFRESHED` listener handles this, but if `getSession` is called before
  the refresh completes, you may have a stale snapshot. This is rare in
  practice but the fix is the listener already wired up in
  `biometricStore`.

**Checkbox is never visible**
- `capability.isSupported()` returned false. Likely the simulator/device
  doesn't have biometric enrolled (Settings → Face ID). On a real device,
  ensure the app has permission (Settings → FPL Gaffer → Face ID).

## Future work

- **Background re-lock** — currently we only prompt at SignIn time. A common
  upgrade is "biometric required after N minutes in the background" for
  app-launch-style locking. Not in this scope.
- **Multi-user biometric** — single slot for now. If we ever support multiple
  Gaffer accounts on one device, this needs to grow.
- **Per-action biometric guards** — sensitive actions (transfer accept,
  account delete) could re-prompt. Not in scope here; spec-able as a follow-up.
