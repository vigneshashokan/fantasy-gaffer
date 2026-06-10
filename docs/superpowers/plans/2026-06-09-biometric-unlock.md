# Biometric Session Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Face ID / Touch ID unlock to the existing SignIn screen and Profile toggle stubs — closing issue #18 — using `expo-local-authentication` + `expo-secure-store` around the existing Supabase Auth session.

**Architecture:** A self-contained library at `src/lib/auth/biometric/` (capability checks, single-slot SecureStore wrapper, enrollment orchestration) backed by a new `useBiometricStore` Zustand store. The store subscribes to `supabase.auth.onAuthStateChange` to keep the stored refresh token fresh on `TOKEN_REFRESHED` and to flip a `justSignedOut` flag on `SIGNED_OUT` so SignIn's auto-unlock skips for one cycle after an explicit sign-out. Unlock calls `supabase.auth.setSession(...)` with the stored tokens; failure cleans up and falls back to password. Single user per device.

**Tech Stack:** `expo-local-authentication` (biometric prompt + capability), `expo-secure-store` (encrypted session storage), Supabase Auth (`setSession`, `getSession`, `onAuthStateChange`), Zustand (new `useBiometricStore`), AsyncStorage (preference flag).

**Spec:** `docs/superpowers/specs/2026-06-09-biometric-unlock-design.md`

---

## File Map

| Path | Purpose | Status |
|---|---|---|
| `src/lib/auth/biometric/capability.ts` | `isSupported()`, `supportedTypes()`, `promptBiometric(reason)` | NEW |
| `src/lib/auth/biometric/storage.ts` | `saveSession`, `loadSession`, `clearSession` (single SecureStore slot) | NEW |
| `src/lib/auth/biometric/enrollment.ts` | `enable`, `disable`, `attemptUnlock`, `persistCurrentSession` + `BiometricErrorKind` + `Result<T>` | NEW |
| `src/lib/auth/biometric/index.ts` | Re-exports | NEW |
| `src/store/biometricStore.ts` | Zustand store: `enabled`, `hydrated`, `justSignedOut`, actions | NEW |
| `src/components/forms/Checkbox.tsx` | Themed checkbox primitive | NEW |
| `src/app/(onboarding)/signin.tsx` | Remove Face ID button block; add Checkbox + enrollment hook; auto-unlock effect; expired-link banner | EDIT |
| `src/app/(home)/profile.tsx` | Wire Face ID `ToggleRow` to `useBiometricStore`; hide when unsupported | EDIT |
| `package.json` | Add `expo-local-authentication`, `expo-secure-store` | EDIT |
| `docs/auth-biometric.md` | Runtime + manual setup docs (mirrors `docs/auth-email-password.md`) | NEW |
| `src/__tests__/auth/biometric/capability.test.ts` | Capability wrapper tests | NEW |
| `src/__tests__/auth/biometric/storage.test.ts` | SecureStore round-trip tests | NEW |
| `src/__tests__/auth/biometric/enrollment.test.ts` | Orchestration tests | NEW |
| `src/__tests__/biometricStore.test.ts` | Store hydration + onAuthStateChange tests | NEW |
| `src/__tests__/profileScreen.test.tsx` | Face ID row visibility + toggle behavior | NEW |
| `src/__tests__/signinScreen.test.tsx` | Extended with checkbox, enrollment, auto-unlock, banner cases | EDIT |

---

## Conventions

