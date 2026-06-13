# Wire Settings & Profile Actions to Backend — Design

**Issue:** [#29 — [Phase 2] Wire Settings actions to backend](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/29)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-06-13

## Goal

The Settings and Profile screens ship several rows whose `onPress`/`submit` handlers are no-ops today. Wire each one to its real backend or platform API: change password, notification preferences, share, send feedback, terms. Remove the Gender row (no product value). Each action gets a loading state and inline error feedback.

## Reframing the issue

The issue body specifies REST endpoints — `PATCH /account/password`, `PATCH /profile`, `PATCH /notification-prefs`, etc. **No such API exists.** This app talks to Supabase directly with RLS (`supabase.auth.*`, table updates) and React Query; there is no custom REST tier. Every "PATCH /x" maps to its Supabase-native equivalent. The endpoint names in the ticket are aspirational and are not built.

## Scope decisions (from brainstorming)

- **Gender → removed**, not wired. No `gender` column exists; the field added no value. Strip it from UI, the `Profile` type, `profileFromRow`, and tests. This removes the only would-be migration.
- **Blocked externals → placeholder URLs.** Terms depends on the legal page (#46) and Share depends on a published App Store listing. Both are wired now against constants in one file (`src/constants/links.ts`); real values drop in later with no screen changes.
- **Send Feedback → `mailto:`.** No in-app form, no feedback table.
- **Error/loading UX → inline**, matching the existing `ChangePassword`/`GenderRow` patterns and the `Result<T>` convention in `src/lib/auth/email.ts`. No new Toast component.
- **Change password → verify current, then update.** The user has enabled Supabase's *"require current password when updating"* (secure password change). Our flow reauthenticates via `signInWithPassword`, which both verifies the current password and freshens the session.

## Non-goals

- **No DB migration.** `notification_prefs` already exists (`supabase/migrations/20260607000000_initial_schema.sql`); gender is being removed, not added.
- **No Toast/snackbar infrastructure.** Inline states only.
- **No Face ID work.** The toggle is already fully wired via `biometricStore` + `src/lib/auth/biometric/enrollment.ts` (#18). It lives in Settings (`BiometricCard`), not Profile as the ticket implies. This design treats it as verified-only.
- **No in-app feedback form or `feedback` table.** Deferred unless a real need appears.
- **No real legal/store URLs.** Placeholder constants only; swapping them is a one-line change isolated to `links.ts`.
- **No notification *dispatch* logic.** Persisting prefs is in scope; respecting them in the push sender is Phase 4 (#36).

## Architecture

```
PROFILE SCREEN                          SETTINGS SCREEN
──────────────                          ───────────────
ChangePassword ──┐                      NotificationsCard ──┐
                 │                       (toggles)          │
GenderRow  ✗ removed                    BiometricCard  ✓ already wired (#18)
                 │                       Share row ──────────┤
                 ▼                       Feedback row ───────┤
   src/lib/auth/email.ts                 Terms row ──────────┤
   changePassword(cur, next)                                 │
     1. signInWithPassword(cur)  ← verify + reauth           ▼
     2. updateUser({password})                     src/lib/external.ts
     3. signOut({scope:'others'})                   shareApp() / sendFeedback() / openTerms()
        (best effort)                                  │  │            │
                                                       │  │            └─ WebBrowser.openBrowserAsync(TERMS_URL)
                 │                                      │  └─ Linking.openURL('mailto:'+FEEDBACK_EMAIL)
                 ▼                                      └─ Share.share({message,url: APP_STORE_URL})
   Supabase Auth (GoTrue)
                                        src/api/notificationPrefs.ts
                                          useNotificationPrefs()        → SELECT notification_prefs
                                          useUpdateNotificationPrefs()  → UPSERT (optimistic + rollback)
                                                       │
                                                       ▼
                                        Supabase Postgres (RLS: own row)
```

**Invariants:**
- **All network access stays in `src/api/*` and `src/lib/auth/*`.** Screens/components call hooks and helpers, never `supabase` directly (matches the existing data-layer rule).
- **Cache keys live only in `queryKeys.ts`.** One new key: `notificationPrefs(userId)`.
- **Placeholder externals are isolated to `src/constants/links.ts`.** Nothing else references the raw URLs/email.

## New modules

```
src/constants/links.ts          APP_STORE_URL, TERMS_URL, FEEDBACK_EMAIL (placeholders)
src/lib/external.ts             shareApp(), sendFeedback(), openTerms() helpers
src/api/notificationPrefs.ts    useNotificationPrefs() query + useUpdateNotificationPrefs() mutation
```

### `src/constants/links.ts`

```ts
// Placeholder externals. Swap in real values when #46 (legal page) ships
// and the app is published. Nothing else in the app references these URLs.
export const APP_STORE_URL = 'https://fplgaffer.app';          // TODO(#?) real store listing
export const TERMS_URL     = 'https://fplgaffer.app/terms';    // TODO(#46) real legal page
export const FEEDBACK_EMAIL = 'feedback@fplgaffer.app';        // TODO real support inbox
```

### `src/lib/external.ts`

Thin wrappers so screens stay declarative and the platform calls are unit-testable behind mocks.

```ts
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
  if (!can) return { ok: false };          // caller shows fallback Alert
  await Linking.openURL(url);
  return { ok: true };
}

export async function openTerms(): Promise<void> {
  await WebBrowser.openBrowserAsync(TERMS_URL);
}
```

`expo-web-browser` and `expo-linking` are already dependencies (used by Google OAuth / deep links). `react-native`'s `Share` is built in. **No new packages** — the ticket's suggested `expo-sharing` is for sharing local *files*; sharing a URL/text is the RN `Share` API's job.

### `src/api/notificationPrefs.ts`

Mirrors `src/api/linkTeam.ts` (user-id from `useAuthStore`, user-scoped cache key). Column map: UI `gwConfirm` ↔ DB `gw_confirm`; the other three names match.

```ts
export interface NotificationPrefs {
  deadlines: boolean;
  prices: boolean;
  gwConfirm: boolean;
  transfer: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  deadlines: true, prices: true, gwConfirm: true, transfer: false, // matches DB defaults
};

export function useNotificationPrefs() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: queryKeys.notificationPrefs(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('deadlines, prices, gw_confirm, transfer')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PREFS;          // row created at profile completion; defensive fallback
      return {
        deadlines: data.deadlines, prices: data.prices,
        gwConfirm: data.gw_confirm, transfer: data.transfer,
      };
    },
    staleTime: Infinity,                         // toggles drive cache; refetch is rare
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const key = queryKeys.notificationPrefs(userId ?? 'anon');

  return useMutation<void, PostgrestErrorShape, Partial<NotificationPrefs>>({
    mutationFn: async (patch) => {
      if (!userId) throw new Error('No authenticated user') as unknown as PostgrestErrorShape;
      const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
      if ('deadlines' in patch) row.deadlines = patch.deadlines;
      if ('prices'    in patch) row.prices    = patch.prices;
      if ('gwConfirm' in patch) row.gw_confirm = patch.gwConfirm;
      if ('transfer'  in patch) row.transfer  = patch.transfer;
      // upsert: self-heals if the row is somehow missing.
      const { error } = await supabase
        .from('notification_prefs')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw error as PostgrestErrorShape;
    },
    // Optimistic: patch the cache, roll back on error.
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

`upsert(onConflict: 'user_id')` over `update` is the one deliberate deviation from `linkTeam`'s `update`: the `notification_prefs` row should always exist (created during profile completion per `docs/schema.md`), but a missing row should self-heal rather than silently no-op.

### `src/lib/auth/email.ts` — add `changePassword`

Reuses the existing `classify()` / `Result<T>` machinery in the same file. Sequenced so a wrong current password is caught before any mutation.

```ts
export async function changePassword(current: string, next: string): Promise<Result> {
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes.user?.email;
  if (!email) return { ok: false, error: 'unknown' };

  // 1. Verify current password AND freshen the session (satisfies Supabase
  //    "secure password change" / require-current-password).
  const verify = await supabase.auth.signInWithPassword({ email, password: current });
  if (verify.error) return { ok: false, error: classify(verify.error) }; // → invalid_credentials

  // 2. Update to the new password.
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: classify(error) };               // → weak_password, etc.

  // 3. Best-effort: invalidate other devices (same as resetPassword()).
  try { await supabase.auth.signOut({ scope: 'others' }); }
  catch (e) { console.warn('[auth] signOut(others) after password change failed (non-fatal):', e); }

  return { ok: true, value: undefined };
}
```

> ⚠️ **Implementation-time verification required.** The exact contract of Supabase's *"require current password when updating"* toggle must be confirmed by a manual test with the setting ON. The expectation: reauthenticating via `signInWithPassword` (step 1) satisfies it and step 2 succeeds. If GoTrue instead demands the `auth.reauthenticate()` nonce (email OTP) flow, it slots into this same function between steps 1 and 2 — the UI contract (`changePassword(current, next) → Result`) does not change. This is a known unknown, surfaced rather than assumed.

**Auth-event side effects (expected, benign).** Step 1 (`signInWithPassword`) fires a `SIGNED_IN` event and step 2 (`updateUser`) fires `USER_UPDATED`. The existing `AuthCacheClear` listener clears the React Query cache on both, and `biometricStore` re-persists the refreshed session if biometrics are on. Net effect: after a successful change, app queries refetch and the stored biometric session stays valid. No action needed, but tests that mount the screen should expect these events to fire.

## Component wiring

### `ChangePassword.tsx` (Profile)

Add `saving` and `error` state; replace the fake `submit`:

```ts
const [saving, setSaving] = useState(false);
const [error, setError] = useState<AuthErrorKind | null>(null);

const submit = async () => {
  setSaving(true); setError(null);
  const r = await changePassword(cur, nw);
  setSaving(false);
  if (!r.ok) { setError(r.error); return; }
  setDone(true); setOpen(false); reset();
};
```

- **Loading:** button disabled + label "Updating…" while `saving`.
- **Error copy** (inline, in the existing error-text slot):
  | `AuthErrorKind` | Copy |
  |---|---|
  | `invalid_credentials` | "Current password is incorrect." |
  | `weak_password` | "New password is too weak." |
  | `network` | "No connection — try again." |
  | `rate_limited` | "Too many attempts — try again shortly." |
  | other | "Couldn't update password — try again." |
- Existing `mismatch` and `done` rows are unchanged. Clear `error` when any field changes.

### `NotificationsCard.tsx` (Settings)

Replace local `useState` with the query/mutation. Accordion open/close stays local.

- Source of truth: `useNotificationPrefs()`. While `isPending`, render the rows from `DEFAULT_PREFS` with toggles disabled (no layout shift).
- Each toggle → `mutate({ [key]: value })`; cache updates optimistically.
- "All notifications" → `mutate({ deadlines: v, prices: v, gwConfirm: v, transfer: v })`.
- On mutation error: optimistic rollback (handled in the hook) + a single inline error line under the card header, e.g. "Couldn't save — try again." Cleared on the next successful mutation.
- The `summary` ("All on" / "N of 4 on" / "All off") derives from the query data.

### `settings.tsx` — Share / Feedback / Terms rows

Replace the three `onPress`:

```ts
onPress={() => { shareApp().catch(() => {}); }}                       // Share
onPress={async () => {                                                // Feedback
  const { ok } = await sendFeedback();
  if (!ok) Alert.alert('No mail app', `Email us at ${FEEDBACK_EMAIL}`);
}}
onPress={() => { openTerms().catch(() => {}); }}                      // Terms
```

These are one-shot platform handoffs: try/catch, user-cancel is a no-op, and the only realistic hard failure (no mail client) gets a graceful `Alert` fallback. `Alert` is already imported in `settings.tsx`.

### Gender removal

| File | Change |
|---|---|
| `src/components/profile/GenderRow.tsx` | **Delete.** |
| `src/app/(home)/profile.tsx` | Remove `GenderRow` import, `gender` state, the `useEffect`, and the `<GenderRow />` usage. |
| `src/types/fpl.ts` | Remove `gender: string;` from `Profile`. |
| `src/api/profile.ts` | Remove `gender: 'Prefer not to say'` from `profileFromRow`. |
| `src/__tests__/profileScreen.test.tsx` | Remove `gender` from the profile mock. |
| `src/__tests__/api/profile.test.tsx` | Remove `gender` from the expected object. |
| `src/__tests__/components.test.tsx` | Remove the `GenderRow` import and its test case. |

## Error / loading UX summary

| Action | Loading | Failure |
|---|---|---|
| Change password | Button "Updating…", disabled | Inline error text, mapped from `AuthErrorKind` |
| Notifications | Toggles disabled until first load | Optimistic rollback + inline "Couldn't save" line |
| Share | — (system sheet) | Silent (user-cancel is normal) |
| Send Feedback | — | Alert fallback only if no mail app |
| Terms | — (in-app browser) | Silent |

## Testing strategy

`jest-expo`; tests in `src/__tests__/`. Mock `supabase` and the platform libs at module boundaries.

| File | Coverage |
|---|---|
| `src/__tests__/auth/changePassword.test.ts` | Verify-then-update order: wrong current password (`signInWithPassword` errors) → `invalid_credentials`, `updateUser` never called. Success path calls `updateUser` then `signOut({scope:'others'})`. `updateUser` weak-password error → `weak_password`. |
| `src/__tests__/api/notificationPrefs.test.tsx` | Query maps `gw_confirm → gwConfirm`; missing row → `DEFAULT_PREFS`. Mutation builds the correct partial row (incl. `gw_confirm` rename + `updated_at`), upserts, optimistically patches the cache, and rolls back on error. |
| `src/__tests__/lib/external.test.ts` | `sendFeedback` returns `{ok:false}` when `canOpenURL` is false and doesn't call `openURL`; builds the right `mailto:` string otherwise. `shareApp` calls `Share.share` with the store URL. `openTerms` calls `WebBrowser.openBrowserAsync(TERMS_URL)`. |
| `src/__tests__/components.test.tsx` | `ChangePassword`: wrong-current-password shows inline error and stays open; success shows the "Password updated" row. `NotificationsCard`: reflects fetched values and calls the mutation on toggle. **Remove** the `GenderRow` test. |
| `src/__tests__/profileScreen.test.tsx`, `src/__tests__/api/profile.test.tsx` | Drop `gender` from mocks/expectations (gender removed). |

## Acceptance-criteria mapping

| Issue #29 criterion | How this design satisfies it |
|---|---|
| Each action posts to backend or invokes the correct platform API | Password → `auth.updateUser`; Notifications → `notification_prefs` upsert; Share → RN `Share`; Feedback → `mailto:`; Terms → in-app browser. Gender dropped by decision. Face ID already wired (#18). |
| Loading states + error toasts on failure | Inline loading + inline error (per the brainstormed UX decision; no Toast component). Platform handoffs use Alert fallback where a hard failure is possible. |
| Notification prefs respected by the dispatcher (Phase 4 #36) | Out of scope here — this issue only persists the prefs; #36 consumes them. |

## File inventory

**Added:**
- `src/constants/links.ts`
- `src/lib/external.ts`
- `src/api/notificationPrefs.ts`
- `src/__tests__/auth/changePassword.test.ts`
- `src/__tests__/api/notificationPrefs.test.tsx`
- `src/__tests__/lib/external.test.ts`

**Modified:**
- `src/lib/auth/email.ts` — add `changePassword()`
- `src/api/queryKeys.ts` — add `notificationPrefs(userId)`
- `src/components/profile/ChangePassword.tsx` — wire `submit` + loading/error
- `src/components/settings/NotificationsCard.tsx` — query/mutation wiring
- `src/app/(home)/settings.tsx` — Share / Feedback / Terms `onPress`
- `src/app/(home)/profile.tsx` — remove Gender row usage
- `src/types/fpl.ts` — drop `Profile.gender`
- `src/api/profile.ts` — drop `gender` from `profileFromRow`
- `src/__tests__/{profileScreen,api/profile,components}.test.tsx` — gender cleanup + new assertions

**Deleted:**
- `src/components/profile/GenderRow.tsx`

## Follow-up

- #46 — legal page; swap `TERMS_URL` when live.
- Published store listing; swap `APP_STORE_URL`.
- #36 — notification dispatcher consumes the persisted prefs.
- Manual verification of the Supabase "require current password" toggle behavior during implementation (see the ⚠️ note under `changePassword`).
