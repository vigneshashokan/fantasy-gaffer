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
