import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaletteKey } from '@/constants/theme';

interface ThemeState {
  paletteKey: PaletteKey;
  dark: boolean;
  pitchStyle: 'realistic' | 'flat';
  setPaletteKey: (key: PaletteKey) => void;
  setDark: (dark: boolean) => void;
  setPitchStyle: (style: 'realistic' | 'flat') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      paletteKey:    'classic',
      dark:          false,
      pitchStyle:    'realistic',
      setPaletteKey: (key)   => set({ paletteKey: key }),
      setDark:       (dark)  => set({ dark }),
      setPitchStyle: (style) => set({ pitchStyle: style }),
    }),
    {
      name: 'fantasy-gaffer/theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        paletteKey: s.paletteKey,
        dark: s.dark,
        pitchStyle: s.pitchStyle,
      }),
    },
  ),
);
