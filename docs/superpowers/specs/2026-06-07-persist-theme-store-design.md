# Persist Theme Store — Design Spec

**Issue:** [#12 — Persist theme/palette/pitchStyle via AsyncStorage](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/12)
**Date:** 2026-06-07
**Status:** Approved

---

## Purpose

`useThemeStore` (Zustand) currently resets to defaults on every cold start. Add Zustand's `persist` middleware backed by AsyncStorage so the user's theme choices (`paletteKey`, `dark`, `pitchStyle`) survive across app launches, with no visible flash of the default theme during hydration.

This is purely client-side — no backend changes, no migrations, no new dependencies (both AsyncStorage 2.2.0 and Zustand 5.0.14 were installed by earlier issues).

## Scope

In scope:

- Wrap `useThemeStore` with `persist` middleware writing to AsyncStorage under key `fpl-gaffer/theme`.
- Whitelist only `paletteKey`, `dark`, `pitchStyle` via `partialize` (setters are functions and never serialized regardless).
- Gate root-layout render on store rehydration so the first frame shows the persisted theme, not the defaults.
- Update the existing themeStore tests to mock AsyncStorage so persist's write-through doesn't error in jest.

Out of scope:

- Persisting other stores (e.g. `useTeamStore` — that holds ephemeral pending-changes state and should reset on cold start).
- Wiring `dark` to system dark mode (`Appearance.getColorScheme()`). The store keeps its current behavior — `dark` is a manual toggle set via AccountMenu.
- Adding a hydration spinner. The existing splash screen fills that role.
- Migration / versioning. Zustand's default `version: 0` is fine for the initial persist; we'll add `version + migrate` only when the persisted shape changes incompatibly.

## Architecture

Three small surface changes:

1. **`src/store/themeStore.ts`** — wrap the existing store factory in `persist(...)`, passing a `partialize` that returns only the three persistable fields.
2. **`src/app/_layout.tsx`** — extend the existing fonts-load gate so render is blocked on both `fontsLoaded` AND `themeHydrated`. The splash screen (already managed via `SplashScreen.preventAutoHideAsync` + `hideAsync`) stays up the whole time.
3. **`src/__tests__/stores.test.ts`** — add a file-scope `jest.mock` for `@react-native-async-storage/async-storage` so existing `useThemeStore.setState({...})` calls in `beforeEach` don't blow up when persist writes through.

No new files. No new dependencies.

## Detailed Design

### `src/store/themeStore.ts`

```ts
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
      paletteKey: 'classic',
      dark: false,
      pitchStyle: 'realistic',
      setPaletteKey: (key) => set({ paletteKey: key }),
      setDark: (dark) => set({ dark }),
      setPitchStyle: (style) => set({ pitchStyle: style }),
    }),
    {
      name: 'fpl-gaffer/theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        paletteKey: s.paletteKey,
        dark: s.dark,
        pitchStyle: s.pitchStyle,
      }),
    },
  ),
);
```

The `create<ThemeState>()(...)` double-call form is Zustand 5's TypeScript pattern for middleware composition — without the trailing `()` the inferred types lose the persist API.

### `src/app/_layout.tsx`

Additions (existing fonts logic stays):

```ts
import { useThemeStore } from '@/store/themeStore';

// inside RootLayout:
const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());

useEffect(() => {
  if (themeHydrated) return;
  return useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true));
}, [themeHydrated]);

useEffect(() => {
  if (fontsLoaded && themeHydrated) SplashScreen.hideAsync();
}, [fontsLoaded, themeHydrated]);

if (!fontsLoaded || !themeHydrated) return null;
```

The existing `useEffect` that calls `SplashScreen.hideAsync()` on `fontsLoaded` is replaced by the version above (gated on both signals).

`hasHydrated()` is checked synchronously on first render — for repeat renders within the same session, hydration has already finished and we render immediately. `onFinishHydration` returns an unsubscribe function (returned from the effect for cleanup).

### `src/__tests__/stores.test.ts`

Add at file scope, above the `describe` blocks:

```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));
```

This mirrors the pattern already used in `src/__tests__/supabase.test.ts`. Existing test bodies stay unchanged — they still pass because `setState({...})` calls succeed and the mock's `setItem` swallows the persist write.

## Hydration Lifecycle

```
Cold start
  │
  ├─ SplashScreen.preventAutoHideAsync()  (already called at module load)
  │
  ├─ RootLayout renders
  │   ├─ useFonts kicks off async font load        → fontsLoaded = false
  │   └─ Zustand persist kicks off async read      → themeHydrated = false
  │   └─ returns null (splash stays visible)
  │
  ├─ Fonts finish loading                          → fontsLoaded = true (re-render)
  ├─ Persist read completes, store hydrates        → themeHydrated = true (re-render)
  │   └─ useEffect fires: both true → SplashScreen.hideAsync()
  │
  └─ App renders with persisted theme from the first visible frame
```

Race-condition note: persist hydration and font loading are independent and either may finish first. The two effects converge on the splash-hide call only once both have completed.

## Acceptance Criteria

From issue #12, mapped to verification:

| Criterion | Where verified |
|---|---|
| Changing palette in Settings → kill app → relaunch → palette is preserved | Manual smoke test after merge |
| Same for dark mode toggle from AccountMenu | Manual smoke test |
| No flash of wrong theme on cold start | Manual cold-start observation; architecturally guaranteed by the render gate |

## Out-of-Scope Follow-Ups

- **System dark mode integration.** A separate ticket can wire `dark` to `Appearance.getColorScheme()` with an "automatic" option. Not this issue.
- **AsyncStorage encryption.** Theme prefs are non-sensitive; no need for encrypted storage.
- **Multi-device sync.** Theme is a per-device choice in this app's model (see #11's discussion of device-cache-only). No server-side persistence.
- **`useTeamStore` persistence.** Pending squad changes intentionally do not survive cold start — they're transient editor state.

## Risks

- **AsyncStorage corruption / first-launch failure.** If the persist read errors (rare — AsyncStorage is robust), Zustand keeps the in-memory defaults and `onFinishHydration` still fires. The app loads with default theme; the next setter call writes a fresh row. Acceptable failure mode.
- **Jest test brittleness.** If a future test imports `useThemeStore` without the AsyncStorage mock in place, that test file will throw at module load. Mitigation: extract the mock into a Jest setup file if a third test file ever needs it (YAGNI for now — only `stores.test.ts` and `supabase.test.ts` touch this).