- Working directory for every command: `/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app`.
- Run `npm test -- --watchAll=false` for the full suite. Use `-t '<name>'` for targeting.
- Mock pattern: jest factory mocks at the top of each test file. For `@/lib/supabase` and other internal modules, prefix variables referenced inside the factory with `mock` (jest's babel-jest hoisting requirement — same gotcha we hit on the email/password feature).
- Path alias: `@/...` → `<rootDir>/src/...` (configured in `package.json` `moduleNameMapper`).
- All commits go to `feat/biometric-unlock` (already checked out).
- Commit messages follow imperative style ("Add X", "Wire Y to Z").

---

## Task 1: Install `expo-local-authentication` + `expo-secure-store`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install both via expo install**

```bash
npx expo install expo-local-authentication expo-secure-store
```

Expected: both added under `dependencies` at versions compatible with Expo SDK 54. No new peer-dep warnings beyond the pre-existing Node engine warnings unrelated to this feature.

- [ ] **Step 2: Verify both modules resolve**

```bash
node -e "console.log(typeof require.resolve('expo-local-authentication'), typeof require.resolve('expo-secure-store'))"
```

Expected: `string string`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add expo-local-authentication + expo-secure-store for biometric unlock"
```

---

## Task 2: Capability wrapper (`src/lib/auth/biometric/capability.ts`)

**Files:**
- Create: `src/lib/auth/biometric/capability.ts`
- Test: `src/__tests__/auth/biometric/capability.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/biometric/capability.test.ts`:

```ts
const mockHasHardware = jest.fn();
const mockIsEnrolled = jest.fn();
const mockSupportedTypes = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('expo-local-authentication', () => ({
  __esModule: true,
  hasHardwareAsync: () => mockHasHardware(),
  isEnrolledAsync: () => mockIsEnrolled(),
  supportedAuthenticationTypesAsync: () => mockSupportedTypes(),
  authenticateAsync: (opts: unknown) => mockAuthenticate(opts),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

import {
  isSupported,
  supportedTypes,
  promptBiometric,
} from '@/lib/auth/biometric/capability';

describe('isSupported', () => {
  beforeEach(() => {
    mockHasHardware.mockReset();
    mockIsEnrolled.mockReset();
  });

  it('returns true when hardware present and enrolled', async () => {
    mockHasHardware.mockResolvedValueOnce(true);
    mockIsEnrolled.mockResolvedValueOnce(true);
    expect(await isSupported()).toBe(true);
  });

  it('returns false when hardware absent', async () => {
    mockHasHardware.mockResolvedValueOnce(false);
    mockIsEnrolled.mockResolvedValueOnce(true);
    expect(await isSupported()).toBe(false);
  });

  it('returns false when hardware present but no enrollment', async () => {
    mockHasHardware.mockResolvedValueOnce(true);
    mockIsEnrolled.mockResolvedValueOnce(false);
    expect(await isSupported()).toBe(false);
  });

  it('returns false when the OS call throws', async () => {
    mockHasHardware.mockRejectedValueOnce(new Error('boom'));
    expect(await isSupported()).toBe(false);
  });
});

describe('supportedTypes', () => {
  beforeEach(() => {
    mockSupportedTypes.mockReset();
  });

  it('maps FACIAL_RECOGNITION (2) to "face"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([2]);
    expect(await supportedTypes()).toEqual(['face']);
  });

  it('maps FINGERPRINT (1) to "fingerprint"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([1]);
    expect(await supportedTypes()).toEqual(['fingerprint']);
  });

  it('maps IRIS (3) to "iris"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([3]);
    expect(await supportedTypes()).toEqual(['iris']);
  });

  it('maps multiple types in order', async () => {
    mockSupportedTypes.mockResolvedValueOnce([1, 2]);
    expect(await supportedTypes()).toEqual(['fingerprint', 'face']);
  });

  it('returns [] when the OS call throws', async () => {
    mockSupportedTypes.mockRejectedValueOnce(new Error('boom'));
    expect(await supportedTypes()).toEqual([]);
  });
});

describe('promptBiometric', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
  });

  it('passes promptMessage and fallback label to authenticateAsync', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: true });
    await promptBiometric('Unlock FPL Gaffer with Face ID');
    expect(mockAuthenticate).toHaveBeenCalledWith({
      promptMessage: 'Unlock FPL Gaffer with Face ID',
      fallbackLabel: 'Use password',
      disableDeviceFallback: true,
    });
  });

  it('returns ok on success', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: true });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: true });
  });

  it('maps user_cancel error to cancel', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'cancel' });
  });

  it('maps system_cancel error to cancel', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'system_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'cancel' });
  });

  it('maps lockout error to lockout', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'lockout' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'lockout' });
  });

  it('maps unknown errors to unknown', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'app_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });

  it('maps thrown errors to unknown', async () => {
    mockAuthenticate.mockRejectedValueOnce(new Error('boom'));
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/capability.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/biometric/capability'`.

- [ ] **Step 3: Implement the wrapper**

Create `src/lib/auth/biometric/capability.ts`:

```ts
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricKind = 'face' | 'fingerprint' | 'iris';

export type PromptResult =
  | { ok: true }
  | { ok: false; error: 'cancel' | 'lockout' | 'unknown' };

export async function isSupported(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

export async function supportedTypes(): Promise<BiometricKind[]> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const out: BiometricKind[] = [];
    for (const t of types) {
      if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) out.push('face');
      else if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) out.push('fingerprint');
      else if (t === LocalAuthentication.AuthenticationType.IRIS) out.push('iris');
    }
    return out;
  } catch {
    return [];
  }
}

export async function promptBiometric(reason: string): Promise<PromptResult> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use password',
      disableDeviceFallback: true,
    });
    if (r.success) return { ok: true };
    if (r.error === 'user_cancel' || r.error === 'system_cancel') {
      return { ok: false, error: 'cancel' };
    }
    if (r.error === 'lockout') return { ok: false, error: 'lockout' };
    return { ok: false, error: 'unknown' };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/capability.test.ts
```

Expected: all green (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/biometric/capability.ts src/__tests__/auth/biometric/capability.test.ts
git commit -m "Add biometric capability wrapper around expo-local-authentication"
```

---

## Task 3: Storage wrapper (`src/lib/auth/biometric/storage.ts`)

**Files:**
- Create: `src/lib/auth/biometric/storage.ts`
- Test: `src/__tests__/auth/biometric/storage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/biometric/storage.test.ts`:

```ts
const mockSetItem = jest.fn();
const mockGetItem = jest.fn();
const mockDeleteItem = jest.fn();

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: (k: string, v: string) => mockSetItem(k, v),
  getItemAsync: (k: string) => mockGetItem(k),
  deleteItemAsync: (k: string) => mockDeleteItem(k),
}));

import {
  saveSession,
  loadSession,
  clearSession,
} from '@/lib/auth/biometric/storage';

const SLOT = 'fpl_gaffer_biometric_session';

describe('saveSession', () => {
  beforeEach(() => {
    mockSetItem.mockReset();
  });

  it('writes a JSON-serialised session to the single slot', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveSession({ access_token: 'a', refresh_token: 'r', user_id: 'u1' });
    expect(mockSetItem).toHaveBeenCalledWith(
      SLOT,
      JSON.stringify({ access_token: 'a', refresh_token: 'r', user_id: 'u1' }),
    );
  });
});

describe('loadSession', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
  });

  it('returns parsed payload when slot is populated', async () => {
    mockGetItem.mockResolvedValueOnce(
      JSON.stringify({ access_token: 'a', refresh_token: 'r', user_id: 'u1' }),
    );
    expect(await loadSession()).toEqual({
      access_token: 'a',
      refresh_token: 'r',
      user_id: 'u1',
    });
  });

  it('returns null when slot is empty', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    expect(await loadSession()).toBeNull();
  });

  it('returns null when stored value is not valid JSON', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{');
    expect(await loadSession()).toBeNull();
  });

  it('returns null when parsed value is missing required fields', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({ access_token: 'a' }));
    expect(await loadSession()).toBeNull();
  });

  it('returns null when SecureStore throws', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('boom'));
    expect(await loadSession()).toBeNull();
  });
});

