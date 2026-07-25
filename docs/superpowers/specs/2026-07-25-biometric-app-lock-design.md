# Biometric app-lock (re-scope of biometric unlock) — Design

**Issue:** [#73 — [Phase 5] Verify biometric unlock end-to-end on dev build](https://github.com/vigneshashokan/fantasy-gaffer/issues/73)
**Supersedes:** `2026-06-09-biometric-unlock-design.md` (the "restore a signed-out session" model)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-07-25

## Goal

Running #73's manual test plan on the simulator dev client proved the shipped feature cannot do the
thing it was designed to do. Re-scope biometric from **"unlock a signed-out session"** to
**"lock an already-live session"**, and in doing so delete the three defects the verification found
rather than patch them.

## Why the old model is unreachable (evidence, not opinion)

`useAuthStore.signOut()` revokes the session server-side. Verified directly against GoTrue, replaying
exactly what `attemptUnlock` → `setSession` does with the tokens the biometric slot had stored:

```
signOut(scope:'global') → 204
  GET /user (unexpired access token) → 403 Session from session_id claim in JWT does not exist
  grant_type=refresh_token             → 400

signOut(scope:'local')  → 204
  GET /user (unexpired access token) → 403 Session from session_id claim in JWT does not exist
  grant_type=refresh_token             → 400
```

**Both scopes revoke it** — this is not fixable by passing `scope: 'local'`. In-app, instrumented:

```
[bio-dbg] attemptUnlock enter
[bio-dbg] prompt result {"ok":true}
[bio-dbg] calling setSession
[bio-dbg] setSession returned ERROR Auth session missing!
```

The superseded spec's §Sign-out Behavior assumed sign-out was a local clear and asserted *"signing out
then re-launching auto-unlocks back to the same account, which is the intent"*. That intent requires a
sign-out that does not revoke server-side — a security-posture change explicitly rejected in favour of
this re-scope.

The two other defects found (recorded on #73, both deleted by this design rather than fixed):

- **B** — `attemptUnlock`'s failure path called the *module* `disable()`, which cleared storage but never
  updated `biometricStore.enabled`. In-memory state stayed `true` while storage said disabled: the
  checkbox stayed hidden and the mount effect kept re-firing (a third `attemptUnlock` began while the
  second was still awaiting `setSession`). Self-corrected only on the next cold start.
- **C** — the `expired_link` banner never rendered: `disable()` changed state → the mount effect re-ran →
  its cleanup set `cancelled = true` → the in-flight `.then()` bailed before `setBiometricBanner`. The
  user saw a prompt, then nothing at all.
- **D** — concurrent `attemptUnlock` calls stacked Face ID sheets; each new `authenticateAsync` killed the
  previous with `system_cancel`, which `capability.ts` maps to `'cancel'` and swallows.

## Scope decisions (from brainstorming)

- **Lock fires on cold start only.** No `AppState` listener, no background timer. The semantics come free
  from non-persisted store state resolved once per launch (see Lock resolution below). A
  background-timeout re-lock is a later lever, not now.
- **Cancel leaves the app locked**, with a retry and a **sign-out escape**. The escape is load-bearing
  twice over: it stops a broken/re-enrolled sensor bricking the app, and it is the *only* reason an E2E
  flow can cover the lock screen at all (see Testing).
- **The SecureStore session slot is deleted.** It existed solely to restore a signed-out session. Supabase
  already persists the live session in AsyncStorage, so a second copy bought nothing. Honest framing:
  **this lock is a UI gate, not a crypto boundary** — the session sits in AsyncStorage either way, and
  that posture is unchanged by this work.
- **Enrollment moves to the Settings toggle only.** The sign-in checkbox, its `onSubmit`/`onGoogle` hooks
  and the 300 ms post-Google-browser delay hack all go. One surface, and it removes the observed collision
  where the Face ID sheet and the push-priming sheet appeared simultaneously on first sign-in.
  Discoverability rides on the #49 onboarding tutorial.
- **Gate lives in `AppGate`** (`src/app/_layout.tsx`), which already holds the whole tree behind `ready`.
  Nothing behind the lock mounts: no queries fire and there is no content to leak into the app switcher.
  Rejected: an absolute overlay (mounts and fetches the tree behind the lock, one z-index from visible)
  and a `lock.tsx` route (races `index.tsx`'s session redirect and `useProfileGate`; a lock is a gate you
  pass, not a place you navigate to).

## Non-goals

- No re-lock on foreground/background, and no inactivity timeout.
- No device-passcode fallback (`disableDeviceFallback: true` stays) — the sign-out escape replaces it.
- No per-screen or per-action biometric confirmation (e.g. re-auth before a destructive action).
- No encryption of the Supabase session at rest. Out of scope, and not made worse here.
- No multi-account support. Unchanged from the superseded spec.

## Architecture

```
STATE                                COMPONENT                      WIRING
─────                                ─────────                      ──────
src/store/biometricStore.ts          src/components/auth/           src/app/_layout.tsx  (AppGate)
  enabled:  boolean (persisted)      LockScreen.tsx                   ready += biometricHydrated
  hydrated: boolean                    fires prompt on mount          once ready → resolveLock(!!session)
  locked:   boolean | null             retry + sign-out buttons       locked === null → null (splash)
  resolved: boolean                    one attempt() behind an        locked === true → <LockScreen/>
  enable() / disable()                 in-flight ref                  else            → <Stack/>
  resolveLock(hasSession)
  unlock()                           src/components/settings/
  ── subscribes SIGNED_OUT ──►         BiometricCard.tsx
     locked = false                    (unchanged but for copy)

src/lib/auth/biometric/
  capability.ts   UNCHANGED (isSupported, supportedTypes, promptBiometric)
  enrollment.ts   collapses to enable() / disable(); called only via store actions
  storage.ts      DELETED
  index.ts        barrel updated
```

`BiometricErrorKind` narrows to `'cancel' | 'lockout' | 'unsupported' | 'unknown'` — `'expired_link'` and
`'no_session'` are deleted along with the code paths that produced them. `Result` and
`BIOMETRIC_ENABLED_KEY` are unchanged. The barrel drops `attemptUnlock` and `persistCurrentSession`;
`supportedTypes` currently has no consumer anywhere and may be dropped with it (see Follow-ups).

### Lock resolution — resolved once per launch, one-way to unlocked

The obvious rule ("unlock on sign-in") is wrong here, and the codebase already documents why:
`authStore.ts:15-17` tracks `lastSignInUserId` precisely because **session-restore, foreground and
token-refresh all emit `SIGNED_IN`**. Keying the unlock off that event would auto-unlock every cold start
and neuter the feature.

A naive `unlocked` flag fails the opposite way: launch signed-out, sign in, and the gate would lock the
session the user just created.

So `locked` is computed **once** and never re-evaluated:

| Event | Effect |
|---|---|
| `AppGate` becomes `ready` (first time) | `resolveLock(hasSession)` → `locked = enabled && hasSession`; sets `resolved` |
| `resolveLock` called again this launch | No-op (idempotent — guarded by `resolved`) |
| Successful biometric prompt | `unlock()` → `locked = false` |
| `SIGNED_OUT` | `locked = false` (lets the sign-out escape reveal the router → onboarding) |
| Mid-run sign-in | Nothing — `locked` was decided at launch and is already `false` |
| Next cold start | Resolved fresh |

`AppGate` renders `null` while `locked === null`, so the splash stays up for the frame between `ready`
and the resolving effect. No frame ever shows app content behind an unresolved lock.

## Data flow

1. Cold start → fonts, theme, auth and biometric stores hydrate; query cache restores.
2. `AppGate` `ready` → `resolveLock(!!session)`.
3. `locked === true` → `<LockScreen/>` mounts and calls `attempt()` once.
4. `attempt()` → `isSupported()` → `promptBiometric('Unlock Fantasy Gaffer')`.
5. Success → `unlock()` → `AppGate` re-renders → `<Stack/>` mounts → normal routing.
6. Failure → stay on `LockScreen`; retry re-enters `attempt()`; sign-out calls `authStore.signOut()`.

## Error handling

| Case | Behavior |
|---|---|
| Cancel / non-matching face | Stay locked; retry + sign out visible. No banner — the screen *is* the state |
| Lockout (too many attempts) | Stay locked; copy names the lockout |
| `promptBiometric` throws | Treated as failure; stay locked |
| `isSupported()` false at lock time | `disable()` + `unlock()` |

The last row prevents a permanent lockout: if the user re-enrolls their face in iOS Settings, `enabled`
is stale and every prompt would fail forever, leaving sign-out as the only exit. It is not a bypass —
changing Face ID enrollment requires the device passcode.

Concurrency (defect D) is closed by construction: mount-fire and retry both route through one `attempt()`
guarded by an in-flight ref, so a second call while one is pending returns immediately.

## Testing

The defects hid because of *how* the tests were written, so the test plan is part of the fix. Two
mechanisms did the hiding: `signinScreen.test.tsx` mocks `@/store/biometricStore` wholesale (store
desync unobservable), and `enrollment.test.ts` mocks `supabase` (server-side revocation unobservable).
Same family as the mock-drift lesson from #155.

**New — `src/__tests__/store/biometricStore.test.ts`** (no such file exists today; its absence is exactly
why defect B survived). Real store; mocks only `capability` and AsyncStorage.

- `enable()` prompts, and on success sets `enabled` **and** persists the flag
- `enable()` on cancel leaves `enabled` false and writes nothing
- `enable()` when unsupported returns `'unsupported'` without prompting
- `disable()` clears the persisted flag **and** in-memory state — direct defect-B regression
- `resolveLock` maps `(enabled, hasSession)` → `locked` across all four combinations
- `resolveLock` is idempotent: a second call with different args does not change `locked`
- `unlock()` clears `locked`; `SIGNED_OUT` clears `locked`

**New — `src/__tests__/components/auth/lockScreen.test.tsx`.** Real component; mocks `capability` and
`authStore`.

- prompts exactly once on mount
- success calls `unlock()`
- cancel stays locked and renders retry + sign out
- retry re-prompts
- **concurrent attempts fire only one prompt** — defect-D regression
- unsupported → `disable()` + `unlock()`
- sign out calls `authStore.signOut()`

**New — `src/__tests__/appGate.test.tsx`.** Requires exporting `AppGate` from `_layout.tsx`. Covers the
three-way branch: `null` while `locked === null`, `LockScreen` when locked, children otherwise.

**Removed** — `src/__tests__/auth/biometric/storage.test.ts` (module deleted); `enrollment.test.ts` cut to
`enable`/`disable`; roughly 8 of `signinScreen.test.tsx`'s 26 cases (checkbox matrix, enrollment-on-signin,
Google enrollment, auto-unlock, banner). Its `jest.mock('@/store/biometricStore')` is deleted outright, not
adjusted — after this change the sign-in screen does not touch biometrics at all.

**E2E — one new Maestro flow**, possible only because of the sign-out escape. Maestro cannot satisfy the
system Face ID sheet (proven while verifying #73: the sheet is a separate system window, and the simulator
renders it with no Cancel affordance, so a non-matching face leaves it up indefinitely). The flow does:
enable in Settings → relaunch → assert the lock screen → sign out from it → assert the sign-in screen. No
biometric interaction required. The existing three flows are unaffected — they never enable the setting.

**Known limitation, recorded deliberately:** jest cannot exercise the native prompt, so every test above
asserts that the code *consults* `capability`, never that iOS actually authenticated. Same class of
limitation `docs/a11y.md` already documents for reduced-motion, and the reason the manual on-device pass
below still exists.

**Operator-only (still needs a real device):** actual Face ID success, user-cancel, and lockout. #73's
manual plan is rewritten to those three; its steps 3, 6 and 7 are deleted as meaningless under this model.

## Follow-ups (not now)

- Re-lock on foreground after N minutes in the background (needs an `AppState` bridge; mirror
  `reactQueryFocus.ts`).
- Encrypt the Supabase session at rest, if the UI-gate framing ever needs to become a real boundary.
- Mention the Settings toggle in the #49 onboarding tutorial, to recover the discoverability the sign-in
  checkbox provided.
- Drop `capability.supportedTypes()` — exported through the barrel but called from nowhere in `src/`. It
  is dead either way; deleting it while the barrel is already being rewritten is free, keeping it costs a
  test. Implementer's call, noted here so it is a decision rather than an oversight.

## Acceptance criteria mapping (issue #73)

| Original step | Disposition |
|---|---|
| 1 — email sign-in + checkbox → prompt → toggle on | Rewritten: enable via Settings toggle → prompt → toggle on |
| 2 — same via Google | Deleted — enrollment no longer happens at sign-in |
| 3 — sign out → reopen → auto-unlock → home | **Deleted** — unreachable by design (see evidence above) |
| 4 — cancel prompt → password still works | Rewritten: cancel → stays locked; sign-out escape reaches the sign-in screen |
| 5 — toggle off → prompt-free; no auto-fire | Retained as-is (passed verification) |
| 6 — A → B single-slot overwrite | **Deleted** — no stored session slot exists |
| 7 — revoked session → expired banner | **Deleted** — no `setSession`, so no `expired_link` path |
| *new* | Cold start with a live session + enabled → lock screen appears |
| *new* | Successful Face ID → app revealed |
| *new* | Lock does not re-fire on foreground, only on cold start |
