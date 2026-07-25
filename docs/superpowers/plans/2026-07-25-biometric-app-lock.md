# Biometric App-Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-scope biometric from "unlock a signed-out session" (unreachable — sign-out revokes the session server-side) to "lock an already-live session on cold start", deleting three verified defects in the process.

**Architecture:** `biometricStore` gains a `locked: boolean | null` resolved exactly once per launch (`locked = enabled && hasSession`) and only ever moving one-way to `false`. `AppGate` in `src/app/_layout.tsx` renders `<LockScreen/>` in place of the `<Stack>` when locked, so no route — and no query — ever mounts behind the lock. The SecureStore token slot, `attemptUnlock`, `persistCurrentSession` and the sign-in checkbox are all deleted.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / React 19, expo-router v6, Zustand, `expo-local-authentication`, Jest (`jest-expo`) + `@testing-library/react-native`, Maestro.

**Spec:** `docs/superpowers/specs/2026-07-25-biometric-app-lock-design.md` (approved, `30d11a0`)

## Global Constraints

- **Read https://docs.expo.dev/versions/v56.0.0/ before writing any Expo code** — mandated by `AGENTS.md`; APIs in this SDK band changed meaningfully. Do not write Expo APIs from memory.
- **React Compiler is ON** (`app.config.ts` experiment) — do NOT hand-roll `useMemo` / `useCallback` / `React.memo` for memoization.
- **Import `render` / `act` / `fireEvent` / `waitFor` from `@testing-library/react-native`, NEVER `react-test-renderer`** — the latter has no type declarations, so it passes jest and fails `tsc` with TS7016.
- **Tests are only collected from `**/__tests__/**/*.test.ts(x)`** — a test file outside an `__tests__/` dir is silently ignored.
- **Run jest as `npx jest <path> --watchman=false --runInBand --forceExit`** — a prior `npm start` leaves watchman in a recrawl state that stalls the haste-map crawl.
- **`npx tsc --noEmit` must pass before any task is called done.** Jest does not type-check; a wrong-but-defined-at-runtime value passes tests and fails `tsc`.
- **Theme tokens:** read via `getTheme(paletteKey, dark)`; use only keys that exist on the `Theme` interface in `src/constants/theme.ts`.
- **a11y conventions** (`docs/a11y.md`): text-child pressable → `accessibilityRole="button"` only, no redundant label; status/error text → `accessibilityLiveRegion` + `useA11yAnnounce`; fixed-height control text → `maxFontSizeMultiplier={MAX_FONT_SCALE}`.
- **Metro serves a stale bundle after source edits if watchman is wedged** — if a change does not appear in the running dev client, restart Metro with `--clear` (this cost real time during #73 verification).

---

### Task 1: Strip biometrics from the sign-in screen

Do this first: `signin.tsx` is the only consumer of the store fields Task 2 deletes, so removing it here keeps `tsc` green at every task boundary.

**Files:**
- Modify: `src/app/(onboarding)/signin.tsx`
- Modify: `src/__tests__/signinScreen.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `signin.tsx` with zero imports from `@/lib/auth/biometric/*` or `@/store/biometricStore`. Task 2 relies on this.

- [ ] **Step 1: Delete the two biometric describe blocks from the test**

In `src/__tests__/signinScreen.test.tsx`, delete these two blocks entirely:
- `describe('SignIn screen — biometric enrollment', () => { ... })` — begins at the line `describe('SignIn screen — biometric enrollment'` and ends at its closing `});`
- `describe('SignIn screen — biometric auto-unlock', () => { ... })` — same, the block containing `auto-fires attemptUnlock when enabled and hydrated`

- [ ] **Step 2: Delete the biometric mocks and mock variables from the test**

Delete these declarations near the top of the file:

```ts
const mockAttemptUnlock = jest.fn();

const mockBiometricEnable = jest.fn();
const mockBiometricSupported = jest.fn();
let mockBiometricEnabled = false;
let mockBiometricHydrated = true;
let mockBiometricJustSignedOut = false;
const mockConsumeJustSignedOut = jest.fn();
```

Delete these three `jest.mock` calls in full:

```ts
jest.mock('@/lib/auth/biometric/capability', () => ({ ... }));
jest.mock('@/lib/auth/biometric/enrollment', () => ({ ... }));
jest.mock('@/store/biometricStore', () => { ... });
```

In the two REMAINING describe blocks (`'SignIn screen'` and `'SignIn screen — Google error a11y'`), delete these lines from each `beforeEach`:

```ts
    mockBiometricEnable.mockReset();
    mockBiometricSupported.mockReset().mockResolvedValue(false);
    mockConsumeJustSignedOut.mockReset();
    mockAttemptUnlock.mockReset().mockResolvedValue({ ok: true, value: undefined });
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = false;
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx jest src/__tests__/signinScreen.test.tsx --watchman=false --runInBand --forceExit`

Expected: FAIL. `signin.tsx` still imports `@/store/biometricStore`, which is now unmocked and pulls in the real store → the real `@/lib/supabase` → `@react-native-async-storage/async-storage`, producing an `RCTAsyncStorage`/AsyncStorage "suite failed to run" error. That failure is the point: it proves the screen still reaches biometrics.

- [ ] **Step 4: Delete the biometric imports from `signin.tsx`**

Remove these four import lines:

```ts
import { isSupported as biometricIsSupported } from '@/lib/auth/biometric/capability';
import { attemptUnlock } from '@/lib/auth/biometric/enrollment';
import { useBiometricStore } from '@/store/biometricStore';
import { Checkbox } from '@/components/forms/Checkbox';
```

- [ ] **Step 5: Delete the biometric state and both effects from `signin.tsx`**

Remove this block (the five store selectors and three `useState` lines):

```ts
  const biometricEnabled = useBiometricStore((s) => s.enabled);
  const biometricEnable = useBiometricStore((s) => s.enable);
  const biometricHydrated = useBiometricStore((s) => s.hydrated);
  const biometricJustSignedOut = useBiometricStore((s) => s.justSignedOut);
  const consumeJustSignedOut = useBiometricStore((s) => s.consumeJustSignedOut);

  const [supported, setSupported] = useState(false);
  const [rememberBiometric, setRememberBiometric] = useState(false);
  const [biometricBanner, setBiometricBanner] = useState<string | null>(null);
```

Remove both `useEffect` blocks that follow it — the one calling `biometricIsSupported().then(...)` and the one calling `attemptUnlock().then(...)` — and this line:

```ts
  const showCheckbox = supported && !biometricEnabled;
```

- [ ] **Step 6: Simplify `onGoogle` and `onSubmit` in `signin.tsx`**

In `onGoogle`, replace the success branch:

```ts
      if (result.ok) {
        if (rememberBiometric) {
          // iOS won't reliably show a system prompt (Face ID) while it's
          // still dismissing another system UI (the in-app auth browser).
          // Yield ~300ms so the browser dismissal finishes before the
          // biometric confirm prompt is requested.
          await new Promise((r) => setTimeout(r, 300));
          const er = await biometricEnable();
          if (!er.ok) {
            console.warn('[biometric] enable failed (non-fatal):', er.error);
          }
        }
        return;
      }
```

with:

```ts
      if (result.ok) return;
```

In `onSubmit`, replace the success branch:

```ts
      if (r.ok) {
        if (rememberBiometric) {
          const er = await biometricEnable();
          if (!er.ok) {
            console.warn('[biometric] enable failed (non-fatal):', er.error);
          }
        }
        return; // (onboarding)/_layout redirects on session change
      }
```

with:

```ts
      if (r.ok) return; // (onboarding)/_layout redirects on session change
```

- [ ] **Step 7: Delete the banner and checkbox JSX from `signin.tsx`**

Remove the biometric banner block:

```tsx
        {biometricBanner && (
          <Text style={[styles.banner, { color: t.textMuted }]}>{biometricBanner}</Text>
        )}
```

Remove the checkbox block:

```tsx
        {showCheckbox && (
          <View style={{ marginTop: 14 }}>
            <Checkbox
              label="Remember to use Face ID"
              value={rememberBiometric}
              onChange={setRememberBiometric}
              accent={t.accent}
              text={t.text}
              textMuted={t.textMuted}
            />
          </View>
        )}
```

**Keep `styles.banner`** — the `params.verify_expired === '1'` banner still uses it.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx jest src/__tests__/signinScreen.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS, 18 tests (26 minus the 8 deleted biometric cases).

Run: `npx tsc --noEmit`
Expected: no output (success). If it reports an unused `useState` import or similar, remove the now-unused import.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(onboarding\)/signin.tsx src/__tests__/signinScreen.test.tsx
git commit -m "refactor(auth): remove biometric enrollment and auto-unlock from sign-in (#73)

Enrollment moves to the Settings toggle only. Deletes the checkbox, the
auto-unlock effect, the expired/lockout banners, and the 300ms
post-Google-browser delay hack. Also removes the observed collision where the
Face ID sheet and the push-priming sheet appeared simultaneously.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Collapse the biometric lib and store to the app-lock model

**Files:**
- Modify: `src/lib/auth/biometric/enrollment.ts`
- Modify: `src/lib/auth/biometric/capability.ts`
- Modify: `src/store/biometricStore.ts`
- Delete: `src/lib/auth/biometric/storage.ts`
- Delete: `src/lib/auth/biometric/index.ts` (barrel — verified zero consumers)
- Delete: `src/__tests__/auth/biometric/storage.test.ts`
- Modify: `src/__tests__/auth/biometric/enrollment.test.ts`
- Modify: `src/__tests__/auth/biometric/capability.test.ts`
- Modify: `src/__tests__/biometricStore.test.ts`

**Interfaces:**
- Consumes: Task 1's biometric-free `signin.tsx`.
- Produces:
  - `enable(): Promise<Result>` and `disable(): Promise<void>` from `@/lib/auth/biometric/enrollment`; `BIOMETRIC_ENABLED_KEY: string`; `type BiometricErrorKind = 'cancel' | 'lockout' | 'unsupported' | 'unknown'`; `type Result<T = void> = { ok: true; value: T } | { ok: false; error: BiometricErrorKind }`.
  - `isSupported(): Promise<boolean>` and `promptBiometric(reason: string): Promise<PromptResult>` from `@/lib/auth/biometric/capability` (unchanged signatures).
  - `useBiometricStore` with state `{ enabled: boolean; hydrated: boolean; locked: boolean | null; resolved: boolean }` and actions `enable(): Promise<Result>`, `disable(): Promise<void>`, `resolveLock(hasSession: boolean): void`, `unlock(): void`. Tasks 3 and 4 depend on these exact names.

- [ ] **Step 1: Add the failing store tests**

In `src/__tests__/biometricStore.test.ts`, first DELETE the three cases that cover removed behaviour:
- `it('calls persistCurrentSession on TOKEN_REFRESHED when enabled is true', ...)`
- `it('does NOT call persistCurrentSession on TOKEN_REFRESHED when enabled is false', ...)`
- `it('sets justSignedOut=true on SIGNED_OUT', ...)`
- `it('consumeJustSignedOut() flips the flag back to false', ...)`

In the `jest.mock('@/lib/auth/biometric/enrollment', ...)` factory, delete the `persistCurrentSession` entry and the `const mockPersistCurrentSession = jest.fn();` declaration.

Then append these cases inside the existing `describe('useBiometricStore', ...)`:

```ts
  it('resolveLock(true) locks when enabled', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(true);
    expect(useBiometricStore.getState().locked).toBe(true);
  });

  it('resolveLock(false) does not lock even when enabled', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(false);
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('resolveLock(true) does not lock when disabled', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(true);
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('resolveLock is idempotent — a second call cannot change the verdict', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(true);
    useBiometricStore.getState().resolveLock(false);
    expect(useBiometricStore.getState().locked).toBe(true);
    expect(useBiometricStore.getState().resolved).toBe(true);
  });

  it('unlock() clears locked', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(true);
    useBiometricStore.getState().unlock();
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('SIGNED_OUT clears locked so the sign-out escape reveals the router', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    useBiometricStore.getState().resolveLock(true);
    expect(useBiometricStore.getState().locked).toBe(true);
    onAuthStateChangeCallback?.('SIGNED_OUT', null);
    expect(useBiometricStore.getState().locked).toBe(false);
  });
```

These follow the file's existing idiom exactly: `jest.resetModules()` runs in the shared `beforeEach`, each case then `require`s the store fresh and awaits a `setTimeout(0)` tick for the hydration promise to settle. Do not introduce helper wrappers.

Also update the first case, which currently asserts `justSignedOut`:

```ts
  it('starts with enabled=false, hydrated=false, locked=null, resolved=false', () => {
    mockGetItem.mockReturnValueOnce(new Promise(() => {}) as never);
    const { useBiometricStore } = require('@/store/biometricStore');
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.hydrated).toBe(false);
    expect(s.locked).toBeNull();
    expect(s.resolved).toBe(false);
  });
```

and delete `mockPersistCurrentSession.mockClear();` from the shared `beforeEach`.

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `npx jest src/__tests__/biometricStore.test.ts --watchman=false --runInBand --forceExit`
Expected: FAIL — `resolveLock is not a function`, and `locked`/`resolved` are `undefined`.

- [ ] **Step 3: Rewrite `enrollment.ts`**

Replace the entire contents of `src/lib/auth/biometric/enrollment.ts` with:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';

export type BiometricErrorKind = 'cancel' | 'lockout' | 'unsupported' | 'unknown';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: BiometricErrorKind };

export const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export async function enable(): Promise<Result> {
  if (!(await isSupported())) {
    return { ok: false, error: 'unsupported' };
  }
  const prompt = await promptBiometric('Confirm Face ID to enable');
  if (!prompt.ok) {
    return { ok: false, error: prompt.error === 'lockout' ? 'lockout' : 'cancel' };
  }
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  return { ok: true, value: undefined };
}

export async function disable(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    /* swallow — clearing is best-effort */
  }
}
```

Note what left: `supabase` is no longer imported here at all, and no session tokens are read or written. The lock is a UI gate over the session Supabase already persists.

- [ ] **Step 4: Delete `supportedTypes` from `capability.ts`**

In `src/lib/auth/biometric/capability.ts`, delete the entire `supportedTypes` function and the now-unused `BiometricKind` type:

```ts
export type BiometricKind = 'face' | 'fingerprint' | 'iris';
```

Keep `isSupported`, `PromptResult` and `promptBiometric` exactly as they are.

- [ ] **Step 5: Delete the dead files**

```bash
git rm src/lib/auth/biometric/storage.ts
git rm src/lib/auth/biometric/index.ts
git rm src/__tests__/auth/biometric/storage.test.ts
```

`index.ts` is a barrel with zero importers anywhere in `src/` (verified). `storage.ts` existed only to restore a signed-out session.

- [ ] **Step 6: Rewrite `biometricStore.ts`**

Replace the entire contents of `src/store/biometricStore.ts` with:

```ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  enable as runEnable,
  disable as runDisable,
  BIOMETRIC_ENABLED_KEY,
  type Result,
} from '@/lib/auth/biometric/enrollment';

