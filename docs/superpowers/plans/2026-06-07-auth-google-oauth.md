# Google OAuth + Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Continue with Google" on the SignIn screen open a real Google OAuth flow, complete the user's profile via a new completion screen, and route them into the app — backed by a real Supabase auth store and `<Redirect>`-based route protection. Closes [issue #13](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/13).

**Architecture:** Replace the mock `useAuthStore` with a Supabase-backed store that subscribes to `onAuthStateChange`. Add a `useProfileGate` hook to check whether the signed-in user has a `profiles` row. Add `<Redirect>` protection in `(home)/_layout.tsx` and `(onboarding)/_layout.tsx` to drive the routing truth table. The Google button calls a new `signInWithGoogle()` helper that runs `supabase.auth.signInWithOAuth` + `WebBrowser.openAuthSessionAsync` + `exchangeCodeForSession`. First-time users land on a new `(onboarding)/complete-profile` screen that inserts their `profiles` row + default `notification_prefs`.

**Tech Stack:** `expo-auth-session`, `expo-web-browser`, `@react-native-community/datetimepicker`, `@supabase/supabase-js` (already installed from #10), Zustand, Expo Router.

**Spec:** `docs/superpowers/specs/2026-06-07-auth-google-oauth-design.md`

---

## File Structure

**Created:**
- `src/lib/auth/google.ts` — `signInWithGoogle()` orchestrating the OAuth round trip
- `src/lib/useProfileGate.ts` — hook returning `{ status: 'loading' | 'missing' | 'complete', refetch }`
- `src/__tests__/useProfileGate.test.ts` — hook tests
- `src/app/(onboarding)/complete-profile.tsx` — first-time profile-completion screen
- `docs/auth-google.md` — runtime + manual-setup docs

**Modified:**
- `src/store/authStore.ts` — replace mock with Supabase-backed store
- `src/__tests__/authStore.test.ts` — rewrite for new store shape
- `src/app/_layout.tsx` — extend the existing fonts/theme gate to also wait for auth hydration
- `src/app/(home)/_layout.tsx` — add `<Redirect>` protection
- `src/app/(onboarding)/_layout.tsx` — add inverse `<Redirect>` protection
- `src/app/(onboarding)/signin.tsx` — wire Google button to `signInWithGoogle()`; stub Apple/email/Face ID buttons with "Coming soon" alerts; remove the mock `handleSignIn`
- `src/components/nav/AccountMenu.tsx` — wire the "Sign out" row to `useAuthStore.getState().signOut()`
- `package.json` / `package-lock.json` — add the three deps

**Pre-flight:**

The branch `feat/auth-google-oauth` is already checked out (created at the start of brainstorming).

There's an unrelated stray modification at `src/components/ui/PointPill.tsx` in the working tree (linter touch from earlier sessions). **DO NOT include it in any commit.** Only stage the files each task specifies.

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm branch + clean baseline**

Run:
```bash
git branch --show-current
npx jest 2>&1 | grep -E "^Tests:"
npx tsc --noEmit 2>&1 | tail -3
```

Expected:
- Branch: `feat/auth-google-oauth`
- Tests: a "Tests: N passed, N total" line (note `N`; current expected is 106 from #12 — verify and remember the actual number).
- tsc: no output (clean).

- [ ] **Step 2: Install via Expo-aware installer**

Run:
```bash
npx expo install expo-auth-session expo-web-browser @react-native-community/datetimepicker
```

Expected: the CLI prints what it's installing (likely also pulls `expo-crypto` as a peer of `expo-auth-session`), exits 0. The repo's `.npmrc` (from #10) carries `legacy-peer-deps=true` so no peer-dep prompt.

If you see "EBADENGINE" warnings about Node version, ignore them — pre-existing project condition.

- [ ] **Step 3: Confirm deps landed**

Run:
```bash
grep -E '"(expo-auth-session|expo-web-browser|@react-native-community/datetimepicker)"' package.json
```
Expected: 3 lines, each with a pinned version (Expo's installer pins to SDK-compatible versions).

- [ ] **Step 4: Verify the existing test suite + tsc still pass**

Run:
```bash
npx jest 2>&1 | grep -E "^Tests:"
npx tsc --noEmit 2>&1 | tail -3
```
Expected: same count as Step 1's baseline (no new tests, no regressions). tsc clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add expo-auth-session, expo-web-browser, datetimepicker for OAuth"
git show --stat HEAD
```
Expected: exactly 2 files modified. `src/components/ui/PointPill.tsx` is NOT in the commit.

---

### Task 2: Rewrite `authStore` + tests (TDD)

**Files:**
- Modify: `src/store/authStore.ts`
- Modify: `src/__tests__/authStore.test.ts`

The old store has `{ signedIn: boolean, signIn(), signOut() }`. The new store has `{ session: Session | null, hydrated: boolean, signOut() }` and subscribes at module init to `supabase.auth.onAuthStateChange` and `supabase.auth.getSession`.

- [ ] **Step 1: Read the current test file** (for context)

Run: `cat src/__tests__/authStore.test.ts`
Expected: imports `useAuthStore`, has tests checking `signedIn`, `signIn`, `signOut`.

- [ ] **Step 2: Overwrite the test file with new tests targeting the new shape**

Overwrite `src/__tests__/authStore.test.ts` with EXACTLY this content:

```ts
// AsyncStorage mock must be at file scope so it applies when @/lib/supabase
// imports through @supabase/supabase-js (which our singleton uses).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

// Supabase mock — capture the onAuthStateChange callback so tests can drive it.
const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));
let onAuthStateChangeCallback: ((event: string, session: unknown) => void) | null = null;
const mockOnAuthStateChange = jest.fn((cb) => {
  onAuthStateChangeCallback = cb;
  return { data: { subscription: { unsubscribe: jest.fn() } } };
});
const mockGetSession = jest.fn(() => Promise.resolve({ data: { session: null }, error: null }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => mockOnAuthStateChange(cb),
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
    },
  },
}));

