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