describe('clearSession', () => {
  beforeEach(() => {
    mockDeleteItem.mockReset();
  });

  it('deletes the slot', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);
    await clearSession();
    expect(mockDeleteItem).toHaveBeenCalledWith(SLOT);
  });

  it('does not throw when SecureStore rejects', async () => {
    mockDeleteItem.mockRejectedValueOnce(new Error('boom'));
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/storage.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/biometric/storage'`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/biometric/storage.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

const SLOT = 'fpl_gaffer_biometric_session';

export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SLOT, JSON.stringify(s));
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SLOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.access_token !== 'string' ||
      typeof parsed?.refresh_token !== 'string' ||
      typeof parsed?.user_id !== 'string'
    ) {
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SLOT);
  } catch {
    /* swallow — clearing is best-effort */
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/storage.test.ts
```

Expected: all green (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/biometric/storage.ts src/__tests__/auth/biometric/storage.test.ts
git commit -m "Add biometric session storage wrapper around expo-secure-store"
```

---

## Task 4: `enable()` and shared types (`src/lib/auth/biometric/enrollment.ts`)

**Files:**
- Create: `src/lib/auth/biometric/enrollment.ts`
- Test: `src/__tests__/auth/biometric/enrollment.test.ts`

This task introduces `BiometricErrorKind` and the `Result<T>` type used across the rest of `enrollment.ts`. Subsequent tasks (Tasks 5–7) append to the same file.

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/biometric/enrollment.test.ts`:

```ts
const mockIsSupported = jest.fn();
const mockPromptBiometric = jest.fn();
const mockGetSession = jest.fn();
const mockSaveSession = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
  promptBiometric: (reason: string) => mockPromptBiometric(reason),
}));

jest.mock('@/lib/auth/biometric/storage', () => ({
  __esModule: true,
  saveSession: (s: unknown) => mockSaveSession(s),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: (k: string, v: string) => mockSetItem(k, v),
  },
}));

import { enable } from '@/lib/auth/biometric/enrollment';

describe('enable', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockPromptBiometric.mockReset();
    mockGetSession.mockReset();
    mockSaveSession.mockReset();
    mockSetItem.mockReset();
  });

  it('returns unsupported when device cannot do biometrics', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unsupported');
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('returns cancel when user dismisses the prompt', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('cancel');
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('returns no_session when supabase has no active session', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_session');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('saves session to storage and flips the AsyncStorage flag on happy path', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'aaa',
          refresh_token: 'rrr',
          user: { id: 'u1' },
        },
      },
      error: null,
    });
    mockSaveSession.mockResolvedValueOnce(undefined);
    mockSetItem.mockResolvedValueOnce(undefined);
    const r = await enable();
    expect(r.ok).toBe(true);
    expect(mockSaveSession).toHaveBeenCalledWith({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
    expect(mockSetItem).toHaveBeenCalledWith('biometric_enabled', 'true');
  });

  it('passes "Confirm Face ID to enable" as the prompt reason', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    await enable();
    expect(mockPromptBiometric).toHaveBeenCalledWith('Confirm Face ID to enable');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/biometric/enrollment'`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/biometric/enrollment.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { isSupported, promptBiometric } from '@/lib/auth/biometric/capability';
import { saveSession } from '@/lib/auth/biometric/storage';

export type BiometricErrorKind =
  | 'cancel'
  | 'lockout'
  | 'expired_link'
  | 'no_session'
  | 'unsupported'
  | 'unknown';

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
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return { ok: false, error: 'no_session' };
  }
  const s = data.session;
  await saveSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    user_id: s.user.id,
  });
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts
```

Expected: all green (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/biometric/enrollment.ts src/__tests__/auth/biometric/enrollment.test.ts
git commit -m "Add biometric enable() with capability + prompt + storage orchestration"
```

---

## Task 5: `disable()`

**Files:**
- Modify: `src/lib/auth/biometric/enrollment.ts`
- Modify: `src/__tests__/auth/biometric/enrollment.test.ts`

- [ ] **Step 1: Extend test mocks and append failing tests**

In `src/__tests__/auth/biometric/enrollment.test.ts`:

(A) Add `mockClearSession` to the consts at the top:
```ts
const mockClearSession = jest.fn();
const mockRemoveItem = jest.fn();
```

(B) Extend the existing `jest.mock('@/lib/auth/biometric/storage', …)` block to include `clearSession`:
```ts
jest.mock('@/lib/auth/biometric/storage', () => ({
  __esModule: true,
  saveSession: (s: unknown) => mockSaveSession(s),
  clearSession: () => mockClearSession(),
}));
```

(C) Extend the existing `jest.mock('@react-native-async-storage/async-storage', …)` block to include `removeItem`:
```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: (k: string, v: string) => mockSetItem(k, v),
    removeItem: (k: string) => mockRemoveItem(k),
  },
}));
```

(D) Add `disable` to the import: `import { enable, disable } from '@/lib/auth/biometric/enrollment';`

(E) Append the new describe block at the bottom:

```ts
describe('disable', () => {
  beforeEach(() => {
    mockClearSession.mockReset();
    mockRemoveItem.mockReset();
  });

  it('clears SecureStore and removes the AsyncStorage flag', async () => {
    mockClearSession.mockResolvedValueOnce(undefined);
    mockRemoveItem.mockResolvedValueOnce(undefined);
    await disable();
    expect(mockClearSession).toHaveBeenCalled();
    expect(mockRemoveItem).toHaveBeenCalledWith('biometric_enabled');
  });

  it('resolves even if clearSession rejects', async () => {
    mockClearSession.mockRejectedValueOnce(new Error('boom'));
    mockRemoveItem.mockResolvedValueOnce(undefined);
    await expect(disable()).resolves.toBeUndefined();
  });

  it('resolves even if AsyncStorage.removeItem rejects', async () => {
    mockClearSession.mockResolvedValueOnce(undefined);
    mockRemoveItem.mockRejectedValueOnce(new Error('boom'));
    await expect(disable()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts -t 'disable'
```

Expected: FAIL — `disable is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth/biometric/enrollment.ts`:

