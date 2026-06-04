import { create } from 'zustand';

interface AuthState {
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  signedIn: false,
  signIn:  () => set({ signedIn: true }),
  signOut: () => set({ signedIn: false }),
}));
