# Sub-project E (part 1): Biometric Session Unlock — Design Spec

**Issue:** [#18 — Biometric (Face ID / Touch ID) session unlock](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/18)
**Date:** 2026-06-09
**Status:** Approved

---

## Purpose

Replace the visual `COMING_SOON` stub on the SignIn screen with a real biometric unlock flow. After an opt-in moment, returning users can re-enter the app via Face ID / Touch ID instead of re-typing their password, with the credentials never leaving the device.

This is the fourth sub-project in the auth cluster:

| Sub-project | Closes | Status |
|---|---|---|
| C Google OAuth + auth foundation | #13 | shipped |
| A Email/password + signup + forgot password | #15, #16, #17 | shipped |
| **E (part 1)** Biometric unlock | #18 | **this spec** |
| E (part 2) Account deletion | #19 | next |
| D Apple OAuth | #14 | deferred to just before App Store submission |

## Framing Decision: Issue ACs Need Rewriting

Issue #18's original acceptance criteria ("reads token from SecureStore, calls `signIn()`") assume a custom backend that issues plain session tokens. Our architecture is **Supabase Auth** with the AsyncStorage adapter — Supabase already owns session persistence and rotation. So the real work isn't "wire SecureStore as our session store"; it's "store the existing Supabase session in SecureStore behind a biometric gate, and call `supabase.auth.setSession(...)` on unlock to hand it back."

Concretely: we persist the Supabase access + refresh tokens to `expo-secure-store`. On a successful biometric prompt, we call `supabase.auth.setSession({ access_token, refresh_token })` which validates, rotates if needed, and lands the session via `onAuthStateChange`. No password is ever stored on-device, and the refresh token's 60-day TTL bounds how long biometric is good for before a fallback to password is required.

After this sub-project merges, we'll comment on #18 with the rewritten framing — same pattern as the #13, #15/#16/#17 reframes.

## Tech Stack

- **`expo-local-authentication`** — biometric prompt + capability checks. New dependency (`npx expo install expo-local-authentication`).
- **`expo-secure-store`** — encrypted storage for the Supabase session. New dependency (`npx expo install expo-secure-store`).
- **Supabase Auth** — `supabase.auth.setSession`, `supabase.auth.getSession`, `supabase.auth.onAuthStateChange`. No new APIs.
- **Zustand** — new `useBiometricStore` parallel to `useAuthStore`.
- **AsyncStorage** — preference flag (`biometric_enabled`). Already used by `useThemeStore` and the Supabase adapter.

## Architecture

Three layers, each with a clear interface. The Supabase client and the existing auth store are untouched.

### 1. Biometric library (`src/lib/auth/biometric/`)

```
src/lib/auth/biometric/
  capability.ts   — wraps expo-local-authentication
  storage.ts      — wraps expo-secure-store (single-slot)
  enrollment.ts   — orchestration: enable / disable / attemptUnlock
  index.ts        — re-exports
```

**`capability.ts`** — three pure functions, no state:

```ts
export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'unknown';

export async function isSupported(): Promise<boolean>;
// hasHardwareAsync() && isEnrolledAsync()

export async function supportedTypes(): Promise<BiometricKind[]>;
// Maps LocalAuthentication.supportedAuthenticationTypesAsync results.

type PromptResult = { ok: true } | { ok: false; error: 'cancel' | 'lockout' | 'unknown' };
export async function promptBiometric(reason: string): Promise<PromptResult>;
// authenticateAsync({ promptMessage: reason, fallbackLabel: 'Use password' })
```

**`storage.ts`** — single slot. We only ever store one user's session per device (see "Multi-user" below).

```ts
export interface StoredSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

const SLOT = 'fpl_gaffer_biometric_session';

export async function saveSession(s: StoredSession): Promise<void>;
export async function loadSession(): Promise<StoredSession | null>;
export async function clearSession(): Promise<void>;
```

JSON-serialized to a single SecureStore key. Malformed JSON is treated as absent (returns null), defensively.

**`enrollment.ts`** — the orchestration layer. Same `Result<T>` shape as `email.ts`:

```ts
type Result<T = void> = { ok: true; value: T } | { ok: false; error: BiometricErrorKind };

type BiometricErrorKind =
  | 'cancel'           // user cancelled the OS prompt
  | 'lockout'          // too many failed attempts; OS locked biometric out
  | 'expired_link'     // Supabase refused the stored session (refresh token expired/revoked)
  | 'no_session'       // tried to enroll without an active Supabase session
  | 'unsupported'      // device has no biometric or none enrolled
  | 'unknown';

export async function enable(): Promise<Result>;
// 1. isSupported() → if false, return { ok: false, error: 'unsupported' }.
// 2. promptBiometric('Confirm Face ID to enable') — proves user is the session holder.
// 3. supabase.auth.getSession() — read current tokens.
// 4. storage.saveSession(...).
// 5. AsyncStorage.setItem('biometric_enabled', 'true').

export async function disable(): Promise<void>;
// storage.clearSession(); AsyncStorage.removeItem('biometric_enabled').
// No prompt. Always succeeds.

export async function attemptUnlock(): Promise<Result>;
// 1. storage.loadSession() → if null, return { ok: false, error: 'no_session' }.
// 2. promptBiometric('Unlock FPL Gaffer with Face ID').
// 3. supabase.auth.setSession({ access_token, refresh_token }).
//    - On error: call disable() (clear state); return { ok: false, error: 'expired_link' }.
// 4. Return { ok: true }.

export async function persistCurrentSession(): Promise<void>;
// For onAuthStateChange('TOKEN_REFRESHED', session) — silently rewrites storage so
// the saved tokens never go stale. Called from biometricStore.
```

### 2. State (`src/store/biometricStore.ts`)

Mirrors `useAuthStore`'s shape and hydration semantics.

```ts
interface BiometricState {
  enabled: boolean;
  hydrated: boolean;
  justSignedOut: boolean;
  enable: () => Promise<Result>;
  disable: () => Promise<void>;
  consumeJustSignedOut: () => void;
}
```

On module init:
- Reads `AsyncStorage.getItem('biometric_enabled')` → sets `enabled` + `hydrated: true`.
- Subscribes to `supabase.auth.onAuthStateChange`. On `TOKEN_REFRESHED` (and `SIGNED_IN`) events, if `enabled === true`, calls `enrollment.persistCurrentSession()` to keep SecureStore fresh.
- On `SIGNED_OUT`, leaves SecureStore alone (sign-out should not wipe biometric — see "Sign-out" below) but flips `justSignedOut: true` so SignIn's auto-unlock skips for one cycle.

`enable()` wraps `enrollment.enable()`:
- On `ok: true` → `set({ enabled: true })`.
- On `ok: false` → state unchanged. Caller handles UI bounce-back.

`disable()` wraps `enrollment.disable()`:
- Always `set({ enabled: false })`.

### 3. Screens

**`src/app/(onboarding)/signin.tsx`** — edits:

| Change | Why |
|---|---|
| Remove the bottom Face ID Pressable block (icon + label) | Auto-unlock replaces it; manual button no longer the primary affordance |
| Add a `Checkbox` "Remember to use Face ID" below the password field, above the Forgot link | Inline opt-in — matches user preference |
| Checkbox visibility: `useState supported (from capability.isSupported on mount) && !biometricStore.enabled` | Only show when device CAN do it and user isn't already enrolled |
| `useEffect` on mount: if `hydrated && enabled && authHydrated && !justSignedOut`, call `enrollment.attemptUnlock()` | Auto-fire |
| `onSubmit` happy path: if checkbox ticked, call `biometricStore.enable()` after `signInWithEmail` succeeds | Enrollment |
| Same enrollment hook after `signInWithGoogle()` succeeds | Google users benefit too |
| Read `biometricStore.justSignedOut`; if true, call `consumeJustSignedOut()` and skip auto-unlock for that render | Avoids re-unlock loop after explicit sign-out |
| Render a banner on unlock failure with `expired_link`: "Face ID session expired — sign in with your password to re-enable." | Communicates the disable-and-fallback |

**`src/store/authStore.ts`** — unchanged.

The "skip auto-unlock once after sign-out" coordination lives entirely inside `biometricStore`. The store subscribes to `supabase.auth.onAuthStateChange` (already the case for `TOKEN_REFRESHED`); on `SIGNED_OUT` events, it sets a transient `justSignedOut: true` field. SignIn's auto-unlock `useEffect` checks the flag, calls a `consumeJustSignedOut()` action that flips it back to false, and bails out for that single cycle. No router-level signaling, no cross-store imports.

**`src/app/(home)/profile.tsx`** — edit the existing Face ID row:

| Change | Why |
|---|---|
| Replace local `useState faceId` with `useBiometricStore` selectors | Source of truth is the store |
| Hide the entire row when `capability.isSupported() === false` (resolved once on mount) | Don't offer a feature the device can't do |
| `onChange={(v) => v ? store.enable() : store.disable()}` | Toggling ON triggers OS confirm prompt + persists; OFF just clears |

**New component (`src/components/forms/Checkbox.tsx`):**

A tiny reusable checkbox primitive. We don't have one currently. Single state-bool + onChange, with the same theme-aware styling pattern as `Field`. Used by SignIn now; will be reused for any future "remember me" / opt-in toggles.

## Screen-by-Screen Flow

### SignIn — enrollment via checkbox

1. User types email + password (or uses Google).
2. Optionally ticks "Remember to use Face ID" (checkbox only visible if device supports biometrics and user is not enrolled).
3. Tap "Sign in" → `signInWithEmail` succeeds → session lands.
4. If checkbox ticked: call `biometricStore.enable()`. Internally: `promptBiometric` → `getSession` → `saveSession` → `setItem`.
5. Whether enable succeeds or fails, navigate home (via existing `(onboarding)/_layout` redirect). Enrollment failure is `console.warn`'d but never blocks the sign-in.

### SignIn — auto-unlock

1. App cold-starts. `useThemeStore`, `useAuthStore`, `useBiometricStore` all hydrate.
2. `useAuthStore.session === null` (signed out) AND `biometricStore.enabled === true`.
3. `(onboarding)/_layout` renders SignIn.
4. SignIn's `useEffect` fires `attemptUnlock()`.
5. OS biometric prompt appears. User confirms.
6. `setSession({ access_token, refresh_token })` → Supabase issues a fresh session via `onAuthStateChange`.
7. `useAuthStore.session` updates → `(onboarding)/_layout` redirects to `/(home)/(tabs)/team`.

### Profile — enrollment via toggle (signed-in user)

1. User toggles "Face ID login" ON.
2. `ToggleRow.onChange(true)` calls `biometricStore.enable()`.
3. OS biometric prompt appears with message "Confirm Face ID to enable."
4. On confirm → save session + set flag → `enabled: true` → toggle stays on.
5. On cancel → state unchanged → toggle (which reads `enabled` directly) bounces back to off.

### Profile — disable

1. User toggles OFF.
2. `disable()` clears SecureStore and AsyncStorage, sets `enabled: false`.
3. Toggle off, no prompt.

### Unlock failure → fallback

1. `attemptUnlock` calls `setSession` with stored tokens.
2. Supabase rejects (refresh token expired, revoked via signOut-others, etc.).
3. `enrollment.attemptUnlock` catches the error → calls `disable()` internally → returns `{ ok: false, error: 'expired_link' }`.
4. SignIn renders the banner "Face ID session expired — sign in with your password to re-enable." and shows the checkbox again (it's hidden behind `!enabled`, which is now false).

## Error Handling Matrix

| Surface | Failure mode | User sees |
|---|---|---|
| SignIn auto-unlock | user cancels OS prompt | nothing — stays on SignIn, can type password |
| SignIn auto-unlock | biometric lockout | "Too many attempts. Sign in with your password" inline banner |
| SignIn auto-unlock | stored session expired / revoked | "Face ID session expired — sign in with your password to re-enable." Biometric is internally disabled. |
| SignIn auto-unlock | network error during setSession | "Couldn't reach the server — try again or use your password." Biometric NOT disabled (transient). |
| SignIn enrollment (checkbox) | OS prompt cancelled | nothing — sign-in completes; user goes home as usual; biometric just isn't enrolled |
| SignIn enrollment | device unsupported (race: checkbox visible then user toggles biometric off in OS) | sign-in completes; console.warn; no banner |
| Profile toggle ON | OS prompt cancelled | toggle bounces back to off; no banner |
| Profile toggle ON | network error reading current session | toggle bounces back; small inline error message under the row |
| `TOKEN_REFRESHED` event while enabled | SecureStore write fails | console.warn; next launch the stored session may be stale; first unlock attempt fails with `expired_link` and disables |

## Sign-out Behavior

When `useAuthStore.signOut()` is called:
- Supabase clears the session (AsyncStorage adapter wipes its slot).
- Supabase fires `onAuthStateChange('SIGNED_OUT', null)`, which `biometricStore` listens for — it sets `justSignedOut: true`.
- We **do not** clear SecureStore or the `biometric_enabled` flag.
- SignIn's auto-unlock `useEffect` checks `justSignedOut` first; if set, it calls `consumeJustSignedOut()` (flipping it back to false) and skips the prompt for that render. Subsequent renders or a cold-start will auto-unlock normally.

This means signing out then re-launching auto-unlocks back to the same account, which is the intent. If the user wants to switch to a different account, they can: cancel the biometric prompt → type the new credentials → sign-in path overwrites SecureStore with the new user's session (single-slot).

## Multi-user Device

Single slot. Whichever user most recently ticked the checkbox (or toggled ON in Profile) owns the stored session. Signing in as a different user with the checkbox ticked overwrites. Signing in as a different user **without** ticking the checkbox: the previous user's stored session stays in SecureStore. On next launch's auto-unlock, the previous user's tokens land in `setSession` — the new user is effectively replaced by the biometric flow.

This matches typical mobile-app behavior. If we later need true multi-account support, that's a separate feature.

## Refresh Token Rotation

Supabase rotates the refresh token on each refresh. `biometricStore` subscribes to `supabase.auth.onAuthStateChange` and, on `TOKEN_REFRESHED` or `SIGNED_IN` (when `enabled === true`), calls `enrollment.persistCurrentSession()` to rewrite SecureStore. Without this, the stored token would go stale within hours and unlock would always fail.

## Testing

### Unit tests (`src/__tests__/auth/biometric/`)

- `capability.test.ts` — mock `expo-local-authentication`. Cover: hardware absent, hardware present but not enrolled, hardware + enrolled, supportedTypes mapping (FaceID / TouchID), `promptBiometric` ok / cancel / lockout / unknown.
- `storage.test.ts` — mock `expo-secure-store`. Cover: round-trip save/load, load on empty slot returns null, load on malformed JSON returns null, clear deletes the slot.
- `enrollment.test.ts` — mock supabase + capability + storage. Cover every branch of enable / disable / attemptUnlock / persistCurrentSession from the matrix above. Specifically: enable returns 'unsupported' when capability says so; enable aborts on cancel; attemptUnlock returns 'no_session' when storage empty; attemptUnlock calls disable AND returns 'expired_link' when setSession rejects; attemptUnlock returns cancel without disabling when user cancels prompt; persistCurrentSession silently no-ops when getSession returns null.

### Store test (`src/__tests__/biometricStore.test.ts`)

Mirrors `authStore.test.ts` style. Cover: starts `enabled: false, hydrated: false`; `hydrated: true` after AsyncStorage resolves; `enabled` reflects stored value; `enable()` flips state on success and leaves it on failure; `disable()` always flips state; `onAuthStateChange('TOKEN_REFRESHED', session)` triggers a persistCurrentSession call when enabled is true.

### Screen tests

- `signinScreen.test.tsx` — extend with the cases listed in Section 5 (checkbox visibility matrix, enrollment-on-signin, silent enrollment failure, auto-unlock on mount, `just_signed_out` suppression, expired-link banner, removed-button assertion).
- `profileScreen.test.tsx` — new file. Focused only on the Face ID row: hidden when unsupported; reads from `biometricStore.enabled`; toggle ON calls `enable()` (and bounces back if rejected); toggle OFF calls `disable()`.

### Manual test plan (documented, not automated)

Against a physical device or simulator with biometric set up:
1. Fresh sign-in with checkbox ticked → biometric confirm prompt → home.
2. Sign out → SignIn shows → biometric auto-fires → confirm → home.
3. Sign out → cancel biometric → stays on SignIn; can type password.
4. Profile → Face ID toggle off → toggle moves off, no prompt; sign out → SignIn shows checkbox again, no auto-fire.
5. Sign in as User A with biometric on → sign out → sign in as User B with checkbox ticked → restart app → biometric unlocks as B.
6. Reset password on a second device (which calls `signOut({ scope: 'others' })`) → first device: open app → biometric prompt → setSession rejects → banner; biometric disabled; sign in with new password.

## Out of Scope

- App-launch / background re-lock (not just at SignIn). User explicitly chose sign-in-only.
- Multi-user biometric (multiple stored sessions, "pick a user" UI). Single slot only.
- Per-action biometric guards (e.g., re-prompt for sensitive actions). Not in scope here.
- Account deletion (#19, Sub-project E part 2).
- Native Google Sign-In SDK swap. Existing `expo-web-browser` flow continues to work; biometric enrollment hook runs after Google sign-in succeeds.

## Files (Summary)

**New:**
- `src/lib/auth/biometric/capability.ts`
- `src/lib/auth/biometric/storage.ts`
- `src/lib/auth/biometric/enrollment.ts`
- `src/lib/auth/biometric/index.ts`
- `src/store/biometricStore.ts`
- `src/components/forms/Checkbox.tsx`
- `src/__tests__/auth/biometric/capability.test.ts`
- `src/__tests__/auth/biometric/storage.test.ts`
- `src/__tests__/auth/biometric/enrollment.test.ts`
- `src/__tests__/biometricStore.test.ts`
- `src/__tests__/profileScreen.test.tsx`
- `docs/auth-biometric.md`

**Edited:**
- `src/app/(onboarding)/signin.tsx` (remove Face ID button block, add Checkbox, auto-unlock hook, enrollment hook in onSubmit/onGoogle, expired-link banner)
- `src/app/(home)/profile.tsx` (wire ToggleRow to biometricStore; hide row when unsupported)
- `src/__tests__/signinScreen.test.tsx` (new cases)
- `package.json` (add `expo-local-authentication`, `expo-secure-store`)

**Existing, unchanged:**
- `src/store/authStore.ts` — coordination lives in `biometricStore` via `onAuthStateChange('SIGNED_OUT')`, no edit needed
- `src/lib/supabase.ts`
- `src/lib/auth/email.ts`
- `src/lib/auth/deepLink.ts`
- `src/lib/auth/validation.ts`
- `src/lib/auth/google.ts`
- `src/app/(onboarding)/_layout.tsx`
- `src/app/(home)/_layout.tsx`