describe('authStore', () => {
  beforeEach(() => {
    jest.resetModules();
    onAuthStateChangeCallback = null;
    mockSignOut.mockClear();
    mockOnAuthStateChange.mockClear();
    mockGetSession.mockClear();
  });

  it('starts with no session and hydrated=false', async () => {
    // hold getSession unresolved so we can observe the pre-hydration state
    let resolveGet: (v: unknown) => void = () => {};
    mockGetSession.mockReturnValueOnce(new Promise((r) => { resolveGet = r; }));
    const { useAuthStore } = require('../store/authStore');
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().hydrated).toBe(false);
    resolveGet({ data: { session: null }, error: null });
  });

  it('flips hydrated=true after getSession resolves with no session', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));  // flush microtasks
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('picks up an existing session from getSession', async () => {
    const fakeSession = { user: { id: 'u1' }, access_token: 't' };
    mockGetSession.mockReturnValueOnce(Promise.resolve({ data: { session: fakeSession }, error: null }));
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().session).toEqual(fakeSession);
    expect(useAuthStore.getState().hydrated).toBe(true);
  });

  it('updates session when onAuthStateChange fires', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    const fakeSession = { user: { id: 'u2' }, access_token: 'tt' };
    onAuthStateChangeCallback?.('SIGNED_IN', fakeSession);
    expect(useAuthStore.getState().session).toEqual(fakeSession);
  });

  it('signOut() delegates to supabase.auth.signOut', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    await useAuthStore.getState().signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx jest src/__tests__/authStore.test.ts 2>&1 | tail -20`

Expected: tests FAIL because the old `useAuthStore` doesn't match the new shape (`hydrated` doesn't exist, `signedIn` does). You may see TypeScript-style errors or runtime undefined property accesses. That's fine — confirms tests are exercising the new shape.

- [ ] **Step 4: Rewrite `src/store/authStore.ts`**

Overwrite `src/store/authStore.ts` with EXACTLY this content:

```ts
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  // Subscribe once at module init.
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, hydrated: true });
  });
  // Also resolve current session so cold-start doesn't wait for an event.
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, hydrated: true });
  });

  return {
    session: null,
    hydrated: false,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
});
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx jest src/__tests__/authStore.test.ts 2>&1 | tail -10`
Expected: all 5 tests in `authStore` describe pass.

- [ ] **Step 6: Run the full suite + tsc**

Run:
```bash
npx jest 2>&1 | grep -E "^Tests:"
npx tsc --noEmit 2>&1 | tail -5
```

Expected: **all tests pass**. The count may change slightly — this task replaces the old `authStore.test.ts` tests (`signedIn`/`signIn`/`signOut`) with 5 new ones, so the net change is small (a few new tests in the suite). What matters is `N passed, N total` (no failures) and the test count is approximately `Task 1's baseline ± a few`.