interface BiometricState {
  enabled: boolean;
  hydrated: boolean;
  /** null = not yet resolved for this launch. Resolved once, then one-way to false. */
  locked: boolean | null;
  resolved: boolean;
  enable: () => Promise<Result>;
  disable: () => Promise<void>;
  resolveLock: (hasSession: boolean) => void;
  unlock: () => void;
}

export const useBiometricStore = create<BiometricState>((set, get) => {
  // Initial hydration from AsyncStorage.
  AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)
    .then((v) => set({ enabled: v === 'true', hydrated: true }))
    .catch(() => set({ enabled: false, hydrated: true }));

  // Sign-out clears the lock so LockScreen's sign-out escape reveals the router
  // (which then routes to onboarding). This is the ONLY auth event we react to:
  // SIGNED_IN is deliberately ignored because session-restore, foreground AND
  // token-refresh all emit it (see the lastSignInUserId note in authStore.ts),
  // so unlocking on it would auto-unlock every cold start and defeat the lock.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') set({ locked: false });
  });

  return {
    enabled: false,
    hydrated: false,
    locked: null,
    resolved: false,
    enable: async () => {
      const r = await runEnable();
      if (r.ok) set({ enabled: true });
      return r;
    },
    disable: async () => {
      await runDisable();
      set({ enabled: false });
    },
    // Resolved exactly once per launch: a mid-run sign-in must never lock the
    // session the user just created, and a later re-evaluation must never
    // re-lock. Only unlock() and SIGNED_OUT move `locked` after this.
    resolveLock: (hasSession) => {
      if (get().resolved) return;
      set({ resolved: true, locked: get().enabled && hasSession });
    },
    unlock: () => set({ locked: false }),
  };
});
```

- [ ] **Step 7: Trim `enrollment.test.ts`**

In `src/__tests__/auth/biometric/enrollment.test.ts`:

Delete the `describe('attemptUnlock', ...)` and `describe('persistCurrentSession', ...)` blocks entirely.

Delete these mock declarations and the `jest.mock` calls that use them:

```ts
const mockGetSession = jest.fn();
const mockSaveSession = jest.fn();
const mockClearSession = jest.fn();
const mockLoadSession = jest.fn();
const mockSetSession = jest.fn();
```

```ts
jest.mock('@/lib/auth/biometric/storage', () => ({ ... }));
jest.mock('@/lib/supabase', () => ({ ... }));
```

In `describe('enable', ...)`, delete `it('returns no_session when supabase has no active session', ...)` and rename `it('saves session to storage and flips the AsyncStorage flag on happy path', ...)` to:

```ts
  it('flips the AsyncStorage flag on happy path', async () => {
```

removing any `expect(mockSaveSession)...` assertions from its body while keeping the `mockSetItem` assertion.

In `describe('disable', ...)`, delete `it('clears SecureStore and removes the AsyncStorage flag', ...)`'s SecureStore assertions (keep the `mockRemoveItem` one) and delete `it('resolves even if clearSession rejects', ...)` entirely.

- [ ] **Step 8: Trim `capability.test.ts`**

Delete the whole `describe('supportedTypes', ...)` block (6 cases). Leave `isSupported` and `promptBiometric` untouched.

- [ ] **Step 9: Run all biometric tests and typecheck**

Run: `npx jest src/__tests__/biometricStore.test.ts src/__tests__/auth/biometric --watchman=false --runInBand --forceExit`
Expected: PASS, all suites.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add -A src/lib/auth/biometric src/store/biometricStore.ts src/__tests__/biometricStore.test.ts src/__tests__/auth/biometric
git commit -m "refactor(auth): collapse biometric lib to the app-lock model (#73)

enrollment.ts drops to enable/disable — no session tokens read or written.
Deletes storage.ts (SecureStore slot), attemptUnlock, persistCurrentSession,
justSignedOut, the unused capability.supportedTypes, and the zero-consumer
barrel. Store gains locked/resolved, resolved once per launch and one-way to
unlocked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: LockScreen component

**Files:**
- Create: `src/components/auth/LockScreen.tsx`
- Create: `src/__tests__/components/auth/lockScreen.test.tsx`

**Interfaces:**
- Consumes: `isSupported`, `promptBiometric` from `@/lib/auth/biometric/capability`; `useBiometricStore`'s `unlock()` and `disable()` from Task 2; `useAuthStore`'s `signOut()`.
- Produces: `export function LockScreen(): JSX.Element` from `@/components/auth/LockScreen`, taking no props. Task 4 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/auth/lockScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockIsSupported = jest.fn();
const mockPromptBiometric = jest.fn();
const mockUnlock = jest.fn();
const mockDisable = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
  promptBiometric: (reason: string) => mockPromptBiometric(reason),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('@/store/biometricStore', () => {
  const stableUnlock = () => mockUnlock();
  const stableDisable = () => mockDisable();
  return {
    __esModule: true,
    useBiometricStore: (
      selector: (s: { unlock: () => void; disable: () => Promise<void> }) => unknown,
    ) => selector({ unlock: stableUnlock, disable: stableDisable }),
  };
});

jest.mock('@/store/authStore', () => {
  const stableSignOut = () => mockSignOut();
  return {
    __esModule: true,
    useAuthStore: (selector: (s: { signOut: () => Promise<void> }) => unknown) =>
      selector({ signOut: stableSignOut }),
  };
});

import { LockScreen } from '@/components/auth/LockScreen';

describe('LockScreen', () => {
  beforeEach(() => {
    mockIsSupported.mockReset().mockResolvedValue(true);
    mockPromptBiometric.mockReset().mockResolvedValue({ ok: true });
    mockUnlock.mockReset();
    mockDisable.mockReset();
    mockSignOut.mockReset();
  });

  it('prompts exactly once on mount', async () => {
    render(<LockScreen />);
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(1));
  });

  it('calls unlock() when the prompt succeeds', async () => {
    render(<LockScreen />);
    await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
  });

  it('stays locked and offers retry + sign out when the prompt is cancelled', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    expect(mockUnlock).not.toHaveBeenCalled();
    expect(getByText('Unlock with Face ID')).toBeTruthy();
    expect(getByText('Sign out')).toBeTruthy();
  });

  it('names the lockout when the OS locks biometrics out', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'lockout' });
    const { findByText } = render(<LockScreen />);
    await findByText(/Too many attempts/i);
  });

  it('re-prompts when retry is pressed', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    await act(async () => {
      fireEvent.press(getByText('Unlock with Face ID'));
    });
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(2));
  });

  it('does not stack prompts when retry is pressed while one is in flight', async () => {
    // Never-resolving prompt: the mount attempt stays in flight.
    mockPromptBiometric.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<LockScreen />);
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.press(getByText('Unlock with Face ID'));
      fireEvent.press(getByText('Unlock with Face ID'));
    });
    expect(mockPromptBiometric).toHaveBeenCalledTimes(1);
  });

  it('disables and unlocks when biometrics are no longer available', async () => {
    mockIsSupported.mockResolvedValue(false);
    render(<LockScreen />);
    await waitFor(() => expect(mockDisable).toHaveBeenCalled());
    await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('signs out when the escape is pressed', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    await act(async () => {
      fireEvent.press(getByText('Sign out'));
    });
    expect(mockSignOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/components/auth/lockScreen.test.tsx --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/components/auth/LockScreen'`.

- [ ] **Step 3: Write the component**

Create `src/components/auth/LockScreen.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';
import { useAuthStore } from '@/store/authStore';
import { useA11yAnnounce } from '@/lib/a11y';

const CANCELLED = 'Face ID cancelled. Try again, or sign out to use your password.';
const LOCKED_OUT = 'Too many attempts. Sign out and use your password.';

export function LockScreen() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const unlock = useBiometricStore((s) => s.unlock);
  const disable = useBiometricStore((s) => s.disable);
  const signOut = useAuthStore((s) => s.signOut);

  const [status, setStatus] = useState<string | null>(null);
  // Guards against stacked system sheets: a second authenticateAsync while one
  // is pending kills the first with system_cancel, which the capability layer
  // maps to 'cancel' and swallows. Observed live while verifying #73.
  const inFlight = useRef(false);
  useA11yAnnounce(status);

  const attempt = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (!(await isSupported())) {
        // Face ID was disabled or re-enrolled in iOS Settings, so the stored
        // preference can never be satisfied again. Clear it and let the user
        // through rather than trapping them behind a prompt that always fails.
        // Not a bypass: changing Face ID enrollment requires the device passcode.
        await disable();
        unlock();
        return;
      }
      const r = await promptBiometric('Unlock Fantasy Gaffer');
      if (r.ok) {
        unlock();
        return;
      }
      setStatus(r.error === 'lockout' ? LOCKED_OUT : CANCELLED);
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    attempt();
    // Mount-only: the lock is resolved once per launch, and retry is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <GafferLogo size={46} light={dark} variant="wordmark" />
      <Text style={[styles.title, { color: t.text }]}>Locked</Text>
      <Text style={[styles.subtitle, { color: t.textMuted }]}>
        Unlock with Face ID to continue.
      </Text>

      {status && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.status, { color: t.textMuted }]}
        >
          {status}
        </Text>
      )}

      <PillBtn
        variant="accent"
        onPress={attempt}
        accentInk={t.accentInk}
        style={styles.btn}
      >
        Unlock with Face ID
      </PillBtn>
      <PillBtn variant="ghost" onPress={signOut} textColor={t.textMuted} style={styles.btn}>
        Sign out
      </PillBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    gap: 12,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    marginTop: 20,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  status: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  btn: { width: '100%', height: 54 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/components/auth/lockScreen.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS, 8 tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/LockScreen.tsx src/__tests__/components/auth/lockScreen.test.tsx
git commit -m "feat(auth): add LockScreen with retry and sign-out escape (#73)

One attempt() behind an in-flight ref serves both the mount fire and retry,
closing the stacked-prompt defect by construction. An unavailable sensor
disables the setting and unlocks rather than trapping the user.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the lock into AppGate

**Files:**
- Modify: `src/app/_layout.tsx`
- Create: `src/__tests__/appGate.test.tsx`

**Interfaces:**
- Consumes: `LockScreen` from Task 3; `resolveLock`, `locked`, `hydrated` from Task 2's store.
- Produces: `export function AppGate({ fontsLoaded, themeHydrated, authHydrated }: { fontsLoaded: boolean; themeHydrated: boolean; authHydrated: boolean }): JSX.Element | null` — exported so the test can render it directly. The default export stays `wrap(RootLayout)`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/appGate.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

let mockLocked: boolean | null = null;
let mockBiometricHydrated = true;
const mockResolveLock = jest.fn();
let mockSession: object | null = { user: { id: 'u1' } };
let mockIsRestoring = false;

jest.mock('@tanstack/react-query', () => ({
  __esModule: true,
  useIsRestoring: () => mockIsRestoring,
}));

jest.mock('expo-splash-screen', () => ({
  __esModule: true,
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    { Screen: () => null },
  ),
  useNavigationContainerRef: () => ({}),
}));

jest.mock('expo-status-bar', () => ({ __esModule: true, StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/analytics/provider', () => ({
  __esModule: true,
  AnalyticsProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useScreenTracking: () => {},
}));

jest.mock('@/components/auth/LockScreen', () => ({
  __esModule: true,
  LockScreen: () => <Text>LOCK_SCREEN</Text>,
}));

jest.mock('@/components/OfflineBanner', () => ({
  __esModule: true,
  OfflineBanner: () => <Text>OFFLINE_BANNER</Text>,
}));

jest.mock('@/lib/auth/authErrorBoundary', () => ({
  __esModule: true,
  AuthErrorBoundary: () => null,
}));

jest.mock('@/lib/auth/authCacheClear', () => ({
  __esModule: true,
  AuthCacheClear: () => null,
}));

jest.mock('@/lib/auth/deepLink', () => ({
  __esModule: true,
  useEmailAuthDeepLinks: () => {},
}));

jest.mock('@/lib/notifications/useNotificationDeepLinks', () => ({
  __esModule: true,
  useNotificationDeepLinks: () => {},
}));

jest.mock('@/lib/monitoring/sentry', () => ({
  __esModule: true,
  wrap: (c: unknown) => c,
  navigationIntegration: { registerNavigationContainer: jest.fn() },
}));

jest.mock('@/lib/notifications/handler', () => ({ __esModule: true }));
jest.mock('@/lib/reactQueryFocus', () => ({ __esModule: true }));
jest.mock('@/lib/query/onlineManager', () => ({ __esModule: true }));

jest.mock('@/store/biometricStore', () => {
  const stableResolveLock = (hasSession: boolean) => mockResolveLock(hasSession);
  return {
    __esModule: true,
    useBiometricStore: (
      selector: (s: {
        hydrated: boolean;
        locked: boolean | null;
        resolveLock: (hasSession: boolean) => void;
      }) => unknown,
    ) =>
      selector({
        hydrated: mockBiometricHydrated,
        locked: mockLocked,
        resolveLock: stableResolveLock,
      }),
  };
});

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: object | null }) => unknown) =>
    selector({ session: mockSession }),
}));

import { AppGate } from '@/app/_layout';

const READY = { fontsLoaded: true, themeHydrated: true, authHydrated: true };

describe('AppGate — biometric lock', () => {
  beforeEach(() => {
    mockResolveLock.mockReset();
    mockLocked = null;
    mockBiometricHydrated = true;
    mockSession = { user: { id: 'u1' } };
    mockIsRestoring = false;
  });

  it('renders nothing while the lock verdict is undecided', () => {
    mockLocked = null;
    const { queryByText } = render(<AppGate {...READY} />);
    expect(queryByText('LOCK_SCREEN')).toBeNull();
    expect(queryByText('OFFLINE_BANNER')).toBeNull();
  });

  it('resolves the lock once ready, passing whether a session exists', () => {
    render(<AppGate {...READY} />);
    expect(mockResolveLock).toHaveBeenCalledWith(true);
  });

  it('does not resolve the lock before the biometric store has hydrated', () => {
    mockBiometricHydrated = false;
    render(<AppGate {...READY} />);
    expect(mockResolveLock).not.toHaveBeenCalled();
  });

  it('renders the LockScreen when locked', () => {
    mockLocked = true;
    const { getByText, queryByText } = render(<AppGate {...READY} />);
    expect(getByText('LOCK_SCREEN')).toBeTruthy();
    // Nothing behind the lock mounts.
    expect(queryByText('OFFLINE_BANNER')).toBeNull();
  });

  it('renders the app tree when unlocked', () => {
    mockLocked = false;
    const { getByText, queryByText } = render(<AppGate {...READY} />);
    expect(getByText('OFFLINE_BANNER')).toBeTruthy();
    expect(queryByText('LOCK_SCREEN')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/appGate.test.tsx --watchman=false --runInBand --forceExit`
Expected: FAIL — `AppGate` is not exported from `@/app/_layout`.

- [ ] **Step 3: Wire the gate in `_layout.tsx`**

Add these imports alongside the existing ones:

```ts
import { useBiometricStore } from '@/store/biometricStore';
import { LockScreen } from '@/components/auth/LockScreen';
```

Replace the whole `AppGate` function with:

```tsx
export function AppGate({
  fontsLoaded,
  themeHydrated,
  authHydrated,
}: {
  fontsLoaded: boolean;
  themeHydrated: boolean;
  authHydrated: boolean;
}) {
  // Hold the splash until the persisted cache has rehydrated, so the first paint
  // already has data — no spinner flash when the cache is fresh.
  const isRestoring = useIsRestoring();
  const biometricHydrated = useBiometricStore((s) => s.hydrated);
  const locked = useBiometricStore((s) => s.locked);
  const resolveLock = useBiometricStore((s) => s.resolveLock);
  const session = useAuthStore((s) => s.session);
  const ready =
    fontsLoaded && themeHydrated && authHydrated && biometricHydrated && !isRestoring;

  // Resolve the lock exactly once per launch. resolveLock itself is idempotent,
  // so re-runs from a later session change are no-ops.
  useEffect(() => {
    if (ready) resolveLock(!!session);
  }, [ready, session, resolveLock]);

  // Keep the splash up until the verdict is in, so no frame shows app content
  // behind an unresolved lock.
  useEffect(() => {
    if (ready && locked !== null) SplashScreen.hideAsync();
  }, [ready, locked]);

  if (!ready || locked === null) return null;

  return (
    <AnalyticsProvider>
      <AuthErrorBoundary />
      <AuthCacheClear />
      <SafeAreaProvider>
        <StatusBar style="light" />
        {locked ? (
          <LockScreen />
        ) : (
          <>
            <OfflineBanner />
            <Stack screenOptions={{ headerShown: false }}>
              {/* Legal screens are reached from the Settings modal ((home) stack)
                  and the signup screen. As root-level cards they render BEHIND the
                  Settings native modal on iOS; present them as modals so they
                  appear above it. Other routes auto-register with defaults. */}
              <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
              <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
            </Stack>
          </>
        )}
      </SafeAreaProvider>
    </AnalyticsProvider>
  );
}
```

The providers stay mounted while locked (so Sentry, analytics and the auth error boundary keep working) but the `<Stack>` does not — which is what keeps every route and its queries from mounting behind the lock.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/appGate.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest --watchman=false --runInBand --forceExit`
Expected: PASS. If `navIdentity.test.tsx` or `onboardingLayout.test.tsx` fails with an `RCTAsyncStorage` error, it is rendering the real root layout, which now transitively imports `@/store/biometricStore` → `@/lib/supabase`. Fix by adding to that test file:

```ts
jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (
    selector: (s: {
      hydrated: boolean;
      locked: boolean | null;
      resolveLock: (hasSession: boolean) => void;
    }) => unknown,
  ) => selector({ hydrated: true, locked: false, resolveLock: () => {} }),
}));
```

This is the documented `@/api/*`-import gotcha in `CLAUDE.md`, same class as the `TabCoachmark` fix in #49.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/_layout.tsx src/__tests__/appGate.test.tsx
git commit -m "feat(auth): gate the app tree behind the biometric lock (#73)

AppGate resolves the lock once per launch and renders LockScreen in place of
the Stack when locked, so no route or query mounts behind it. Splash is held
until the verdict is in, so no frame leaks app content.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Settings copy and docs

**Files:**
- Modify: `src/components/settings/BiometricCard.tsx`
- Modify: `src/__tests__/settingsScreen.test.tsx` (only if it asserts the changed sub-label)
- Modify: `docs/auth-biometric.md`
- Modify: `docs/e2e.md`

> **Decision (2026-07-25, pre-flight):** the planned `e2e/flows/biometric-lock.yaml` is **NOT** created.
> Enabling the toggle requires a *satisfied* Face ID prompt, which Maestro cannot produce, so on relaunch
> `enabled` is still false, no lock appears, and the flow's `assertVisible: "Locked"` fails. It could never
> pass in the committed suite. The lock gate is unit-tested only; `docs/e2e.md` records why. Do not create
> the flow file.

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: no new code interfaces.

- [ ] **Step 1: Update the Settings card copy**

In `src/components/settings/BiometricCard.tsx`, the sub-label currently describes session sign-in. Replace:

```tsx
            <Text style={[styles.sub, { color: tk.faint }]}>
              {enabled ? 'Biometric sign-in is on' : 'Use password to sign in'}
            </Text>
```

with:

```tsx
            <Text style={[styles.sub, { color: tk.faint }]}>
              {enabled ? 'Face ID required to open the app' : 'App opens without Face ID'}
            </Text>
```

- [ ] **Step 2: Update the settings test if it asserts that copy**

Run: `npx jest src/__tests__/settingsScreen.test.tsx --watchman=false --runInBand --forceExit`

If it fails on `Biometric sign-in is on` / `Use password to sign in`, update those expectations to the new strings. If it passes, change nothing.

- [ ] **Step 3: Rewrite `docs/auth-biometric.md`**

The document currently describes the signed-out-restore model across its `### Enrollment (via the SignIn checkbox)`, `### Auto-unlock (next launch, signed-out scenario)`, `### Sign-out` and `### Auto-unlock failure → fallback` sections. Rewrite the runtime half so it describes:

- Enrollment happens only via the Settings toggle (`enable()` → prompt → AsyncStorage flag).
- On cold start `AppGate` calls `resolveLock(!!session)`; `locked = enabled && hasSession`, resolved once, one-way to unlocked.
- `LockScreen` prompts on mount, offers retry and a sign-out escape, and disables + unlocks when `isSupported()` is false.
- `SIGNED_OUT` clears `locked`. `SIGNED_IN` is deliberately NOT used (restore/foreground/refresh all emit it).
- Under `## Files`, remove `storage.ts` and `index.ts`, add `src/components/auth/LockScreen.tsx`.

Add a short section recording why the old model was abandoned, pointing at the spec:

```markdown
## Why this is a lock, not a session restore

The original design (`docs/superpowers/specs/2026-06-09-biometric-unlock-design.md`) stored the session in
SecureStore and replayed it via `setSession` after sign-out. Verification for #73 proved that unreachable:
**any** sign-out revokes the session server-side, including `scope: 'local'` — GoTrue returns
`403 Session from session_id claim in JWT does not exist` for the stored access token, and `400` for the
refresh token. See `docs/superpowers/specs/2026-07-25-biometric-app-lock-design.md`.
```

- [ ] **Step 4: Record the E2E coverage gap in `docs/e2e.md`**

Do NOT create an E2E flow for the lock gate. Add this to `docs/e2e.md`, in or adjacent to its section on
what the suite covers:

```markdown
### Not covered: the biometric app-lock (#73)

Maestro cannot drive the system Face ID sheet — it is a separate system window, and the simulator renders
it with no Cancel affordance, so a non-matching face leaves it up indefinitely. Enabling the lock in
Settings requires a *satisfied* prompt, so no unattended flow can even reach the locked state: `enabled`
stays false and the app never locks.

The lock gate is therefore **unit-tested only** (`src/__tests__/appGate.test.tsx`,
`src/__tests__/components/auth/lockScreen.test.tsx`, `src/__tests__/biometricStore.test.ts`). The Face ID
success, cancel and lockout paths need a manual on-device pass — see the acceptance-criteria table in
`docs/superpowers/specs/2026-07-25-biometric-app-lock-design.md`.
```

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest --watchman=false --runInBand --forceExit`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run lint`
Expected: no errors. Note this auto-generates an untracked `eslint.config.js` — do not commit it.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/BiometricCard.tsx docs/auth-biometric.md docs/e2e.md
git add src/__tests__/settingsScreen.test.tsx 2>/dev/null || true
git commit -m "docs(auth): retarget biometric docs and copy at the app-lock model (#73)

Settings copy now describes opening the app, not signing in. auth-biometric.md
records why the session-restore model was abandoned; e2e.md records why the
lock gate is unit-tested only (Maestro cannot drive the system Face ID sheet).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation

- [ ] **Update `CLAUDE.md`** — the Architecture section has no biometric bullet today, but Phase 5's `#73` line says "verify biometric on dev build … just needs the manual on-device walkthrough". Replace it with the outcome: verification found the session-restore model unreachable, the feature was re-scoped to an app-lock, and what remains is an on-device pass of the Face ID success/cancel/lockout paths.
- [ ] **Comment on #73** with the implementation outcome and the rewritten manual test plan (spec's acceptance-criteria table).
- [ ] **Leave #73 open** — its remaining scope is the on-device pass, which still needs an Apple Developer account for a physical dev build. Retag `[Season-Gated]`-style as `[Blocked — paid Apple account]` if that convention fits.
