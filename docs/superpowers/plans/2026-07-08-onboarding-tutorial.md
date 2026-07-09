# First-Run Onboarding Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-tab first-run tip (Top Picks / My Team / Transfer), dismissible and replayable from Settings, per issue #49 and `docs/superpowers/specs/2026-07-08-onboarding-tutorial-design.md`.

**Architecture:** A small zustand store (`onboardingStore.ts`, `persist` + AsyncStorage, mirroring `themeStore.ts`) tracks which tabs have been seen. A single self-sufficient banner component (`TabCoachmark.tsx`, mirroring `OfflineBanner.tsx`'s docked-strip shape and `Skeleton.tsx`'s reduced-motion idiom) is rendered once from `(home)/(tabs)/_layout.tsx`, keyed off that layout's existing `activeTab` state — not duplicated per screen. Settings gets a "Replay tutorial" row that resets the store.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / React 19, expo-router v6, zustand 5 (`persist` middleware), react-native-reanimated ~4.1, TypeScript, Jest (jest-expo preset).

## Global Constraints

- **Read the versioned Expo docs (https://docs.expo.dev/versions/v56.0.0/) before writing any Expo code**, per this repo's `AGENTS.md`. This plan does not add new Expo APIs, but re-check if any step surprises you.
- **React Compiler is ON** — do NOT hand-roll `useMemo`/`useCallback`/`React.memo`.
- **`ApexTokens` gotcha (documented, repo-wide):** the resolved token object returned by `apexTokens(dark, paletteKey)` does **not** have a `surface` key (that only exists on the raw per-palette base object). Use `tk.card` (card background), `tk.cardBorder` (card border), `tk.text`, `tk.faint`, `tk.purple` — all of which **do** exist on `ApexTokens` (`src/constants/apexTokens.ts`). `tsc` catches a wrong key as `undefined`; jest does not.
- **Tests are only collected from `**/__tests__/**/*.test.ts(x)`.** Mirror `src/` under `src/__tests__/`.
- **No AsyncStorage auto-mock exists in this repo's jest config** (checked `package.json`'s `jest` block and `__mocks__/`; only `png/jpg/svg`, `@react-native-community`, `@sentry`, `expo-notifications`, `posthog-react-native` are mocked). Any test that renders a component importing a **real, unmocked** `zustand` `persist` store (which touches `@react-native-async-storage/async-storage` internally) fails with an RCTAsyncStorage-class error. Tests written in this plan mock AsyncStorage generically (`jest.mock('@react-native-async-storage/async-storage', ...)`) wherever they exercise the real `onboardingStore`/`themeStore`. **Task 3 also fixes an existing test** (`navIdentity.test.tsx`) that renders the real `(tabs)/_layout.tsx` and would otherwise break the same way once that layout gains a `TabCoachmark` import.
- **Local jest-after-Metro gotcha:** if you've run `npm start` first, run `watchman shutdown-server` then `npx jest --watchman=false --runInBand --forceExit`. CI is unaffected.
- **`tsc` does not run in jest.** Run `npx tsc --noEmit` before claiming done (Task 4). Ignore only the repo's known pre-existing baseline errors (see memory: ~20 pre-existing errors in 3 test files + Plan-1 Deno files, unrelated to this work).
- **No new dependencies.** `zustand`, `react-native-reanimated`, and `@react-native-async-storage/async-storage` are already installed and already used by `themeStore.ts` / `Skeleton.tsx` / `biometricStore.ts` respectively.
- **End every commit message with:** `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `onboardingStore` — persisted seen-tabs state

**Files:**
- Create: `src/store/onboardingStore.ts`
- Test: `src/__tests__/store/onboardingStore.test.ts`

**Interfaces:**
- Produces: `export type TabKey = 'top-picks' | 'team' | 'transfer';` and `export const useOnboardingStore` — a zustand store with `seen: Record<TabKey, boolean>`, `markSeen(tab: TabKey): void`, `resetAll(): void`. Consumed by Task 2 (`TabCoachmark`) and Task 3 (Settings' Replay row).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/store/onboardingStore.test.ts`:

