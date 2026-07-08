import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TabKey = 'top-picks' | 'team' | 'transfer';

interface OnboardingState {
  seen: Record<TabKey, boolean>;
  markSeen: (tab: TabKey) => void;
  resetAll: () => void;
}

const INITIAL_SEEN: Record<TabKey, boolean> = {
  'top-picks': false,
  team: false,
  transfer: false,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: INITIAL_SEEN,
      markSeen: (tab) => set((s) => ({ seen: { ...s.seen, [tab]: true } })),
      resetAll: () => set({ seen: INITIAL_SEEN }),
    }),
    {
      name: 'fantasy-gaffer/onboarding-tips',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ seen: s.seen }),
    },
  ),
);