tsc: clean.

**If any pre-existing test broke, stop and read the failure** — likely candidate is a component test that transitively imports the old `useAuthStore.signIn`. Add a mock or update the test, don't skip.

- [ ] **Step 7: Commit**

```bash
git add src/store/authStore.ts src/__tests__/authStore.test.ts
git commit -m "feat(auth): replace mock useAuthStore with Supabase-backed session store"
git show --stat HEAD
```
Expected: 2 files modified, no `PointPill.tsx`.

---

### Task 3: Build `useProfileGate` hook + tests (TDD)

**Files:**
- Create: `src/lib/useProfileGate.ts`
- Create: `src/__tests__/useProfileGate.test.ts`

The hook returns `{ status: 'loading' | 'missing' | 'complete', refetch }`. Status starts as `'loading'`; resolves to `'missing'` if no `profiles` row, `'complete'` if there is one.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/useProfileGate.test.ts` with EXACTLY:

```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: jest.fn(),
    },
    from: (table: string) => mockFrom(table),
  },
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileGate } from '../lib/useProfileGate';

const fakeSession = { user: { id: 'u1' }, access_token: 't' };

describe('useProfileGate', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    // reset auth store to hydrated, no session
    act(() => useAuthStore.setState({ session: null, hydrated: true }));
  });

  it('stays loading while auth is unhydrated', () => {
    act(() => useAuthStore.setState({ session: null, hydrated: false }));
    const { result } = renderHook(() => useProfileGate());
    expect(result.current.status).toBe('loading');
  });

  it('stays loading when there is no session', async () => {
    const { result } = renderHook(() => useProfileGate());
    // no fetch should occur
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.status).toBe('loading');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('resolves to missing when there is a session and no profile row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('resolves to complete when a profile row is returned', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });

  it('refetch() re-runs the query', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('missing'));
    mockMaybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/useProfileGate.test.ts 2>&1 | tail -10`
Expected: FAIL with `Cannot find module '../lib/useProfileGate'` (or similar).

- [ ] **Step 3: Create the hook**

Create `src/lib/useProfileGate.ts` with EXACTLY:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ProfileStatus = 'loading' | 'missing' | 'complete';

export function useProfileGate(): { status: ProfileStatus; refetch: () => void } {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      setStatus('loading');
      return;
    }
    setStatus('loading');
    supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setStatus(data ? 'complete' : 'missing'));
  }, [hydrated, session, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/useProfileGate.test.ts 2>&1 | tail -10`
Expected: all 5 tests pass.

- [ ] **Step 5: Full suite + tsc**

Run:
```bash
npx jest 2>&1 | grep -E "^Tests:"
npx tsc --noEmit 2>&1 | tail -3
```
Expected: exactly 5 more passing tests than after Task 2 (Task 3 adds 5 new tests in a new file, doesn't modify existing tests). All pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useProfileGate.ts src/__tests__/useProfileGate.test.ts
git commit -m "feat(auth): add useProfileGate hook to check profiles row existence"
git show --stat HEAD
```
Expected: 2 new files, no `PointPill.tsx`.

---

### Task 4: Build `signInWithGoogle` helper

**Files:**
- Create: `src/lib/auth/google.ts`

No unit test — the function depends on external SDKs (`WebBrowser.openAuthSessionAsync`, Supabase OAuth endpoints) that are brittle to mock and don't catch real bugs. Manual verification covers it in Task 9.

- [ ] **Step 1: Create the helper**

Create `src/lib/auth/google.ts` with EXACTLY:

```ts
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = makeRedirectUri({ scheme: 'fplgafferreactnativeapp' });

  // Ask Supabase for the Google OAuth URL.  skipBrowserRedirect=true returns
  // the URL to us instead of trying to redirect via window.location (a web API
  // that doesn't exist in React Native).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return { ok: false, error: error?.message ?? 'oauth_url_unavailable' };
  }

  // Open the Google sign-in sheet.  This blocks until the user completes,
  // cancels, or dismisses.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { ok: false, error: result.type };  // 'cancel' | 'dismiss' | 'locked'
  }

  // The redirect URL carries the auth code; exchange it for a Supabase session.
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (exchangeError) {
    return { ok: false, error: exchangeError.message };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Type-check + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -3
npx jest 2>&1 | grep -E "^Tests:"
```
Expected: tsc clean. Test count unchanged (no new tests; we're not testing this file).

If tsc complains about `WebBrowserRedirectResult` types, the type of `result.type` from `openAuthSessionAsync` is one of `'success' | 'cancel' | 'dismiss' | 'locked' | 'opened'` — the comparison `result.type !== 'success'` should type-check cleanly. If it doesn't, check the installed version's typings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/google.ts
git commit -m "feat(auth): add signInWithGoogle() helper (Supabase OAuth + expo-auth-session)"
git show --stat HEAD
```
Expected: 1 new file.

---

### Task 5: Build the profile-completion screen

**Files:**
- Create: `src/app/(onboarding)/complete-profile.tsx`

No unit test for this screen — too many mocks (router, auth store, supabase, date picker, theme), low ROI. Manual verification in Task 9 covers the form flow.

- [ ] **Step 1: Create the screen**

Create `src/app/(onboarding)/complete-profile.tsx` with EXACTLY:

```tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { supabase } from '@/lib/supabase';

const COPPA_MIN_AGE_YEARS = 13;

function ageYears(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function CompleteProfile() {
  const session = useAuthStore((s) => s.session);
  const { refetch } = useProfileGate();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  // Pre-fill from OAuth metadata (Google's `profile` scope payload).
  const meta = (session?.user.user_metadata ?? {}) as Record<string, string | undefined>;
  const [firstName, setFirstName] = useState(meta.given_name ?? '');
  const [lastName, setLastName] = useState(meta.family_name ?? '');
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = useMemo(() => {
    if (firstName.trim().length === 0) return false;
    if (lastName.trim().length === 0) return false;
    if (!dob) return false;
    if (ageYears(dob) < COPPA_MIN_AGE_YEARS) return false;
    return true;
  }, [firstName, lastName, dob]);

  const onSubmit = async () => {
    if (!session || !valid || !dob) return;
    setSubmitting(true);
    try {
      const isoDob = dob.toISOString().slice(0, 10);  // YYYY-MM-DD for Postgres date
      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: session.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dob: isoDob,
      });
      if (profileError) {
        // Unique-constraint race (clicked submit twice): treat as success.
        if (profileError.code !== '23505') {
          Alert.alert("Couldn't save your profile", profileError.message);
          return;
        }
      }
      // notification_prefs is a separate insert; DB defaults fill the channels.
      const { error: prefsError } = await supabase
        .from('notification_prefs')
        .insert({ user_id: session.user.id });
      if (prefsError && prefsError.code !== '23505') {
        // Non-fatal: home layout will retry on mount via ensureNotificationPrefs() in a future ticket.
        // For now, surface a non-blocking warning so the user can continue.
        console.warn('notification_prefs insert failed (non-fatal):', prefsError.message);
      }
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>
        <Text style={[styles.title, { color: t.text }]}>One last step</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Tell us your name and date of birth.
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Field
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Pressable
            onPress={() => setShowPicker(true)}
            style={({ pressed }) => [
              styles.dobBtn,
              { backgroundColor: t.surfaceAlt, borderColor: t.line, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.dobText, { color: dob ? t.text : t.textMuted }]}>
              {dob ? dob.toLocaleDateString() : 'Date of birth'}
            </Text>
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={dob ?? new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(_event, selected) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (selected) setDob(selected);
              }}
            />
          )}
          {dob && ageYears(dob) < COPPA_MIN_AGE_YEARS && (
            <Text style={[styles.error, { color: '#FF3B5C' }]}>
              You must be 13 or older to use FPL Gaffer.
            </Text>
          )}
        </View>

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          disabled={!valid || submitting}
          accentInk={t.accentInk}
          style={styles.submitBtn}
        >
          {submitting ? 'Saving...' : 'Continue'}
        </PillBtn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 64,
    paddingBottom: 32,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  dobBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  dobText: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
  },
  error: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    marginTop: -4,
  },
  submitBtn: {
    width: '100%',
    height: 54,
    marginTop: 22,
  },
});
```

- [ ] **Step 2: Type-check + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -5
npx jest 2>&1 | grep -E "^Tests:"
```
Expected: tsc clean. Test count unchanged.

If tsc complains that `PillBtn` doesn't accept `disabled`, check the actual component — if it doesn't, add support inline (or wrap in a `Pressable disabled={...}` with `pointerEvents='none'`). If it does (look at `src/components/ui/PillBtn.tsx`), no change needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(onboarding\)/complete-profile.tsx
git commit -m "feat(onboarding): add Complete Profile screen (name + DOB + COPPA gate)"
git show --stat HEAD
```
Expected: 1 new file.

---

### Task 6: Update layout files for auth hydration + routing protection

**Files:**
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(home)/_layout.tsx`
- Modify: `src/app/(onboarding)/_layout.tsx`

- [ ] **Step 1: Update the root layout to gate render on auth hydration**

Read `cat src/app/_layout.tsx` for context (it currently gates on `fontsLoaded && themeHydrated` per #12).

Apply this single Edit to `src/app/_layout.tsx`:

Find the existing imports block and add a single import line for the auth store. Just below `import { useThemeStore } from '@/store/themeStore';`, add:

```ts
import { useAuthStore } from '@/store/authStore';
```

Then find the existing block:
```ts
  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());

  useEffect(() => {
    if (themeHydrated) return;
    return useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true));
  }, [themeHydrated]);

  useEffect(() => {
    if (fontsLoaded && themeHydrated) SplashScreen.hideAsync();
  }, [fontsLoaded, themeHydrated]);

  if (!fontsLoaded || !themeHydrated) return null;