```ts
import { clearSession } from '@/lib/auth/biometric/storage';

export async function disable(): Promise<void> {
  try {
    await clearSession();
  } catch {
    /* swallow */
  }
  try {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    /* swallow */
  }
}
```

Note: the import line for `clearSession` should be merged with the existing `from '@/lib/auth/biometric/storage'` import at the top of the file. After the merge it should read:

```ts
import { saveSession, clearSession } from '@/lib/auth/biometric/storage';
```

- [ ] **Step 4: Run all enrollment tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts
```

Expected: 8/8 passing (5 prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/biometric/enrollment.ts src/__tests__/auth/biometric/enrollment.test.ts
git commit -m "Add biometric disable() that clears stored session and flag"
```

---

## Task 6: `attemptUnlock()`

**Files:**
- Modify: `src/lib/auth/biometric/enrollment.ts`
- Modify: `src/__tests__/auth/biometric/enrollment.test.ts`

- [ ] **Step 1: Extend test mocks and append failing tests**

(A) Add `mockLoadSession` and `mockSetSession` to the consts at the top:
```ts
const mockLoadSession = jest.fn();
const mockSetSession = jest.fn();
```

(B) Extend the existing storage mock block to include `loadSession`:
```ts
jest.mock('@/lib/auth/biometric/storage', () => ({
  __esModule: true,
  saveSession: (s: unknown) => mockSaveSession(s),
  clearSession: () => mockClearSession(),
  loadSession: () => mockLoadSession(),
}));
```

(C) Extend the existing supabase mock block to include `setSession`:
```ts
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (args: unknown) => mockSetSession(args),
    },
  },
}));
```

(D) Extend the import: `import { enable, disable, attemptUnlock } from '@/lib/auth/biometric/enrollment';`

(E) Append the new describe block:

```ts
describe('attemptUnlock', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockPromptBiometric.mockReset();
    mockLoadSession.mockReset();
    mockSetSession.mockReset();
    mockClearSession.mockReset();
    mockRemoveItem.mockReset();
  });

  it('returns no_session when storage is empty', async () => {
    mockLoadSession.mockResolvedValueOnce(null);
    const r = await attemptUnlock();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_session');
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('passes "Unlock FPL Gaffer with Face ID" as the prompt reason', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'a',
      refresh_token: 'r',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    await attemptUnlock();
    expect(mockPromptBiometric).toHaveBeenCalledWith('Unlock FPL Gaffer with Face ID');
  });

  it('returns cancel without disabling when user cancels prompt', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'a',
      refresh_token: 'r',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const r = await attemptUnlock();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('cancel');
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('returns lockout without disabling when OS locks out biometric', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'a',
      refresh_token: 'r',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'lockout' });
    const r = await attemptUnlock();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('lockout');
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it('calls supabase.setSession with stored tokens on prompt success', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockSetSession.mockResolvedValueOnce({ data: { session: {} }, error: null });
    const r = await attemptUnlock();
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'aaa',
      refresh_token: 'rrr',
    });
    expect(r.ok).toBe(true);
  });

  it('disables AND returns expired_link when setSession rejects', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockSetSession.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid refresh token' },
    });
    mockClearSession.mockResolvedValueOnce(undefined);
    mockRemoveItem.mockResolvedValueOnce(undefined);
    const r = await attemptUnlock();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expired_link');
    expect(mockClearSession).toHaveBeenCalled();
    expect(mockRemoveItem).toHaveBeenCalledWith('biometric_enabled');
  });

  it('disables AND returns expired_link when setSession throws', async () => {
    mockLoadSession.mockResolvedValueOnce({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockSetSession.mockRejectedValueOnce(new Error('boom'));
    mockClearSession.mockResolvedValueOnce(undefined);
    mockRemoveItem.mockResolvedValueOnce(undefined);
    const r = await attemptUnlock();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expired_link');
    expect(mockClearSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts -t 'attemptUnlock'
```

Expected: FAIL — `attemptUnlock is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth/biometric/enrollment.ts`:

```ts
import { loadSession } from '@/lib/auth/biometric/storage';

export async function attemptUnlock(): Promise<Result> {
  const stored = await loadSession();
  if (!stored) return { ok: false, error: 'no_session' };

  const prompt = await promptBiometric('Unlock FPL Gaffer with Face ID');
  if (!prompt.ok) {
    if (prompt.error === 'lockout') return { ok: false, error: 'lockout' };
    return { ok: false, error: 'cancel' };
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      await disable();
      return { ok: false, error: 'expired_link' };
    }
    return { ok: true, value: undefined };
  } catch {
    await disable();
    return { ok: false, error: 'expired_link' };
  }
}
```

Merge the `loadSession` import with the existing storage import at the top of the file. After merge:

```ts
import { saveSession, loadSession, clearSession } from '@/lib/auth/biometric/storage';
```

- [ ] **Step 4: Run all enrollment tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts
```

Expected: 15/15 passing (8 prior + 7 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/biometric/enrollment.ts src/__tests__/auth/biometric/enrollment.test.ts
git commit -m "Add biometric attemptUnlock() with expired-token fallback"
```

---

## Task 7: `persistCurrentSession()`

**Files:**
- Modify: `src/lib/auth/biometric/enrollment.ts`
- Modify: `src/__tests__/auth/biometric/enrollment.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/auth/biometric/enrollment.test.ts`:

```ts
import { persistCurrentSession } from '@/lib/auth/biometric/enrollment';

describe('persistCurrentSession', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSaveSession.mockReset();
  });

  it('writes the current session to storage', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'aaa',
          refresh_token: 'rrr',
          user: { id: 'u1' },
        },
      },
      error: null,
    });
    mockSaveSession.mockResolvedValueOnce(undefined);
    await persistCurrentSession();
    expect(mockSaveSession).toHaveBeenCalledWith({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
  });

  it('silently no-ops when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await persistCurrentSession();
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('silently no-ops when getSession rejects', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('boom'));
    await expect(persistCurrentSession()).resolves.toBeUndefined();
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('silently no-ops when saveSession rejects', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'aaa',
          refresh_token: 'rrr',
          user: { id: 'u1' },
        },
      },
      error: null,
    });
    mockSaveSession.mockRejectedValueOnce(new Error('boom'));
    await expect(persistCurrentSession()).resolves.toBeUndefined();
  });
});
```

