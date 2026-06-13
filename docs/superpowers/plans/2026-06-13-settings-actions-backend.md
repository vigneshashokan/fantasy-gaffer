# Wire Settings & Profile Actions to Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the no-op Settings/Profile actions (change password, notification prefs, share, feedback, terms) to their real Supabase/platform APIs, and remove the Gender row.

**Architecture:** No custom REST tier — every action maps to a Supabase-direct call (`supabase.auth.*`, table upsert) behind a `src/api`/`src/lib` function, or to a platform API (`Share`, `mailto:`, in-app browser) behind a thin `src/lib/external.ts` helper. UI surfaces loading/errors inline, matching existing `ChangePassword`/`Result<T>` patterns. No DB migration (the `notification_prefs` table already exists; Gender is removed, not added).

**Tech Stack:** Expo / React Native, `@supabase/supabase-js`, TanStack Query, `expo-linking`, `expo-web-browser`, RN `Share`, Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-06-13-settings-actions-backend-design.md`

---

## File structure

**Created:**
- `src/constants/links.ts` — placeholder external URLs/email (one swap-point).
- `src/lib/external.ts` — `shareApp()` / `sendFeedback()` / `openTerms()` platform handoffs.
- `src/api/notificationPrefs.ts` — `useNotificationPrefs()` query + `useUpdateNotificationPrefs()` mutation.
- `src/__tests__/lib/external.test.ts`
- `src/__tests__/auth/changePassword.test.ts`
- `src/__tests__/api/notificationPrefs.test.tsx`

**Modified:**
- `src/lib/auth/email.ts` — add `changePassword()`.
- `src/api/queryKeys.ts` — add `notificationPrefs(userId)`.
- `src/components/profile/ChangePassword.tsx` — wire `submit` + loading/error.
- `src/components/settings/NotificationsCard.tsx` — query/mutation wiring + inline error.
- `src/app/(home)/settings.tsx` — Share/Feedback/Terms `onPress`.
- `src/app/(home)/profile.tsx` — drop Gender row.
- `src/types/fpl.ts` — drop `Profile.gender`.
- `src/api/profile.ts` — drop `gender` from `profileFromRow`.
- `src/__tests__/components.test.tsx` — remove GenderRow test; mock email + notificationPrefs; add ChangePassword error test.
- `src/__tests__/settingsScreen.test.tsx` — mock external + notificationPrefs; add Share/Feedback/Terms tests.
- `src/__tests__/profileScreen.test.tsx` — mock email; drop `gender` from profile mock.
- `src/__tests__/api/profile.test.tsx` — drop `gender` from expected object.

**Deleted:**
- `src/components/profile/GenderRow.tsx`

**Task order:** 1 (external) → 2 (settings rows) → 3 (changePassword fn) → 4 (ChangePassword UI) → 5 (notificationPrefs API) → 6 (NotificationsCard UI) → 7 (remove Gender) → 8 (full verification).

---

## Task 1: External link constants + helpers

**Files:**
- Create: `src/constants/links.ts`
- Create: `src/lib/external.ts`
- Test: `src/__tests__/lib/external.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/external.test.ts`:

```ts
import { Share } from 'react-native';

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockOpenBrowserAsync = jest.fn();

jest.mock('expo-linking', () => ({
  canOpenURL: (u: string) => mockCanOpenURL(u),
  openURL: (u: string) => mockOpenURL(u),
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (u: string) => mockOpenBrowserAsync(u),
}));

import { shareApp, sendFeedback, openTerms } from '@/lib/external';
import { APP_STORE_URL, TERMS_URL, FEEDBACK_EMAIL } from '@/constants/links';

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

afterEach(() => shareSpy.mockRestore());

describe('shareApp', () => {
  it('shares the store URL', async () => {
    await shareApp();
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: APP_STORE_URL }),
    );
  });
});