```

Replace it with:

```ts
  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());
  const authHydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (themeHydrated) return;
    return useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true));
  }, [themeHydrated]);

  useEffect(() => {
    if (fontsLoaded && themeHydrated && authHydrated) SplashScreen.hideAsync();
  }, [fontsLoaded, themeHydrated, authHydrated]);

  if (!fontsLoaded || !themeHydrated || !authHydrated) return null;
```

- [ ] **Step 2: Update `(home)/_layout.tsx` with Redirect protection**

Read `cat src/app/\(home\)/_layout.tsx` for context.

Overwrite `src/app/(home)/_layout.tsx` with EXACTLY:

```tsx
import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function HomeStackLayout() {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Redirect href="/(onboarding)/signin" />;

  const { status } = useProfileGate();
  if (status === 'loading') return null;
  if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="player/[name]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
```

(If the existing file has additional `<Stack.Screen>` entries, preserve them in the same position.)

- [ ] **Step 3: Update `(onboarding)/_layout.tsx` with inverse Redirect**

Overwrite `src/app/(onboarding)/_layout.tsx` with EXACTLY:

```tsx
import React from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function OnboardingLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();
  const segments = useSegments();
  const onCompleteProfile = segments[segments.length - 1] === 'complete-profile';

  if (session && status === 'complete') {
    return <Redirect href="/(home)/(tabs)/team" />;
  }
  if (session && status === 'missing' && !onCompleteProfile) {
    return <Redirect href="/(onboarding)/complete-profile" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Type-check + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -5
npx jest 2>&1 | grep -E "^Tests:"
```
Expected: tsc clean (typed routes know about `/(onboarding)/complete-profile` because Task 5 created the file). Test count unchanged.

If tsc complains that `/(onboarding)/complete-profile` is not a known route, restart the TS server cache by deleting `.expo/types/` and running `npx expo router routes` — Expo regenerates the route typings. Then re-run tsc.

- [ ] **Step 5: Commit**

```bash
git add src/app/_layout.tsx src/app/\(home\)/_layout.tsx src/app/\(onboarding\)/_layout.tsx
git commit -m "feat(routing): gate render on auth hydration; add Redirect protection on (home) and (onboarding)"
git show --stat HEAD
```
Expected: 3 files modified.

---

### Task 7: Wire signin.tsx + AccountMenu sign-out

**Files:**
- Modify: `src/app/(onboarding)/signin.tsx`
- Modify: `src/components/nav/AccountMenu.tsx`

- [ ] **Step 1: Read the current signin.tsx**

Run: `cat src/app/\(onboarding\)/signin.tsx`
Expected: imports `useAuthStore` with the OLD shape (`signIn`), has a `handleSignIn` function calling `signIn()` then `router.replace('/(home)/(tabs)/team')`. Five buttons all wired to `handleSignIn`.

- [ ] **Step 2: Rewrite signin.tsx**

Overwrite `src/app/(onboarding)/signin.tsx` with EXACTLY:

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth/google';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';

const COMING_SOON = () =>
  Alert.alert('Coming soon', 'This sign-in option is in a future update.');

export default function SignIn() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const onGoogle = async () => {
    setGoogleError(null);
    setGoogleSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) return;  // routing redirects on session change
      if (result.error === 'cancel' || result.error === 'dismiss') return;  // user backed out
      setGoogleError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Welcome, Gaffer!</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Sign in to manage your squad
        </Text>

        <View style={{ gap: 11 }}>
          <SocialBtn provider="google" onPress={onGoogle} />
          <SocialBtn provider="apple" onPress={COMING_SOON} />
        </View>
        {googleSubmitting && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {googleError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{googleError}</Text>
        )}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
          <Text style={[styles.dividerText, { color: t.textFaint }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
        </View>

        <View style={{ gap: 11 }}>
          <Field
            icon="mail"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Field
            icon="lock"
            placeholder="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
        </View>

        <View style={styles.forgotWrap}>
          <Pressable onPress={COMING_SOON} hitSlop={8}>
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={COMING_SOON}
          accentInk={t.accentInk}
          style={styles.signInBtn}
        >
          Sign in
        </PillBtn>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 64,
    paddingBottom: 32,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  spinnerWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
    letterSpacing: 1.25,
  },
  forgotWrap: {
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 18,
  },
  forgot: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  signInBtn: {
    width: '100%',
    height: 54,
  },
  faceWrap: {
    alignItems: 'center',
    gap: 9,
    marginTop: 22,
  },
  faceBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13.5,
  },
});
```

- [ ] **Step 3: Wire AccountMenu sign-out**

Read `cat src/components/nav/AccountMenu.tsx` for context. Find where the "Sign out" `<Pressable>` row is defined. It currently has `onPress={onSignOut}` where `onSignOut` comes from props.

Find this section of the file (likely near the bottom of the JSX):
```tsx
<Pressable style={styles.row} onPress={onSignOut}>
  <Icon name="signOut" color="#FF3B5C" size={18} />
  <Text style={[styles.rowText, { color: '#FF3B5C' }]}>Sign out</Text>
</Pressable>
```

Replace with:
```tsx
<Pressable
  style={styles.row}
  onPress={async () => {
    await useAuthStore.getState().signOut();
    onSignOut();
  }}
>
  <Icon name="signOut" color="#FF3B5C" size={18} />
  <Text style={[styles.rowText, { color: '#FF3B5C' }]}>Sign out</Text>
</Pressable>
```

Also add the import at the top of `AccountMenu.tsx`, alongside the existing imports:
```ts
import { useAuthStore } from '@/store/authStore';
```

(`onSignOut` still gets called after — it lets the parent close the menu modal.)

- [ ] **Step 4: Type-check + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -5
npx jest 2>&1 | grep -E "^Tests:"
```
Expected: tsc clean. Test count unchanged.

If a component test that renders signin.tsx (transitively) breaks because `useAuthStore` lost `signIn`, find the test, add a mock for `@/lib/auth/google` at file scope, and adjust the test expectation. Likely candidate: `src/__tests__/components.test.tsx` — search for `SignIn` import.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/signin.tsx src/components/nav/AccountMenu.tsx
git commit -m "feat(auth): wire Google sign-in button + AccountMenu sign-out; stub other buttons"
git show --stat HEAD
```
Expected: 2 files modified.

---

### Task 8: Write `docs/auth-google.md`

**Files:**
- Create: `docs/auth-google.md`

- [ ] **Step 1: Write the doc**

Create `docs/auth-google.md` with EXACTLY:

```markdown
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

On every subsequent app launch you skip steps 1-5 entirely — the persisted Supabase session restores automatically.

## Manual setup (one-time per Supabase project)

These steps are out-of-band and require a logged-in human. Same pattern as #10's Supabase manual provisioning.

1. **Google Cloud Console** — open https://console.cloud.google.com and create or pick a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
3. **Application type: Web application.** Name it "FPL Gaffer Supabase" (or similar).
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
```

- [ ] **Step 2: Eyeball the markdown**

Run: `cat docs/auth-google.md | head -30`
Confirm headings render cleanly, the ASCII flow diagram (inside a `\`\`\`` block) is intact.

- [ ] **Step 3: Commit**

```bash
git add docs/auth-google.md
git commit -m "docs: add docs/auth-google.md (runtime flow, manual setup, troubleshooting)"
git show --stat HEAD
```
Expected: 1 new file.

---

### Task 9: Manual setup + end-to-end verification

**Files:** none (orchestration).

This task verifies the whole flow works end-to-end. Requires the user (or the engineer with access) to complete the manual Google Cloud + Supabase setup.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/auth-google-oauth
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: Google OAuth + auth foundation (issue #13)" --body-file - <<'EOF'
## Summary
Implements [issue #13](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/13) — Google sign-in works end-to-end, backed by a real Supabase auth store, a profile-completion gate, and `<Redirect>`-based routing.

This is the first of five auth-cluster sub-projects (C → A → B → E, with D deferred to App Store submission). It carries more weight than the others because it lays foundational pieces (auth store, completion screen, routing) that the next four sub-projects reuse.

Spec: `docs/superpowers/specs/2026-06-07-auth-google-oauth-design.md`
Doc: `docs/auth-google.md`

## What changed
- `src/store/authStore.ts` — mock replaced with a Supabase-backed store subscribed to `onAuthStateChange`
- `src/lib/auth/google.ts` — `signInWithGoogle()` orchestrating the OAuth round-trip
- `src/lib/useProfileGate.ts` — hook returning `loading | missing | complete`
- `src/app/(onboarding)/complete-profile.tsx` — first-time profile form (name + DOB + COPPA gate)
- Routing protection in `(home)/_layout.tsx` and `(onboarding)/_layout.tsx` via `<Redirect>`
- `signin.tsx` — Google button wired up; Apple / email / forgot-password / Face ID buttons show \"Coming soon\" alert until their sub-projects land
- `AccountMenu.tsx` — Sign out row wired to real `signOut()`
- `docs/auth-google.md` — runtime flow, manual setup, troubleshooting
- Deps: `expo-auth-session`, `expo-web-browser`, `@react-native-community/datetimepicker` (Expo-installed)

## Acceptance criteria (rewritten per Supabase architecture — see spec)
- [x] \"Continue with Google\" triggers Google sign-in sheet
- [x] Cancellation does not change auth state
- [x] Session persists via AsyncStorage (already wired in #10)
- [x] Session change drives routing (no manual `router.replace` calls)
- [x] First-time users land on `complete-profile`; returning users skip straight to home
- [x] Sign out works from AccountMenu
- [x] `docs/auth-google.md` written

## Test plan (manual, post-merge — requires Google Cloud + Supabase Google provider configured per docs/auth-google.md)
- [ ] Fresh install: tap Google button → Google sheet → sign in → land on `complete-profile`
- [ ] Submit completion form → land on home (My Team) tab
- [ ] Force-quit + relaunch → land on home (session persists)
- [ ] AccountMenu → Sign out → land on signin
- [ ] Tap Apple / email Sign in / Forgot password / Face ID → \"Coming soon\" alert
- [ ] Verify in Supabase Dashboard → Authentication → Users that a row for your Google email exists
- [ ] Verify in Supabase Dashboard → Table Editor → `profiles` that a row with your `user_id` exists
- [ ] Verify in Supabase Dashboard → Table Editor → `notification_prefs` that a row exists with the default channel values

Closes #13

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Confirm manual setup is done**

Before merging, the user must confirm they've completed steps 1–8 of `docs/auth-google.md`'s "Manual setup" section:
- Google Cloud OAuth client created with the right redirect URI
- OAuth consent screen configured (Testing mode is fine)
- Supabase Auth → Providers → Google enabled with the client ID/secret
- Supabase Auth → URL Configuration includes `fplgafferreactnativeapp://*`

If not done, halt and ask the user to finish setup before continuing.

- [ ] **Step 4: Local verification on the branch (before merge)**

The user runs `npm start` against the branch, executes the test plan steps from the PR body. Pass = ready to merge. Fail = paste error, fix.

- [ ] **Step 5: Merge the PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Post AC-rewrite comment on issue #13**

```bash
gh issue comment 13 --body-file - <<'EOF'
## AC rewrites (Supabase Auth architecture)

Closed by #<PR_NUMBER>. As we work through the auth cluster, we're rewriting ACs to fit our actual architecture (Supabase Auth, not the custom-backend shape the original issue assumed). Captured here for traceability.

| Original AC | What actually shipped |
|---|---|
| ID token sent to backend, session token returned, stored in SecureStore | Supabase handles the entire OAuth dance server-side; the resulting **Supabase session** (not a separate token) is persisted to **AsyncStorage** via the SDK's storage adapter wired in #10. No SecureStore for the session — RLS gates real data access regardless of where the token sits. |
| `useAuthStore.signedIn` becomes true and routes to /(home) | `useAuthStore.session` becomes non-null; `<Redirect>` in `(home)/_layout.tsx` allows entry. First-time users are redirected to `/(onboarding)/complete-profile` before reaching home — required because `profiles.first_name/last_name/dob` are `NOT NULL` per #11. |
| Cancellation does not change auth state | `WebBrowser.openAuthSessionAsync` resolves with `{ type: 'cancel' | 'dismiss' }`; we no-op. |
| Documented in docs/auth-google.md | Doc landed: runtime flow, manual setup steps, troubleshooting, future work. |

The `Continue with Google triggers Google sign-in sheet` AC is satisfied unchanged.
EOF
```

(Replace `<PR_NUMBER>` with the actual PR number.)

- [ ] **Step 7: Sync local main**

```bash
git checkout main
git pull --ff-only origin main
```

Issue #13 closes automatically via `Closes #13` in the PR body.

---

## Acceptance Criteria Mapping

| Spec / Issue AC | Task |
|---|---|
| Replace mock `useAuthStore` with Supabase-backed store | Task 2 |
| `useProfileGate` hook | Task 3 |
| `signInWithGoogle()` helper | Task 4 |
| Profile-completion screen (name, DOB, COPPA) | Task 5 |
| Root-layout gate on auth hydration | Task 6 |
| `<Redirect>` protection in (home) + (onboarding) layouts | Task 6 |
| Wire Google button on signin.tsx | Task 7 |
| "Coming soon" alerts for Apple / email / forgot password / Face ID | Task 7 |
| Sign out from AccountMenu | Task 7 |
| `docs/auth-google.md` | Task 8 |
| Manual Google Cloud + Supabase setup | Task 9 |
| End-to-end verification | Task 9 |
| Post AC-rewrite comment on #13 | Task 9 |

## Out of Scope (Each Has Its Own Sub-project or Follow-up)

- **Sub-project A** (#15 + #16) — email/password + signup (next sub-project after C).
- **Sub-project B** (#17) — forgot password.
- **Sub-project E** (#18 + #19) — biometric + account deletion.
- **Sub-project D** (#14) — Apple OAuth (deferred to just before App Store submission).
- **Native Google Sign-In SDK** — Phase 5 (requires dev-build pipeline).
- **Profile editing** — its own ticket later.
- **Publish OAuth consent screen** — required before public launch, Phase 5.
