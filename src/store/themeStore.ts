import { Appearance } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaletteKey } from '@/constants/theme';

/** What the user PICKED. `dark` is what that resolves to right now. */
export type ColorScheme = 'system' | 'light' | 'dark';

const systemDark = () => Appearance.getColorScheme() === 'dark';
const resolve = (scheme: ColorScheme) =>
  scheme === 'system' ? systemDark() : scheme === 'dark';

interface ThemeState {
  paletteKey: PaletteKey;
  scheme: ColorScheme;
  /**
   * The RESOLVED light/dark, which is what every consumer reads. Keeping it on
   * the store rather than deriving it at each call site is what let 'system'
   * land without touching the ~50 components that already read `dark`.
   */
  dark: boolean;
  pitchStyle: 'realistic' | 'flat';
  setPaletteKey: (key: PaletteKey) => void;
  setScheme: (scheme: ColorScheme) => void;
  setPitchStyle: (style: 'realistic' | 'flat') => void;
}

/**
 * v0 blobs predate `scheme` and would merge to the 'system' default, silently
 * overriding a choice the user made explicitly. Their `dark` WAS the choice,
 * so read it back as one. Exported only so a test can pin that.
 */
export function migrateThemeState(persisted: unknown, version: number): ThemeState {
  const s = persisted as Partial<ThemeState>;
  if (version >= 1) return s as ThemeState;
  return { ...s, scheme: s.dark ? 'dark' : 'light' } as ThemeState;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      paletteKey:    'classic',
      // A fresh install follows the device, which is also what
      // `userInterfaceStyle: 'automatic'` already does to every native
      // control — so the app and its UIKit bits start out agreeing.
      scheme:        'system',
      dark:          systemDark(),
      pitchStyle:    'realistic',
      setPaletteKey: (key)    => set({ paletteKey: key }),
      setScheme:     (scheme) => set({ scheme, dark: resolve(scheme) }),
      setPitchStyle: (style)  => set({ pitchStyle: style }),
    }),
    {
      name: 'fantasy-gaffer/theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        paletteKey: s.paletteKey,
        scheme: s.scheme,
        dark: s.dark,
        pitchStyle: s.pitchStyle,
      }),
      version: 1,
      migrate: migrateThemeState,
    },
  ),
);

// `dark` is persisted alongside `scheme`, so a restore would otherwise repaint
// in whatever the device was set to when the app was last closed.
useThemeStore.persist.onFinishHydration((s) => {
  if (s?.scheme === 'system') useThemeStore.setState({ dark: systemDark() });
});

// Follow the device while it's running, but only while 'system' is the choice —
// an explicit Light/Dark deliberately ignores the OS.
Appearance.addChangeListener(({ colorScheme }) => {
  if (useThemeStore.getState().scheme !== 'system') return;
  useThemeStore.setState({ dark: colorScheme === 'dark' });
});