```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { act } from 'react';
import { useOnboardingStore } from '@/store/onboardingStore';

const ALL_UNSEEN = { 'top-picks': false, team: false, transfer: false } as const;

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ seen: { ...ALL_UNSEEN } });
  });

  it('initialises with every tab unseen', () => {
    expect(useOnboardingStore.getState().seen).toEqual(ALL_UNSEEN);
  });

  it('markSeen flips only the targeted tab', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    const seen = useOnboardingStore.getState().seen;
    expect(seen.team).toBe(true);
    expect(seen['top-picks']).toBe(false);
    expect(seen.transfer).toBe(false);
  });

  it('markSeen on a second tab does not clear the first', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    act(() => useOnboardingStore.getState().markSeen('transfer'));
    const seen = useOnboardingStore.getState().seen;
    expect(seen.team).toBe(true);
    expect(seen.transfer).toBe(true);
    expect(seen['top-picks']).toBe(false);
  });

  it('resetAll clears every tab back to unseen', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    act(() => useOnboardingStore.getState().markSeen('transfer'));
    act(() => useOnboardingStore.getState().resetAll());
    expect(useOnboardingStore.getState().seen).toEqual(ALL_UNSEEN);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/store/onboardingStore.test.ts --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/store/onboardingStore'`.

- [ ] **Step 3: Implement the store**

