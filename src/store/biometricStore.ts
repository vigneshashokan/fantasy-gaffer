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
