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
      await supabase.auth.signOut();
    },
  };
});