Extend the existing test-file import (from Task 6) to also include `persistCurrentSession`:

```ts
import {
  enable,
  disable,
  attemptUnlock,
  persistCurrentSession,
} from '@/lib/auth/biometric/enrollment';
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts -t 'persistCurrentSession'
```

Expected: FAIL — `persistCurrentSession is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth/biometric/enrollment.ts`:

```ts
export async function persistCurrentSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return;
    const s = data.session;
    await saveSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      user_id: s.user.id,
    });
  } catch {
    /* swallow */
  }
}
```

- [ ] **Step 4: Run all enrollment tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/biometric/enrollment.test.ts
```

Expected: 19/19 passing (15 prior + 4 new).

- [ ] **Step 5: Create the index file**

Create `src/lib/auth/biometric/index.ts`:

```ts
export {
  enable,
  disable,
  attemptUnlock,
  persistCurrentSession,
  BIOMETRIC_ENABLED_KEY,
} from './enrollment';
export type { BiometricErrorKind, Result } from './enrollment';
export { isSupported, supportedTypes } from './capability';
export type { BiometricKind } from './capability';
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/biometric/enrollment.ts src/lib/auth/biometric/index.ts src/__tests__/auth/biometric/enrollment.test.ts
git commit -m "Add biometric persistCurrentSession() for TOKEN_REFRESHED events"
```

---

## Task 8: `useBiometricStore` (`src/store/biometricStore.ts`)

**Files:**
- Create: `src/store/biometricStore.ts`
- Test: `src/__tests__/biometricStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/biometricStore.test.ts`:

```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockPersistCurrentSession = jest.fn();
let onAuthStateChangeCallback:
  | ((event: string, session: unknown) => void)
  | null = null;
const mockOnAuthStateChange = jest.fn((cb) => {
  onAuthStateChangeCallback = cb;
  return { data: { subscription: { unsubscribe: jest.fn() } } };
});

jest.mock('@/lib/auth/biometric/enrollment', () => ({
  __esModule: true,
  enable: () => mockEnable(),
  disable: () => mockDisable(),
  persistCurrentSession: () => mockPersistCurrentSession(),
  BIOMETRIC_ENABLED_KEY: 'biometric_enabled',
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        mockOnAuthStateChange(cb),
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

describe('useBiometricStore', () => {
  beforeEach(() => {
    jest.resetModules();
    onAuthStateChangeCallback = null;
    mockEnable.mockClear();
    mockDisable.mockClear();
    mockPersistCurrentSession.mockClear();
    mockOnAuthStateChange.mockClear();
    (AsyncStorage.getItem as jest.Mock).mockClear();
  });

  it('starts with enabled=false, hydrated=false, justSignedOut=false', () => {
    (AsyncStorage.getItem as jest.Mock).mockReturnValueOnce(
      new Promise(() => {}) as never,
    );
    const { useBiometricStore } = require('@/store/biometricStore');
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.hydrated).toBe(false);
    expect(s.justSignedOut).toBe(false);
  });

  it('hydrates from AsyncStorage with enabled=true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.hydrated).toBe(true);
  });

  it('hydrates with enabled=false when AsyncStorage is empty', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.hydrated).toBe(true);
  });

  it('flips enabled=true after enable() resolves ok', async () => {
    mockEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const r = await useBiometricStore.getState().enable();
    expect(r.ok).toBe(true);
    expect(useBiometricStore.getState().enabled).toBe(true);
  });

  it('leaves enabled=false when enable() resolves error', async () => {
    mockEnable.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const r = await useBiometricStore.getState().enable();
    expect(r.ok).toBe(false);
    expect(useBiometricStore.getState().enabled).toBe(false);
  });

  it('flips enabled=false after disable()', async () => {
    mockEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    mockDisable.mockResolvedValueOnce(undefined);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    await useBiometricStore.getState().disable();
    expect(useBiometricStore.getState().enabled).toBe(false);
  });

  it('calls persistCurrentSession on TOKEN_REFRESHED when enabled is true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(mockPersistCurrentSession).toHaveBeenCalled();
  });

  it('does NOT call persistCurrentSession on TOKEN_REFRESHED when enabled is false', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(mockPersistCurrentSession).not.toHaveBeenCalled();
  });

  it('sets justSignedOut=true on SIGNED_OUT', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('SIGNED_OUT', null);
    expect(useBiometricStore.getState().justSignedOut).toBe(true);
  });

  it('consumeJustSignedOut() flips the flag back to false', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('SIGNED_OUT', null);
    expect(useBiometricStore.getState().justSignedOut).toBe(true);
    useBiometricStore.getState().consumeJustSignedOut();
    expect(useBiometricStore.getState().justSignedOut).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/biometricStore.test.ts
```

Expected: FAIL — `Cannot find module '@/store/biometricStore'`.

- [ ] **Step 3: Implement**

Create `src/store/biometricStore.ts`:

```ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  enable as runEnable,
  disable as runDisable,
  persistCurrentSession,
  BIOMETRIC_ENABLED_KEY,
  type Result,
} from '@/lib/auth/biometric/enrollment';

interface BiometricState {
  enabled: boolean;
  hydrated: boolean;
  justSignedOut: boolean;
  enable: () => Promise<Result>;
  disable: () => Promise<void>;
  consumeJustSignedOut: () => void;
}