Create `src/store/onboardingStore.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/store/onboardingStore.test.ts --watchman=false --runInBand --forceExit`
Expected: PASS (4 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/store/onboardingStore.ts src/__tests__/store/onboardingStore.test.ts
git commit -m "feat(onboarding): add persisted per-tab seen-tips store

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `TabCoachmark` banner component

**Files:**
- Create: `src/components/onboarding/TabCoachmark.tsx`
- Test: `src/__tests__/components/onboarding/TabCoachmark.test.tsx`

**Interfaces:**
- Consumes: `useOnboardingStore`, `TabKey` (Task 1); `useThemeStore` (`@/store/themeStore`); `apexTokens` (`@/constants/apexTokens`); `useReducedMotion`, `useA11yAnnounce`, `MAX_FONT_SCALE` (`@/lib/a11y`); `useSharedValue`/`useAnimatedStyle`/`withTiming` (`react-native-reanimated`).
- Produces: `export function TabCoachmark({ tab }: { tab: TabKey }): JSX.Element | null`. Consumed by Task 3 (`(tabs)/_layout.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/onboarding/TabCoachmark.test.tsx`:

```tsx
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { AccessibilityInfo } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { TabCoachmark } from '@/components/onboarding/TabCoachmark';
import { useOnboardingStore } from '@/store/onboardingStore';

describe('<TabCoachmark />', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    useOnboardingStore.setState({ seen: { 'top-picks': false, team: false, transfer: false } });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the tip and testID for an unseen tab', () => {
    const r = render(<TabCoachmark tab="team" />);
    expect(r.getByTestId('coachmark-team')).toBeTruthy();
    expect(r.getByText('Use the chevrons to plan the upcoming gameweek')).toBeTruthy();
  });

  it('shows the Top Picks copy', () => {
    const r = render(<TabCoachmark tab="top-picks" />);
    expect(r.getByText("Swipe between positions, or tap a player to see why we're suggesting them")).toBeTruthy();
  });

  it('shows the Transfer copy, folding in chip-timing guidance', () => {
    const r = render(<TabCoachmark tab="transfer" />);
    expect(
      r.getByText('Tap any player to see who you should bring in — check the chip strip above for Wildcard/Bench Boost timing'),
    ).toBeTruthy();
  });

  it('renders nothing once the tab is marked seen', () => {
    useOnboardingStore.setState({ seen: { 'top-picks': false, team: true, transfer: false } });
    const r = render(<TabCoachmark tab="team" />);
    expect(r.queryByTestId('coachmark-team')).toBeNull();
  });

  it('pressing "Got it" marks the tab seen in the store', async () => {
    const r = render(<TabCoachmark tab="transfer" />);
    fireEvent.press(r.getByText('Got it'));
    await act(async () => {});
    expect(useOnboardingStore.getState().seen.transfer).toBe(true);
  });

  it('consults the reduce-motion setting on mount', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    render(<TabCoachmark tab="top-picks" />);
    expect(spy).toHaveBeenCalled();
  });

  it('still renders when reduce-motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const r = render(<TabCoachmark tab="top-picks" />);
    await act(async () => {});
    expect(r.getByTestId('coachmark-top-picks')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/components/onboarding/TabCoachmark.test.tsx --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/components/onboarding/TabCoachmark'`.

- [ ] **Step 3: Implement `TabCoachmark`**

Create `src/components/onboarding/TabCoachmark.tsx`:

```tsx
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { useReducedMotion, useA11yAnnounce, MAX_FONT_SCALE } from '@/lib/a11y';
import { useOnboardingStore, type TabKey } from '@/store/onboardingStore';

const TIPS: Record<TabKey, string> = {
  'top-picks': "Swipe between positions, or tap a player to see why we're suggesting them",
  team: 'Use the chevrons to plan the upcoming gameweek',
  transfer:
    'Tap any player to see who you should bring in — check the chip strip above for Wildcard/Bench Boost timing',
};

export function TabCoachmark({ tab }: { tab: TabKey }) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const seen = useOnboardingStore((s) => s.seen[tab]);
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const reduced = useReducedMotion();
  const message = TIPS[tab];

  useA11yAnnounce(seen ? null : message);

  // Entrance only, same reduced-motion idiom as Skeleton.tsx's pulse gate:
  // skip the animation setup entirely rather than animate-then-snap.
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(1, { duration: 200 });
  }, [reduced, tab, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (seen) return null;

  return (
    <Animated.View
      testID={`coachmark-${tab}`}
      accessibilityLiveRegion="polite"
      style={[styles.bar, animatedStyle, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}
    >
      <Text style={[styles.text, { color: tk.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {message}
      </Text>
      <Pressable onPress={() => markSeen(tab)} accessibilityRole="button" hitSlop={8}>
        <Text style={[styles.dismiss, { color: tk.purple }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Got it
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 13,
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/components/onboarding/TabCoachmark.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS (7 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/TabCoachmark.tsx src/__tests__/components/onboarding/TabCoachmark.test.tsx
git commit -m "feat(onboarding): add TabCoachmark banner component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire into the tabs layout + add Settings replay row

**Files:**
- Modify: `src/app/(home)/(tabs)/_layout.tsx`
- Modify: `src/app/(home)/settings.tsx`
- Modify: `src/__tests__/settingsScreen.test.tsx`
- Modify: `src/__tests__/components/navIdentity.test.tsx`

**Interfaces:**
- Consumes: `TabCoachmark` (Task 2); `useOnboardingStore` (Task 1).
- Produces: no new exports — this task only wires existing pieces into the screens.

- [ ] **Step 1: Render `TabCoachmark` in the tabs layout**

In `src/app/(home)/(tabs)/_layout.tsx`, add the import after the existing `MAX_FONT_SCALE` import (currently line 13):

```tsx
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { TabCoachmark } from '@/components/onboarding/TabCoachmark';
```

Then insert `<TabCoachmark tab={activeTab} />` between the top-inset spacer and `<Tabs`. The current block (lines 43-46) is:

```tsx
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <Tabs
        initialRouteName="team"
```

Change it to:

```tsx
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <TabCoachmark tab={activeTab} />
      <Tabs
        initialRouteName="team"
```

(`activeTab` is already declared as layout state a few lines above, typed `TabName = 'top-picks' | 'team' | 'transfer'` — structurally identical to `TabCoachmark`'s `TabKey`, so no cast is needed.)

- [ ] **Step 2: Fix `navIdentity.test.tsx` for the new transitive store import**

`navIdentity.test.tsx` renders the real `(tabs)/_layout.tsx` (`TabsLayout`) without mocking `@/store/onboardingStore`. Since `TabCoachmark` now pulls in the real `onboardingStore` (a `zustand` `persist` store backed by `@react-native-async-storage/async-storage`, which this test does not mock), rendering `TabsLayout` would fail with an RCTAsyncStorage-class error. Mock `TabCoachmark` itself out — this test's concerns are the account menu / tab identity, not onboarding tips.

In `src/__tests__/components/navIdentity.test.tsx`, add this mock alongside the existing `jest.mock` calls (after the `expo-router` mock, before the `@/api/profile` mock):

```tsx
jest.mock('@/components/onboarding/TabCoachmark', () => ({
  __esModule: true,
  TabCoachmark: () => null,
}));
```

- [ ] **Step 3: Run the layout-adjacent test to verify it still passes**

Run: `npx jest src/__tests__/components/navIdentity.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS (unchanged — 4 tests green, same as before this task).

- [ ] **Step 4: Add the "Replay tutorial" row to Settings**

In `src/app/(home)/settings.tsx`, add the store import after the `PrivacyCard` import (currently line 16):

```tsx
import { PrivacyCard } from '@/components/settings/PrivacyCard';
import { useOnboardingStore } from '@/store/onboardingStore';
```

Add a selector near the other hooks at the top of `SettingsModal()` (after the `tk` line, currently line 26):

```tsx
  const tk = apexTokens(dark, paletteKey);
  const resetOnboarding = useOnboardingStore((s) => s.resetAll);
```

Add a new `SettingsRow` at the end of the "More" `SectionCard`, immediately after the Terms of Service row (currently ending at line 89, right before the `</SectionCard>` on line 90):

```tsx
          <SettingsRow
            icon={<TutorialIcon color={tk.faint} />}
            label="Replay tutorial"
            onPress={() => {
              resetOnboarding();
              Alert.alert('Tutorial reset', "You'll see the tips again next time you open each tab.");
            }}
            tk={tk}
            showDivider
          />
```

Add a `TutorialIcon` component next to the other icon components (after `PrivacyIcon`, currently ending at line 245):

```tsx
function TutorialIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.45 1.1 1.2 1.1 2.2h5a2.6 2.6 0 011.1-2.2A6 6 0 0012 3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
```

- [ ] **Step 5: Update `settingsScreen.test.tsx`**

`settingsScreen.test.tsx` mocks `@/store/biometricStore` and `@/store/themeStore` wholesale rather than relying on an AsyncStorage mock (the same RCTAsyncStorage-avoidance pattern as Step 2 above). Follow the same convention for `@/store/onboardingStore`.

In `src/__tests__/settingsScreen.test.tsx`, add a mock alongside the existing `@/store/biometricStore` mock (after it, before the `@/store/themeStore` mock, currently around line 26):

```tsx
const mockResetAll = jest.fn();
jest.mock('@/store/onboardingStore', () => ({
  __esModule: true,
  useOnboardingStore: (selector: (s: { resetAll: () => void }) => unknown) =>
    selector({ resetAll: mockResetAll }),
}));
```

In the "More actions" `describe` block's `beforeEach` (currently lines 103-108), add a reset:

```tsx
  beforeEach(() => {
    (shareApp as jest.Mock).mockClear();
    (sendFeedback as jest.Mock).mockClear();
    mockPush.mockClear();
    mockResetAll.mockClear();
    mockIsSupported.mockResolvedValue(false);
  });
```

Add a new test in that same `describe` block, after the existing Privacy-row test:

```tsx
  it('resets onboarding tips when Replay tutorial is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Replay tutorial'));
    expect(mockResetAll).toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run the Settings test to verify it passes**

Run: `npx jest src/__tests__/settingsScreen.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS (all existing tests + the new Replay-tutorial test green).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(home\)/\(tabs\)/_layout.tsx src/app/\(home\)/settings.tsx src/__tests__/settingsScreen.test.tsx src/__tests__/components/navIdentity.test.tsx
git commit -m "feat(onboarding): wire TabCoachmark into tabs + add Settings replay row

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full-suite + type-check verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `watchman shutdown-server; npx jest --watchman=false --runInBand --forceExit`
Expected: All suites pass, including the new `onboardingStore` and `TabCoachmark` suites and the updated `settingsScreen` / `navIdentity` suites.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No NEW errors beyond the repo's known pre-existing baseline (~20 errors in 3 test files + Plan-1 Deno files, unrelated to this work — see project memory `pre-existing-tsc-errors-on-main`). If any other error references a file touched in this plan, fix it — in particular, double-check no `tk.surface`-style typo crept in (see Global Constraints).

- [ ] **Step 3: Lint the changed files (optional but recommended)**

Run: `npm run lint`
Note: `expo lint` may generate an untracked `eslint.config.js` — do NOT commit it. Fix any lint errors in the new/changed files.

- [ ] **Step 4: No commit** (verification only). If Steps 1-3 surfaced fixes, they were committed against the task that owns the file.

---

## Acceptance criteria mapping (issue #49)

- **Tutorial fires on first time visiting each tab post-sign-in** → Task 3 renders `<TabCoachmark tab={activeTab} />` from the tabs layout; Task 1/2 gate it on `seen[tab]`.
- **Skippable** → Task 2's "Got it" press calls `markSeen(tab)` immediately, no forced interaction with underlying content.
- **Replayable from Settings** → Task 3's new "Replay tutorial" row calls `resetAll()`.
