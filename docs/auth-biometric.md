# Biometric App Lock

Implements [#18](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/18) /
[#73](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/73). Spec:
`docs/superpowers/specs/2026-07-25-biometric-app-lock-design.md`.

This is a **lock on an already-live session**, not a signed-out session restore. See
"Why this is a lock, not a session restore" below for how it got here.

## How it works at runtime

### Enrollment (via the Settings toggle)

```
Signed-in user toggles "Face ID login" ON in Settings
  ↓
biometricStore.enable()
  ↓
capability.promptBiometric("Confirm Face ID to enable") — proves the user
  ↓ confirm
AsyncStorage.setItem('biometric_enabled', 'true')
```

On cancel, the toggle bounces back to off (it reads `biometricStore.enabled`
directly; a failed `enable()` never flips state). There is no sign-in-time
enrollment path — the toggle is the only entry point.

### Cold start → lock resolution

```
App cold-starts → fonts/theme/auth/biometric stores hydrate
  ↓
AppGate calls biometricStore.resolveLock(!!session)
  ↓
locked = enabled && hasSession   (computed once, then set)
  ↓
resolveLock is a no-op on any later call this launch (`resolved` guard) —
a mid-run sign-in must never retroactively lock, and nothing re-locks later
```

`AppGate` (`src/app/_layout.tsx`) renders `null` while `locked === null` (the
splash screen stays up, so no frame ever shows app content before the verdict
is in), `<LockScreen/>` while `locked === true`, and the normal `<Stack/>`
otherwise. Providers (`AnalyticsProvider`, `SafeAreaProvider`, etc.) stay
mounted while locked; the `<Stack/>` itself does not mount, so no route or
query fires behind the lock.

`locked` only ever moves **one way after resolution**: to `false`, via
`unlock()` (LockScreen success, or the unsupported-hardware fallback below) or
a `SIGNED_OUT` auth event. Nothing sets it back to `true` mid-session — this
is a launch-time gate, not a background-timeout re-lock (see Future work).

### LockScreen

```
LockScreen mounts → attempt() fires automatically (guarded by an in-flight ref
  so a second concurrent prompt can't stack)
  ↓
capability.isSupported() false? → disable() + unlock() — Face ID was turned
  off or re-enrolled in iOS Settings since the flag was set, so the stored
  preference can never be satisfied again; let the user through rather than
  trap them behind an unsatisfiable prompt
  ↓ (supported)
capability.promptBiometric("Unlock Fantasy Gaffer")
  ↓ success → unlock()
  ↓ cancel/lockout → status message, "Unlock with Face ID" retry button,
    and a "Sign out" escape (routes through useAuthStore.signOut(), which
    fires SIGNED_OUT → biometricStore clears `locked`)
```

### Sign-out

```
useAuthStore.signOut() (from LockScreen's escape, or Settings)
  ↓
Supabase clears the session → onAuthStateChange('SIGNED_OUT')
  ↓
biometricStore sets locked = false
  ↓
AppGate re-renders the Stack, which (with no session) routes to onboarding
```

`SIGNED_IN` is deliberately **not** subscribed to. Session-restore, app
foreground, and token-refresh all emit `SIGNED_IN` too (see the
`lastSignInUserId` note at `src/store/authStore.ts:15-17`) — unlocking on it
would auto-unlock every cold start and defeat the feature entirely.

To clear enrollment, the user toggles Face ID OFF in Settings.

## Why this is a lock, not a session restore

The original design (`docs/superpowers/specs/2026-06-09-biometric-unlock-design.md`) stored the session in
SecureStore and replayed it via `setSession` after sign-out. Verification for #73 proved that unreachable:
**any** sign-out revokes the session server-side, including `scope: 'local'` — GoTrue returns
`403 Session from session_id claim in JWT does not exist` for the stored access token, and `400` for the
refresh token. See `docs/superpowers/specs/2026-07-25-biometric-app-lock-design.md`.

## Manual setup

No external service required — this is fully on-device. But:

1. Use a **dev build** or production build, not Expo Go. Biometric prompts
   require a real build to behave correctly.
2. On the iOS simulator, set up Face ID: Features → Face ID → Enrolled. Then
   trigger matches via Features → Face ID → Matching Face / Non-matching Face.
3. On Android emulator, set up fingerprint: Settings → Security → Fingerprint.
   Then trigger via `adb -e emu finger touch <id>`.

## Files

- `src/lib/auth/biometric/capability.ts` — thin wrapper around
  `expo-local-authentication` (`isSupported`, `promptBiometric`).
- `src/lib/auth/biometric/enrollment.ts` — orchestration: `enable`, `disable`.
  Defines `BiometricErrorKind`.
- `src/store/biometricStore.ts` — Zustand store; owns `enabled` (persisted
  flag) and `locked` (per-launch verdict, resolved by `resolveLock`); subscribes
  to `supabase.auth.onAuthStateChange` only for `SIGNED_OUT`.
- `src/components/auth/LockScreen.tsx` — the lock UI: auto-prompts on mount,
  retry, sign-out escape, unsupported-hardware fallback.
- `src/app/_layout.tsx` — `AppGate` calls `resolveLock` on cold start and
  renders `LockScreen` in place of the router while locked.

## Troubleshooting

**Lock never appears even though Face ID is enabled**
- `locked = enabled && hasSession` is only computed once, at `AppGate`'s
  `resolveLock` call, and only when there IS a session. Confirm the toggle is
  actually on (`biometricStore.enabled`) and that the app was truly cold-started
  (not just reloaded) with a live session already present.

**Lock appears then immediately clears**
- Check for a stray `SIGNED_OUT` firing — it's the only auth event that clears
  `locked`, so anything that calls `supabase.auth.signOut()` (directly or via
  `useAuthStore.signOut()`) will dismiss the lock.

**Checkbox/toggle is never visible in Settings**
- `capability.isSupported()` returned false. Likely the simulator/device
  doesn't have biometric enrolled (Settings → Face ID). On a real device,
  ensure the app has permission (Settings → Fantasy Gaffer → Face ID).

## Future work

- **Background re-lock** — currently the lock is resolved once at cold start
  only. "Re-lock after N minutes backgrounded" is a common upgrade for
  app-launch-style locking but is out of scope here.
- **Per-action biometric guards** — sensitive actions (transfer accept,
  account delete) could re-prompt. Not in scope here; spec-able as a follow-up.