export const useBiometricStore = create<BiometricState>((set, get) => {
  // Initial hydration from AsyncStorage.
  AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)
    .then((v) => set({ enabled: v === 'true', hydrated: true }))
    .catch(() => set({ enabled: false, hydrated: true }));

  // Keep stored tokens fresh on refresh; flag justSignedOut on sign-out.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      set({ justSignedOut: true });
      return;
    }
    if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && get().enabled) {
      persistCurrentSession();
    }
  });

  return {
    enabled: false,
    hydrated: false,
    justSignedOut: false,
    enable: async () => {
      const r = await runEnable();
      if (r.ok) set({ enabled: true });
      return r;
    },
    disable: async () => {
      await runDisable();
      set({ enabled: false });
    },
    consumeJustSignedOut: () => set({ justSignedOut: false }),
  };
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/biometricStore.test.ts
```

Expected: 10/10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/store/biometricStore.ts src/__tests__/biometricStore.test.ts
git commit -m "Add useBiometricStore with hydration and onAuthStateChange listeners"
```

---

## Task 9: `Checkbox` component (`src/components/forms/Checkbox.tsx`)

**Files:**
- Create: `src/components/forms/Checkbox.tsx`
- Modify: `src/__tests__/components.test.tsx`

- [ ] **Step 1: Append failing tests**

Append a new describe block at the end of `src/__tests__/components.test.tsx`:

```tsx
import { Checkbox } from '@/components/forms/Checkbox';

describe('Checkbox', () => {
  it('renders label', () => {
    const { getByText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={false}
        onChange={() => {}}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    expect(getByText('Remember to use Face ID')).toBeTruthy();
  });

  it('shows checked state via accessibility', () => {
    const { getByLabelText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={true}
        onChange={() => {}}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    const node = getByLabelText('Remember to use Face ID');
    expect(node.props.accessibilityState?.checked).toBe(true);
  });

  it('calls onChange with the inverted value when pressed', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <Checkbox
        label="Remember to use Face ID"
        value={false}
        onChange={onChange}
        accent="#00B863"
        text="#23042B"
        textMuted="#74627E"
      />,
    );
    fireEvent.press(getByLabelText('Remember to use Face ID'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/components.test.tsx -t 'Checkbox'
```

Expected: FAIL — `Cannot find module '@/components/forms/Checkbox'`.

- [ ] **Step 3: Implement**

Create `src/components/forms/Checkbox.tsx`:

```tsx
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';

interface CheckboxProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  text: string;
  textMuted: string;
}

export function Checkbox({
  label,
  value,
  onChange,
  accent,
  text,
  textMuted,
}: CheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: value ? accent : textMuted,
            backgroundColor: value ? accent : 'transparent',
          },
        ]}
      >
        {value && <Icon name="check" color="#fff" size={14} />}
      </View>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/components.test.tsx -t 'Checkbox'
```

Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/Checkbox.tsx src/__tests__/components.test.tsx
git commit -m "Add Checkbox primitive used by the SignIn 'Remember Face ID' opt-in"
```

---

## Task 10: SignIn — remove Face ID button + add Checkbox + enrollment on signin

**Files:**
- Modify: `src/app/(onboarding)/signin.tsx`
- Modify: `src/__tests__/signinScreen.test.tsx`

This task handles the enrollment side. Task 11 handles the auto-unlock side.

- [ ] **Step 1: Extend signin test mocks and append failing tests**

In `src/__tests__/signinScreen.test.tsx`, add new mocks (alongside existing ones at the top):

```ts
const mockBiometricEnable = jest.fn();
const mockBiometricSupported = jest.fn();
let mockBiometricEnabled = false;
let mockBiometricHydrated = true;
let mockBiometricJustSignedOut = false;
const mockConsumeJustSignedOut = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockBiometricSupported(),
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (selector: (s: {
    enabled: boolean;
    hydrated: boolean;
    justSignedOut: boolean;
    enable: () => Promise<unknown>;
    consumeJustSignedOut: () => void;
  }) => unknown) =>
    selector({
      enabled: mockBiometricEnabled,
      hydrated: mockBiometricHydrated,
      justSignedOut: mockBiometricJustSignedOut,
      enable: () => mockBiometricEnable(),
      consumeJustSignedOut: () => mockConsumeJustSignedOut(),
    }),
}));
```

Reset these in the existing `beforeEach`:

```ts
beforeEach(() => {
  // …existing resets…
  mockBiometricEnable.mockReset();
  mockBiometricSupported.mockReset();
  mockConsumeJustSignedOut.mockReset();
  mockBiometricEnabled = false;
  mockBiometricHydrated = true;
  mockBiometricJustSignedOut = false;
});
```

Append the new test cases:

```tsx
import { act, waitFor as waitForRTL } from '@testing-library/react-native';

describe('SignIn screen — biometric enrollment', () => {
  it('does not render the "Sign in with Face ID" Face ID button block', () => {
    mockBiometricSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<SignIn />);
    expect(queryByText('Sign in with Face ID')).toBeNull();
  });

  it('hides the Remember Face ID checkbox when device is unsupported', async () => {
    mockBiometricSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<SignIn />);
    await waitForRTL(() =>
      expect(queryByText('Remember to use Face ID')).toBeNull(),
    );
  });

  it('hides the Remember Face ID checkbox when biometric is already enabled', async () => {
    mockBiometricEnabled = true;
    mockBiometricSupported.mockResolvedValueOnce(true);
    const { queryByText } = render(<SignIn />);
    await waitForRTL(() =>
      expect(queryByText('Remember to use Face ID')).toBeNull(),
    );
  });

  it('shows the checkbox when supported and not yet enabled', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
  });

  it('calls biometricStore.enable() when the checkbox is ticked and sign-in succeeds', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: true, value: undefined });
    mockBiometricEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Strong1Pass');
    fireEvent.press(getByText('Remember to use Face ID'));
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockBiometricEnable).toHaveBeenCalled();
  });

  it('does NOT call biometricStore.enable() when checkbox left unticked', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Strong1Pass');
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockBiometricEnable).not.toHaveBeenCalled();
  });

  it('does NOT call biometricStore.enable() when sign-in fails', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Remember to use Face ID'));
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockBiometricEnable).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx -t 'biometric enrollment'
```

Expected: FAIL — "Sign in with Face ID" text still present, checkbox not rendered.

- [ ] **Step 3: Edit `src/app/(onboarding)/signin.tsx`**

(A) Add imports at the top (group with the other `@/lib/auth` imports):

```ts
import { useEffect, useState } from 'react';
import { isSupported as biometricIsSupported } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';
import { Checkbox } from '@/components/forms/Checkbox';
```

(Note: `useEffect` and `useState` already imported via `import React, { useState } from 'react';` — extend to include `useEffect`. Don't add a duplicate React import.)

(B) Inside the `SignIn` function, after the existing `useLocalSearchParams` line, add:

```ts
const biometricEnabled = useBiometricStore((s) => s.enabled);
const biometricEnable = useBiometricStore((s) => s.enable);