describe('sendFeedback', () => {
  it('opens a mailto URL when supported', async () => {
    mockCanOpenURL.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);
    const r = await sendFeedback();
    expect(r).toEqual({ ok: true });
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining(`mailto:${FEEDBACK_EMAIL}`),
    );
  });

  it('returns ok:false and does not open when unsupported', async () => {
    mockCanOpenURL.mockResolvedValueOnce(false);
    const r = await sendFeedback();
    expect(r).toEqual({ ok: false });
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});

describe('openTerms', () => {
  it('opens the terms URL in the in-app browser', async () => {
    mockOpenBrowserAsync.mockResolvedValueOnce({ type: 'opened' });
    await openTerms();
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(TERMS_URL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/lib/external.test.ts`
Expected: FAIL — `Cannot find module '@/lib/external'` (and `@/constants/links`).

- [ ] **Step 3: Create the constants**

Create `src/constants/links.ts`:

```ts
// src/constants/links.ts
//
// Placeholder external destinations. Swap in real values when the legal
// page (#46) ships and the app is published to the stores. Nothing else
// in the app references these literals — change them here only.

export const APP_STORE_URL = 'https://fplgaffer.app';
export const TERMS_URL = 'https://fplgaffer.app/terms';
export const FEEDBACK_EMAIL = 'feedback@fplgaffer.app';
```

- [ ] **Step 4: Create the helpers**

Create `src/lib/external.ts`:

```ts
// src/lib/external.ts
//
// Platform handoffs for the Settings "More" rows. Kept behind thin
// functions so screens stay declarative and the platform calls are
// unit-testable behind mocks. Sharing a URL/text is RN Share's job —
// expo-sharing is for local files only, so it is intentionally not used.

import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { APP_STORE_URL, TERMS_URL, FEEDBACK_EMAIL } from '@/constants/links';

export async function shareApp(): Promise<void> {
  // User-cancel resolves normally (action === 'dismissedAction'); not an error.
  await Share.share({
    message: `Check out FPL Gaffer — your FPL season, leveled up. ${APP_STORE_URL}`,
    url: APP_STORE_URL, // iOS uses url; Android folds it into message.
  });
}

export async function sendFeedback(): Promise<{ ok: boolean }> {
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('FPL Gaffer feedback')}`;
  const can = await Linking.canOpenURL(url);
  if (!can) return { ok: false }; // caller shows a fallback Alert
  await Linking.openURL(url);
  return { ok: true };
}

export async function openTerms(): Promise<void> {
  await WebBrowser.openBrowserAsync(TERMS_URL);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/lib/external.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/constants/links.ts src/lib/external.ts src/__tests__/lib/external.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): add external link constants + share/feedback/terms helpers (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire Share / Feedback / Terms rows in Settings

**Files:**
- Modify: `src/app/(home)/settings.tsx`
- Test: `src/__tests__/settingsScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/settingsScreen.test.tsx`, add these two mocks **after** the existing `jest.mock('@/lib/supabase', …)` block and before `import Settings`:

```ts
jest.mock('@/lib/external', () => ({
  __esModule: true,
  shareApp: jest.fn().mockResolvedValue(undefined),
  sendFeedback: jest.fn().mockResolvedValue({ ok: true }),
  openTerms: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({
    data: { deadlines: true, prices: true, gwConfirm: true, transfer: false },
    isPending: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
}));
```

Change the top import line to add `fireEvent`:

```ts
import { render, waitFor, fireEvent } from '@testing-library/react-native';
```

Add this import alongside `import Settings from '@/app/(home)/settings';`:

```ts
import { shareApp, sendFeedback, openTerms } from '@/lib/external';
```

Add a new describe block at the end of the file:

```ts
describe('Settings screen — More actions', () => {
  beforeEach(() => {
    (shareApp as jest.Mock).mockClear();
    (sendFeedback as jest.Mock).mockClear();
    (openTerms as jest.Mock).mockClear();
    mockIsSupported.mockResolvedValue(false);
  });

  it('invokes shareApp when the Share row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Share FPL Gaffer'));
    expect(shareApp).toHaveBeenCalled();
  });

  it('invokes sendFeedback when the Feedback row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Send Feedback'));
    expect(sendFeedback).toHaveBeenCalled();
  });

  it('invokes openTerms when the Terms row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Terms & Conditions'));
    expect(openTerms).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/settingsScreen.test.tsx -t "More actions"`
Expected: FAIL — `shareApp`/`sendFeedback`/`openTerms` not called (rows still no-op).

- [ ] **Step 3: Wire the rows in `settings.tsx`**

Add imports near the other `@/` imports at the top of `src/app/(home)/settings.tsx`:

```ts
import { shareApp, sendFeedback, openTerms } from '@/lib/external';
import { FEEDBACK_EMAIL } from '@/constants/links';
```

Replace the three rows in the `<SectionCard title="More" …>` block. Change the **Share** row's `onPress={() => {}}` to:

```tsx
            onPress={() => {
              shareApp().catch(() => {});
            }}
```

Change the **Send Feedback** row's `onPress={() => {}}` to:

```tsx
            onPress={async () => {
              const { ok } = await sendFeedback();
              if (!ok) Alert.alert('No mail app', `Email us at ${FEEDBACK_EMAIL}`);
            }}
```

Change the **Terms & Conditions** row's `onPress={() => {}}` to:

```tsx
            onPress={() => {
              openTerms().catch(() => {});
            }}
```

(`Alert` is already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/settingsScreen.test.tsx`
Expected: PASS (existing Face ID tests + 3 new "More actions" tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/'(home)'/settings.tsx src/__tests__/settingsScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat(settings): wire Share / Send Feedback / Terms rows (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `changePassword()` in the auth lib

**Files:**
- Modify: `src/lib/auth/email.ts` (append a new export)
- Test: `src/__tests__/auth/changePassword.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/auth/changePassword.test.ts`:

```ts
const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInWithPassword: (a: unknown) => mockSignInWithPassword(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
      signOut: (a: unknown) => mockSignOut(a),
    },
  },
}));

import { changePassword } from '@/lib/auth/email';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'a@b.co' } } } });
});

describe('changePassword', () => {
  it('verifies the current password, then updates, then signs out other devices', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });

    const r = await changePassword('OldPass1', 'NewPass1');

    expect(r.ok).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'OldPass1' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('returns invalid_credentials and does NOT update when current password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const r = await changePassword('WrongPass', 'NewPass1');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('maps a weak new-password error from updateUser', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: null, error: { code: 'weak_password', message: 'weak' } });

    const r = await changePassword('OldPass1', '123');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('still succeeds when signOut(others) fails (best-effort)', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error('network'));

    const r = await changePassword('OldPass1', 'NewPass1');
    expect(r.ok).toBe(true);
  });

  it('returns unknown when there is no session email', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const r = await changePassword('OldPass1', 'NewPass1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/auth/changePassword.test.ts`
Expected: FAIL — `changePassword` is not exported from `@/lib/auth/email`.

- [ ] **Step 3: Implement `changePassword`**

Append to the end of `src/lib/auth/email.ts`:

```ts
export async function changePassword(current: string, next: string): Promise<Result> {
  // Read the current email from the local session (no network round-trip).
  let email: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    email = data.session?.user.email ?? undefined;
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
  if (!email) return { ok: false, error: 'unknown' };

  // 1. Verify the current password AND freshen the session. This is what
  //    satisfies Supabase's "require current password" / secure password
  //    change. signInWithEmail already maps a wrong password to
  //    invalid_credentials.
  const verify = await signInWithEmail(email, current);
  if (!verify.ok) return verify;

  // 2. Update to the new password.
  try {
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { ok: false, error: classify(error) };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }

  // 3. Best-effort: invalidate other devices. Don't roll back if it fails.
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch (err) {
    console.warn('[auth] signOut(others) after password change failed (non-fatal):', err);
  }

  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/auth/changePassword.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/changePassword.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add changePassword (verify current, then update) (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire the ChangePassword component

**Files:**
- Modify: `src/components/profile/ChangePassword.tsx`
- Test: `src/__tests__/components.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/components.test.tsx`, add this mock at the very top of the file (above the existing `mockRequestDeletion` declaration, with the other top-of-file mocks):

```ts
const mockChangePassword = jest.fn();
jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  changePassword: (cur: string, next: string) => mockChangePassword(cur, next),
}));
```

In the `describe('Profile components', …)` block, **replace** the existing `it('ChangePassword renders collapsed', …)` test with these two:

```ts
  it('ChangePassword renders collapsed', () => {
    const { getByText } = render(<ChangePassword tk={tk} />);
    expect(getByText('Change password')).toBeTruthy();
  });

  it('ChangePassword shows an inline error when the current password is wrong', async () => {
    mockChangePassword.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByText, getByPlaceholderText } = render(<ChangePassword tk={tk} />);

    fireEvent.press(getByText('Change password')); // expand
    fireEvent.changeText(getByPlaceholderText('Current password'), 'wrong');
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewPass1');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'NewPass1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() => expect(getByText('Current password is incorrect.')).toBeTruthy());
    expect(mockChangePassword).toHaveBeenCalledWith('wrong', 'NewPass1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components.test.tsx -t "ChangePassword shows an inline error"`
Expected: FAIL — the error text never appears (current `submit` ignores the result and just sets `done`).

- [ ] **Step 3: Wire the component**

In `src/components/profile/ChangePassword.tsx`:

(a) Add the import below the existing imports:

```ts
import { changePassword, type AuthErrorKind } from '@/lib/auth/email';
```

(b) Add `saving` + `error` state. Replace:

```ts
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
```

with:

```ts
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
```

(c) Replace the `submit` function:

```ts
  const submit = () => {
    setDone(true);
    setOpen(false);
    reset();
  };
```

with:

```ts
  const submit = async () => {
    setSaving(true);
    setError(null);
    const r = await changePassword(cur, nw);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone(true);
    setOpen(false);
    reset();
  };
```

(d) Clear the error when the panel is toggled. Replace the header `Pressable`'s `onPress`:

```tsx
        onPress={() => {
          setOpen((o) => !o);
          setDone(false);
        }}
```

with:

```tsx
        onPress={() => {
          setOpen((o) => !o);
          setDone(false);
          setError(null);
        }}
```

(e) Show the inline error. Directly **after** the existing `{mismatch && (…)}` block, add:

```tsx
          {error && (
            <Text style={[styles.errorText, { color: tk.pink }]}>
              {errorCopy(error)}
            </Text>
          )}
```

(f) Disable the button while saving and change its label. Replace the submit `Pressable`:

```tsx
          <Pressable
            disabled={!ready}
            onPress={submit}
            style={[
              styles.submit,
              {
                backgroundColor: ready ? tk.activeFill : tk.track,
              },
            ]}
          >
            <Text
              style={[
                styles.submitText,
                { color: ready ? '#fff' : tk.faint },
              ]}
            >
              Update password
            </Text>
          </Pressable>
```

with:

```tsx
          <Pressable
            disabled={!ready || saving}
            onPress={submit}
            style={[
              styles.submit,
              {
                backgroundColor: ready && !saving ? tk.activeFill : tk.track,
              },
            ]}
          >
            <Text
              style={[
                styles.submitText,
                { color: ready && !saving ? '#fff' : tk.faint },
              ]}
            >
              {saving ? 'Updating…' : 'Update password'}
            </Text>
          </Pressable>
```

(g) Add the `errorCopy` helper. Directly **above** the `function Caret(…)` declaration near the bottom of the file, add:

```tsx
function errorCopy(kind: AuthErrorKind): string {
  switch (kind) {
    case 'invalid_credentials':
      return 'Current password is incorrect.';
    case 'weak_password':
      return 'New password is too weak.';
    case 'network':
      return 'No connection — try again.';
    case 'rate_limited':
      return 'Too many attempts — try again shortly.';
    default:
      return "Couldn't update password — try again.";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/components.test.tsx -t "ChangePassword"`
Expected: PASS (both ChangePassword tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ChangePassword.tsx src/__tests__/components.test.tsx
git commit -m "$(cat <<'EOF'
feat(profile): wire ChangePassword to backend with loading + inline errors (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: notification_prefs API (query + mutation)

**Files:**
- Modify: `src/api/queryKeys.ts`
- Create: `src/api/notificationPrefs.ts`
- Test: `src/__tests__/api/notificationPrefs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/notificationPrefs.test.tsx`:

```tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '@/api/notificationPrefs';
import { queryKeys } from '@/api/queryKeys';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/store/authStore', () => ({ useAuthStore: jest.fn() }));

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

function setSession(session: { user: { id: string } } | null) {
  (useAuthStore as unknown as jest.Mock).mockImplementation(
    (selector?: (s: unknown) => unknown) => {
      const state = { session };
      return selector ? selector(state) : state;
    },
  );
}

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('useNotificationPrefs', () => {
  it('maps gw_confirm to gwConfirm', async () => {
    setSession({ user: { id: 'u1' } });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { deadlines: true, prices: false, gw_confirm: true, transfer: false },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      deadlines: true, prices: false, gwConfirm: true, transfer: false,
    });
  });

  it('falls back to defaults when no row exists', async () => {
    setSession({ user: { id: 'u1' } });
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      deadlines: true, prices: true, gwConfirm: true, transfer: false,
    });
  });
});

describe('useUpdateNotificationPrefs', () => {
  it('upserts a row with gw_confirm renamed from gwConfirm', async () => {
    setSession({ user: { id: 'u1' } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateNotificationPrefs(), { wrapper: wrapperWith(client) });
    await act(async () => {
      await result.current.mutateAsync({ gwConfirm: false });
    });

    expect(supabase.from).toHaveBeenCalledWith('notification_prefs');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', gw_confirm: false }),
      { onConflict: 'user_id' },
    );
  });

  it('rolls back the optimistic cache update on error', async () => {
    setSession({ user: { id: 'u1' } });
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = queryKeys.notificationPrefs('u1');
    const prev = { deadlines: true, prices: true, gwConfirm: true, transfer: false };
    client.setQueryData(key, prev);

    const { result } = renderHook(() => useUpdateNotificationPrefs(), { wrapper: wrapperWith(client) });
    await act(async () => {
      await result.current.mutateAsync({ transfer: true }).catch(() => {});
    });

    expect(client.getQueryData(key)).toEqual(prev);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/api/notificationPrefs.test.tsx`
Expected: FAIL — `Cannot find module '@/api/notificationPrefs'` and `queryKeys.notificationPrefs is not a function`.

- [ ] **Step 3: Add the query key**

In `src/api/queryKeys.ts`, add this line inside the `queryKeys` object (after the `profile` line):

```ts
  notificationPrefs: (userId: string) => ['notificationPrefs', userId] as const,
```

- [ ] **Step 4: Create the API module**

Create `src/api/notificationPrefs.ts`:

```ts
// src/api/notificationPrefs.ts
//
// useNotificationPrefs() reads the current user's notification_prefs row;
// useUpdateNotificationPrefs() patches one or more channels with an
// optimistic cache update + rollback. Mirrors src/api/linkTeam.ts: user id
// comes from useAuthStore so the cache key matches per account.
//
// UI uses camelCase `gwConfirm`; the DB column is `gw_confirm`. The mapping
// lives entirely in this file so no component sees the snake_case name.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';

export interface NotificationPrefs {
  deadlines: boolean;
  prices: boolean;
  gwConfirm: boolean;
  transfer: boolean;
}

// Matches the DB column defaults (transfer defaults off — it's noisy).
const DEFAULT_PREFS: NotificationPrefs = {
  deadlines: true,
  prices: true,
  gwConfirm: true,
  transfer: false,
};

interface PostgrestErrorShape {
  message: string;
  code?: string;
}

export function useNotificationPrefs() {
  const userId = useAuthStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: queryKeys.notificationPrefs(userId ?? 'anon'),
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('deadlines, prices, gw_confirm, transfer')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PREFS; // row created at profile completion; defensive fallback
      return {
        deadlines: data.deadlines,
        prices: data.prices,
        gwConfirm: data.gw_confirm,
        transfer: data.transfer,
      };
    },
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const key = queryKeys.notificationPrefs(userId ?? 'anon');

  return useMutation<void, PostgrestErrorShape, Partial<NotificationPrefs>, { prev?: NotificationPrefs }>({
    mutationFn: async (patch) => {
      if (!userId) {
        throw new Error('No authenticated user') as unknown as PostgrestErrorShape;
      }
      const row: Record<string, unknown> = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };
      if ('deadlines' in patch) row.deadlines = patch.deadlines;
      if ('prices' in patch) row.prices = patch.prices;
      if ('gwConfirm' in patch) row.gw_confirm = patch.gwConfirm;
      if ('transfer' in patch) row.transfer = patch.transfer;

      // upsert (not update): self-heals if the row is somehow missing.
      const { error } = await supabase
        .from('notification_prefs')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw error as PostgrestErrorShape;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key);
      if (prev) qc.setQueryData<NotificationPrefs>(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/api/notificationPrefs.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/queryKeys.ts src/api/notificationPrefs.ts src/__tests__/api/notificationPrefs.test.tsx
git commit -m "$(cat <<'EOF'
feat(api): notification_prefs query + optimistic update mutation (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire the NotificationsCard component

**Files:**
- Modify: `src/components/settings/NotificationsCard.tsx`
- Test: `src/__tests__/components.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/components.test.tsx`, add this mock at the very top of the file with the other top-of-file mocks. Note the mock returns **all channels off** — this is deliberate so the test genuinely goes red against the un-wired card (whose local default is 3-on):

```ts
jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({
    data: { deadlines: false, prices: false, gwConfirm: false, transfer: false },
    isPending: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
}));
```

In the `describe('Settings components', …)` block, **replace** the existing `it('NotificationsCard renders header and summary', …)` test with:

```ts
  it('NotificationsCard renders summary from fetched prefs', () => {
    const { getByText } = render(<NotificationsCard tk={tk} />);
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('All off')).toBeTruthy(); // driven by the mocked hook (all four off)
  });
```

The mutation itself is fully covered in `notificationPrefs.test.tsx` (Task 5); `Toggle` exposes no text node, so a per-channel toggle press isn't worth targeting here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components.test.tsx -t "NotificationsCard"`
Expected: FAIL — the un-wired card ignores the mocked hook and renders its local default summary "3 of 4 on", so the assertion for "All off" does not match.

- [ ] **Step 3: Wire the component**

Replace the **entire contents** of `src/components/settings/NotificationsCard.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Toggle } from '@/components/ui/Toggle';
import { ApexTokens } from '@/constants/apexTokens';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  type NotificationPrefs,
} from '@/api/notificationPrefs';

const ITEMS = [
  { key: 'deadlines', label: 'Deadlines', sub: 'Gameweek deadline reminders' },
  { key: 'prices',    label: 'Price changes', sub: 'Player price rises & falls' },
  { key: 'gwConfirm', label: 'Gameweek team confirmation', sub: 'When your XI is locked in' },
  { key: 'transfer',  label: 'Transfer window open', sub: 'Window opens & closes' },
] as const;

type Key = (typeof ITEMS)[number]['key'];

const DEFAULTS: NotificationPrefs = {
  deadlines: true,
  prices: true,
  gwConfirm: true,
  transfer: false,
};

interface NotificationsCardProps {
  tk: ApexTokens;
}

export function NotificationsCard({ tk }: NotificationsCardProps) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useNotificationPrefs();
  const { mutate, isError } = useUpdateNotificationPrefs();
  const prefs = data ?? DEFAULTS;

  const onCount = ITEMS.filter((it) => prefs[it.key]).length;
  const allOn = onCount === ITEMS.length;
  const summary =
    onCount === 0 ? 'All off' : allOn ? 'All on' : `${onCount} of ${ITEMS.length} on`;

  const setAll = (v: boolean) =>
    mutate({ deadlines: v, prices: v, gwConfirm: v, transfer: v });
  const setOne = (k: Key, v: boolean) => mutate({ [k]: v });

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          { backgroundColor: tk.card, borderColor: tk.cardBorder },
        ]}
      >
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.head}>
          <View style={styles.iconCell}>
            <BellIcon color={tk.faint} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.label, { color: tk.text }]}>Notifications</Text>
            <Text
              style={[
                styles.sub,
                { color: onCount === 0 ? tk.faint : tk.green },
              ]}
            >
              {summary}
            </Text>
          </View>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Caret color={tk.faint} />
          </View>
        </Pressable>

        {isError && (
          <Text style={[styles.errSub, { color: tk.pink }]}>
            Couldn&apos;t save — try again
          </Text>
        )}

        {open && (
          <View>
            <View
              style={[
                styles.allRow,
                { borderTopColor: tk.line, backgroundColor: tk.headStrip },
              ]}
            >
              <View style={styles.iconCell} />
              <Text style={[styles.allLabel, { color: tk.text }]}>
                All notifications
              </Text>
              <Toggle
                value={allOn}
                onChange={isPending ? () => {} : setAll}
                onColor={tk.green}
                offColor={tk.track}
                size="sm"
              />
            </View>
            {ITEMS.map((it) => (
              <View
                key={it.key}
                style={[styles.item, { borderTopColor: tk.line }]}
              >
                <View style={styles.iconCell} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.itemLabel, { color: tk.text }]}>
                    {it.label}
                  </Text>
                  <Text style={[styles.itemSub, { color: tk.faint }]}>
                    {it.sub}
                  </Text>
                </View>
                <Toggle
                  value={prefs[it.key]}
                  onChange={isPending ? () => {} : (v) => setOne(it.key, v)}
                  onColor={tk.green}
                  offColor={tk.track}
                  size="sm"
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Caret({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCell: {
    width: 30,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  errSub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  allLabel: {
    flex: 1,
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  itemLabel: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  itemSub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    marginTop: 1,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/components.test.tsx -t "NotificationsCard"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/NotificationsCard.tsx src/__tests__/components.test.tsx
git commit -m "$(cat <<'EOF'
feat(settings): persist notification prefs via backend (optimistic) (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Remove the Gender row

**Files:**
- Delete: `src/components/profile/GenderRow.tsx`
- Modify: `src/app/(home)/profile.tsx`
- Modify: `src/types/fpl.ts`
- Modify: `src/api/profile.ts`
- Modify: `src/__tests__/api/profile.test.tsx`
- Modify: `src/__tests__/profileScreen.test.tsx`
- Modify: `src/__tests__/components.test.tsx`

- [ ] **Step 1: Update the tests first (red)**

(a) In `src/__tests__/api/profile.test.tsx`, in the `profileFromRow` "maps DB columns…" test, remove the `gender: 'Prefer not to say',` line from the `expect(result).toEqual({ … })` object.

(b) In `src/__tests__/profileScreen.test.tsx`, in the `jest.mock('@/api/profile', …)` block, remove the `gender: 'Prefer not to say',` line from the mocked `data` object.

(c) In `src/__tests__/components.test.tsx`:
- Remove the import line `import { GenderRow } from '@/components/profile/GenderRow';`
- In the `describe('Profile components', …)` block, remove the entire `it('GenderRow shows current value', …)` test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/api/profile.test.tsx`
Expected: FAIL — `profileFromRow` still returns `gender`, so the `toEqual` no longer matches. This is the meaningful red. (The `components.test.tsx` and `profileScreen.test.tsx` edits don't fail on their own — they just keep those suites consistent once the component and type field are removed in Steps 3–4.)

- [ ] **Step 3: Remove gender from the type and mapper**

(a) In `src/types/fpl.ts`, delete the line `  gender: string;` from the `Profile` interface.

(b) In `src/api/profile.ts`, delete the line `    gender: 'Prefer not to say',` from the object returned by `profileFromRow`.

- [ ] **Step 4: Remove the component and its usage**

(a) Delete the file:

```bash
git rm src/components/profile/GenderRow.tsx
```

(b) In `src/app/(home)/profile.tsx`:
- Remove the import: `import { GenderRow } from '@/components/profile/GenderRow';`
- Remove the gender state + effect:

```tsx
  const [gender, setGender] = useState<string>('');

  useEffect(() => {
    if (profile?.gender) setGender(profile.gender);
  }, [profile?.gender]);
```

- Remove the usage line in the "Personal details" SectionCard:

```tsx
          <GenderRow value={gender} onChange={setGender} tk={tk} />
```

- If `useState`/`useEffect` are now unused in the file, drop them from the React import: change `import React, { useState, useEffect } from 'react';` to `import React from 'react';`. (Verify with the lint/typecheck in Step 5 — `useProfile` is the only remaining hook here, so both should be removable.)

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `npx jest src/__tests__/api/profile.test.tsx src/__tests__/components.test.tsx src/__tests__/profileScreen.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (confirms no dangling `gender` references or unused imports).

- [ ] **Step 6: Commit**

```bash
git add -A src/types/fpl.ts src/api/profile.ts src/app/'(home)'/profile.tsx src/components/profile/GenderRow.tsx src/__tests__/api/profile.test.tsx src/__tests__/profileScreen.test.tsx src/__tests__/components.test.tsx
git commit -m "$(cat <<'EOF'
refactor(profile): remove Gender row from UI and Profile type (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS. If any pre-existing screen test that mounts `Profile` or `Settings` now fails because it transitively imports `@/lib/auth/email` or `@/api/notificationPrefs` without a mock, add the same module mocks used in Tasks 2/4 to that test file. (Known touch points are already handled: `settingsScreen.test.tsx`, `profileScreen.test.tsx`, `components.test.tsx`.)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. Fix any unused-import or `react-hooks` warnings introduced by the edits (most likely the `useState`/`useEffect` removal in `profile.tsx`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification of the Supabase "require current password" toggle**

This cannot be unit-tested — it depends on live GoTrue behavior with the dashboard setting enabled.

1. Run the app (`npm run ios`), sign in with an email/password account.
2. Profile → Change password. Enter a **wrong** current password + a valid new password → expect inline "Current password is incorrect." and no change.
3. Enter the **correct** current password + a valid new password → expect "Password updated".
4. Confirm the new password works on next sign-in, and that other sessions were signed out.
5. If step 3 fails with a reauthentication error, GoTrue requires the nonce flow: add `supabase.auth.reauthenticate()` handling inside `changePassword` between the verify and `updateUser` steps (the UI contract is unchanged). Re-run.

- [ ] **Step 5: Final commit (only if Step 2/4 required code changes)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(settings): lint/typecheck fixes + manual-verification follow-ups (#29)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Change password (T3–T4), notifications (T5–T6), share/feedback/terms (T1–T2), gender removal (T7), Face ID (already wired — no task, verified in `settingsScreen.test.tsx`). All AC rows map to a task except the Phase 4 dispatcher (#36, out of scope).
- **No migration** — `notification_prefs` exists; gender is removed.
- **Type consistency:** `NotificationPrefs` (camelCase, `gwConfirm`) is defined once in `notificationPrefs.ts` and imported by the card; the snake_case `gw_confirm` mapping is confined to that module. `AuthErrorKind`/`Result` are reused from `email.ts`.
- **Placeholder URLs** are intentional and isolated to `src/constants/links.ts` (called out in the spec's non-goals).
