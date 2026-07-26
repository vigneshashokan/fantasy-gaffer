import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { identify, reset, track } from '@/lib/analytics';
import { setSentryUser } from '@/lib/monitoring/sentry';
import { deletePushToken } from '@/api/pushTokens';
import { usePushStore } from '@/store/pushStore';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  // Returns the { error } supabase.auth.signOut() resolves with (never
  // throws) so callers that care — currently only LockScreen's escape hatch
  // — can detect a network failure that left the local session intact
  // (supabase.auth.signOut() skips clearing local state when its remote
  // call fails). Callers that don't care just await it, as before.
  signOut: () => Promise<{ error: AuthError | null }>;
}

// The last user id we fired `sign_in` for. PERSISTED, not just module-scoped:
// auth-js re-emits SIGNED_IN from its own session-restore path on every cold
// start, so a flag that died with the process re-counted the same user's
// sign-in on every relaunch and inflated the funnel.
const SIGN_IN_DEDUPE_KEY = 'analytics_last_sign_in_user';
let lastSignInUserId: string | null = null;
const dedupeSeeded: Promise<void> = AsyncStorage.getItem(SIGN_IN_DEDUPE_KEY)
  .then((v) => {
    lastSignInUserId = v;
  })
  .catch(() => {
    /* first launch or unreadable storage — worst case, one extra sign_in */
  });

// Mirrors auth lifecycle into analytics + crash reporting: stitch identity
// across sessions, clear it on sign-out, and record the sign_in funnel event.
// Exported so it can be unit-tested without the module-init subscription.
export async function handleAuthChange(
  event: AuthChangeEvent,
  session: Session | null,
): Promise<void> {
  // Scope on ANY event carrying a session, not just SIGNED_IN. A cold start
  // whose stored access token has already expired — i.e. any launch more
  // than the JWT's hour after the last one — emits INITIAL_SESSION and
  // TOKEN_REFRESHED and never SIGNED_IN at all, so gating on SIGNED_IN left
  // those sessions reporting crashes to Sentry with no user id and sending
  // anonymous PostHog events for a known user.
  if (session) {
    identify(session.user.id);
    setSentryUser(session.user.id);
  }
  if (event === 'SIGNED_IN' && session) {
    await dedupeSeeded;
    if (session.user.id !== lastSignInUserId) {
      const provider = (session.user.app_metadata?.provider as string | undefined) ?? 'unknown';
      track('sign_in', { provider });
      lastSignInUserId = session.user.id;
      AsyncStorage.setItem(SIGN_IN_DEDUPE_KEY, session.user.id).catch(() => {});
    }
  }
  if (event === 'SIGNED_OUT') {
    reset();
    setSentryUser(null);
    lastSignInUserId = null;
    AsyncStorage.removeItem(SIGN_IN_DEDUPE_KEY).catch(() => {});
  }
}

export const useAuthStore = create<AuthState>((set) => {
  // Subscribe once at module init.
  supabase.auth.onAuthStateChange((event, session) => {
    set({ session, hydrated: true });
    // Fire-and-forget: observability must never delay the auth state the
    // router gates on. Ordering inside handleAuthChange is self-contained.
    void handleAuthChange(event, session);
  });

  // Resolve current session so cold-start doesn't wait for an event.
  // If the stored refresh token is invalid (revoked / expired / cleared
  // server-side), `getSession` rejects via Supabase auto-refresh. Catch it
  // and degrade gracefully to signed-out; clear any stale local session.
  const handleSessionError = async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[authStore] getSession failed, treating as signed out:', message);
    // Local-only sign-out: drops the stored session without trying to
    // invalidate on the server (which would fail too).
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* swallow — already in failure recovery */
    }
    set({ session: null, hydrated: true });
  };

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        handleSessionError(error);
        return;
      }
      set({ session: data.session, hydrated: true });
    })
    .catch(handleSessionError);

  return {
    session: null,
    hydrated: false,
    signOut: async () => {
      // Delete this device's push token while still authenticated (RLS), so a
      // signed-out user stops receiving pushes on this device. Best-effort.
      const token = usePushStore.getState().token;
      if (token) {
        try {
          await deletePushToken(token);
        } catch {
          /* swallow — proceed to sign out regardless */
        }
      }
      return await supabase.auth.signOut();
    },
  };
});