const [supported, setSupported] = useState(false);
const [rememberBiometric, setRememberBiometric] = useState(false);

useEffect(() => {
  let cancelled = false;
  biometricIsSupported().then((v) => {
    if (!cancelled) setSupported(v);
  });
  return () => {
    cancelled = true;
  };
}, []);

const showCheckbox = supported && !biometricEnabled;
```

(C) Modify the `onSubmit` happy path. The current code returns immediately on `r.ok`:

```ts
if (r.ok) return; // (onboarding)/_layout redirects on session change
```

Replace with:

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

(D) Modify the `onGoogle` happy path the same way. The current code:

```ts
if (result.ok) return;
```

Replace with:

```ts
if (result.ok) {
  if (rememberBiometric) {
    const er = await biometricEnable();
    if (!er.ok) {
      console.warn('[biometric] enable failed (non-fatal):', er.error);
    }
  }
  return;
}
```

(E) Remove the existing Face ID button block from the JSX. Locate:

```tsx
<View style={styles.faceWrap}>
  <Pressable
    onPress={COMING_SOON}
    style={({ pressed }) => [
      styles.faceBtn,
      { backgroundColor: t.surfaceAlt, borderColor: t.line },
      pressed && { transform: [{ scale: 0.94 }] },
    ]}
  >
    <Icon name="faceid" color={t.accent} size={32} />
  </Pressable>
  <Text style={[styles.faceLabel, { color: t.textMuted }]}>
    Sign in with Face ID
  </Text>
</View>
```

Delete this block entirely.

(F) Also remove the now-unused `faceWrap`, `faceBtn`, `faceLabel` entries from the `StyleSheet.create({...})` block at the bottom of the file. Their definitions look like:

```ts
faceWrap: { alignItems: 'center', gap: 9, marginTop: 22 },
faceBtn: { ... },
faceLabel: { fontFamily: 'Archivo_700Bold', fontSize: 13.5 },
```

(G) Add the checkbox after the password Field (but before the `submitError` block). Insert:

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

(H) Remove the now-unused `Icon` import from `react-native` if it becomes unused. Check the rest of the file — `Icon` is no longer referenced if the Face ID block is gone.

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx
```

