import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIMING_SHOWN_KEY = 'fantasy-gaffer/push-priming-shown';

interface PushState {
  primingShown: boolean;
  hydrated: boolean;
  token: string | null;
  setPrimingShown: () => void;
  setToken: (token: string | null) => void;
}

export const usePushStore = create<PushState>((set) => {
  AsyncStorage.getItem(PRIMING_SHOWN_KEY)
    .then((v) => set({ primingShown: v === 'true', hydrated: true }))
    .catch(() => set({ hydrated: true }));

  return {
    primingShown: false,
    hydrated: false,
    token: null,
    setPrimingShown: () => {
      set({ primingShown: true });
      AsyncStorage.setItem(PRIMING_SHOWN_KEY, 'true').catch(() => {});
    },
    setToken: (token) => set({ token }),
  };
});