Expected: all green — existing tests still pass (they didn't reference Face ID button), new tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(onboarding)/signin.tsx' src/__tests__/signinScreen.test.tsx
git commit -m "Replace SignIn Face ID button with Remember-Face-ID checkbox + enrollment hook"
```

---

## Task 11: SignIn — auto-unlock + just_signed_out guard + expired-link banner

**Files:**
- Modify: `src/app/(onboarding)/signin.tsx`
- Modify: `src/__tests__/signinScreen.test.tsx`

- [ ] **Step 1: Append failing tests**

In `src/__tests__/signinScreen.test.tsx`, add a new mock for `attemptUnlock` at the top:

```ts
const mockAttemptUnlock = jest.fn();

jest.mock('@/lib/auth/biometric/enrollment', () => ({
  __esModule: true,
  attemptUnlock: () => mockAttemptUnlock(),
}));
```

Add to `beforeEach`: `mockAttemptUnlock.mockReset();`

Append the new describe block:

```tsx
describe('SignIn screen — biometric auto-unlock', () => {
  it('auto-fires attemptUnlock when enabled and hydrated', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: true, value: undefined });
    render(<SignIn />);
    await waitForRTL(() => expect(mockAttemptUnlock).toHaveBeenCalled());
  });

  it('does NOT auto-fire attemptUnlock when biometric is disabled', async () => {
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('does NOT auto-fire attemptUnlock before biometric store is hydrated', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = false;
    render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('does NOT auto-fire when justSignedOut is true, and consumes the flag', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = true;
    render(<SignIn />);
    await waitForRTL(() => expect(mockConsumeJustSignedOut).toHaveBeenCalled());
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('shows the expired_link banner when attemptUnlock resolves expired_link', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'expired_link' });
    const { findByText } = render(<SignIn />);
    await findByText(/Face ID session expired/i);
  });

  it('shows the lockout banner when attemptUnlock resolves lockout', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'lockout' });
    const { findByText } = render(<SignIn />);
    await findByText(/Too many attempts/i);
  });

  it('shows no banner when attemptUnlock resolves cancel', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const { queryByText } = render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(queryByText(/Face ID session expired/i)).toBeNull();
    expect(queryByText(/Too many attempts/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx -t 'auto-unlock'
```

Expected: FAIL — `attemptUnlock` not called, no banners.

- [ ] **Step 3: Edit `src/app/(onboarding)/signin.tsx`**

(A) Add new imports (extend the existing imports — don't add duplicates):

```ts
import { attemptUnlock } from '@/lib/auth/biometric/enrollment';
```

(B) Inside `SignIn`, add new selectors near the other `useBiometricStore` calls (from Task 10):

```ts
const biometricHydrated = useBiometricStore((s) => s.hydrated);
const biometricJustSignedOut = useBiometricStore((s) => s.justSignedOut);
const consumeJustSignedOut = useBiometricStore((s) => s.consumeJustSignedOut);
```

(C) Add a new state for the banner:

```ts
const [biometricBanner, setBiometricBanner] = useState<string | null>(null);
```

(D) Add the auto-unlock `useEffect` (separate from Task 10's `isSupported` effect):

```ts
useEffect(() => {
  if (!biometricHydrated) return;
  if (!biometricEnabled) return;
  if (biometricJustSignedOut) {
    consumeJustSignedOut();
    return;
  }
  let cancelled = false;
  attemptUnlock().then((r) => {
    if (cancelled) return;
    if (r.ok) return;
    if (r.error === 'expired_link') {
      setBiometricBanner(
        'Face ID session expired — sign in with your password to re-enable.',
      );
    } else if (r.error === 'lockout') {
      setBiometricBanner('Too many attempts. Sign in with your password.');
    }
    // 'cancel' and 'no_session' show no banner.
  });
  return () => {
    cancelled = true;
  };
}, [biometricHydrated, biometricEnabled, biometricJustSignedOut, consumeJustSignedOut]);
```

(E) Add the banner JSX. Insert it just above the `params.verify_expired === '1'` banner check:

```tsx
{biometricBanner && (
  <Text style={[styles.banner, { color: t.textMuted }]}>{biometricBanner}</Text>
)}
```

- [ ] **Step 4: Run all signin tests**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(onboarding)/signin.tsx' src/__tests__/signinScreen.test.tsx
git commit -m "Auto-fire biometric unlock on SignIn mount with expired/lockout banners"
```

---

## Task 12: Profile — wire Face ID `ToggleRow` to `useBiometricStore`

**Files:**
- Modify: `src/app/(home)/profile.tsx`
- Create: `src/__tests__/profileScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/profileScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockEnable = jest.fn();
const mockDisable = jest.fn();
let mockBiometricEnabled = false;
const mockIsSupported = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (selector: (s: {
    enabled: boolean;
    enable: () => Promise<unknown>;
    disable: () => Promise<void>;
  }) => unknown) =>
    selector({
      enabled: mockBiometricEnabled,
      enable: () => mockEnable(),
      disable: () => mockDisable(),
    }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn() }),
}));

import Profile from '@/app/(home)/profile';

describe('Profile screen — Face ID row', () => {
  beforeEach(() => {
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockIsSupported.mockReset();
    mockBiometricEnabled = false;
  });

  it('hides the Face ID row when device is unsupported', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<Profile />);
    await waitFor(() => expect(queryByText('Face ID login')).toBeNull());
  });

  it('shows the Face ID row when device is supported', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Face ID login');
  });

  it('reflects biometricStore.enabled = true in the toggle subtitle', async () => {
    mockBiometricEnabled = true;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Biometric sign-in is on');
  });

  it('reflects biometricStore.enabled = false in the toggle subtitle', async () => {
    mockBiometricEnabled = false;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Use password to sign in');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/profileScreen.test.tsx
```

Expected: FAIL — currently the screen renders with local `useState` ignoring the store, and the Face ID row is always rendered.

- [ ] **Step 3: Edit `src/app/(home)/profile.tsx`**

(A) Add imports at the top. The existing import is `import React, { useState } from 'react';` — extend it to add `useEffect`. Then add two new imports below the existing imports:

```ts
import React, { useEffect, useState } from 'react';
// …existing imports…
import { isSupported as biometricIsSupported } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';
```

(B) Replace the existing `const [faceId, setFaceId] = useState(PROFILE.faceId);` line. Use the store instead:

```ts
const biometricEnabled = useBiometricStore((s) => s.enabled);
const biometricEnable = useBiometricStore((s) => s.enable);
const biometricDisable = useBiometricStore((s) => s.disable);
const [supported, setSupported] = useState(false);

useEffect(() => {
  let cancelled = false;
  biometricIsSupported().then((v) => {
    if (!cancelled) setSupported(v);
  });
  return () => {
    cancelled = true;
  };
}, []);
```

(C) Find the `<ToggleRow … label="Face ID login" …>` instance and wrap it in a conditional + wire it to the store. Replace the entire `<ToggleRow … />` element with:

```tsx
{supported && (
  <ToggleRow
    label="Face ID login"
    sub={
      biometricEnabled ? 'Biometric sign-in is on' : 'Use password to sign in'
    }
    value={biometricEnabled}
    onChange={(v) => (v ? biometricEnable() : biometricDisable())}
    tk={tk}
    showDivider
    icon={<Icon name="faceid" color={tk.faint} size={20} />}
  />
)}
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --watchAll=false
```

Expected: all green (existing + new profile tests + biometric tests).

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(home)/profile.tsx' src/__tests__/profileScreen.test.tsx
git commit -m "Wire Profile Face ID toggle to useBiometricStore"
```

---

## Task 13: Runtime docs (`docs/auth-biometric.md`)

**Files:**
- Create: `docs/auth-biometric.md`

No tests — docs only.

- [ ] **Step 1: Write the doc**

Create `docs/auth-biometric.md`:

```markdown
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
capability.promptBiometric("Unlock FPL Gaffer with Face ID")
  ↓ confirm
storage.loadSession() → { access_token, refresh_token }
  ↓
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/auth-biometric.md
git commit -m "Document biometric unlock runtime + manual setup"
```

---

## Final verification

After all 13 tasks are committed:

- [ ] **Run the full suite**

```bash
npm test -- --watchAll=false
```

Expected: all green. New tests added: capability (16), storage (8), enrollment (19), biometricStore (10), Checkbox (3), profile screen (4), signin extensions (13). Plus all 198 prior tests.

- [ ] **Manual smoke test (dev build, iOS simulator)**

Follow `docs/superpowers/specs/2026-06-09-biometric-unlock-design.md` "Manual test plan" section.

- [ ] **Open a PR** that closes #18:

```
Closes #18
```
