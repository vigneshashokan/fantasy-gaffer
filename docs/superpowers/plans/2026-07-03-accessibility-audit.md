# Accessibility Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app operable with VoiceOver/TalkBack and usable at large font sizes by adding the missing accessibility metadata, screen-reader announcements, reduced-motion handling, and font-scaling safeguards across the app — without changing its visual design.

**Architecture:** Build three tiny a11y primitives once under `src/lib/a11y/` (a reduced-motion hook, an announce helper + hook, a font-scale constant), fix the shared components (covers ~26 call sites at ~6 edit points), then sweep the remaining per-screen elements. RN's built-in accessibility props only — no new dependency.

**Tech Stack:** React Native 0.81 / Expo SDK 54 / expo-router v6 / TypeScript / Jest (`jest-expo`) + `@testing-library/react-native` v13 / react-native-reanimated.

## Global Constraints

- **React Compiler is ON** — do NOT hand-roll `useMemo`/`useCallback`/`React.memo` for memoization.
- **No new runtime dependencies** — RN built-in accessibility props/APIs only.
- **Do NOT change the visual design.** Contrast/colour retune is out of scope (that is the separate **W7** follow-up PR). This plan is additive a11y metadata + behaviour only.
- **A11y primitives live at `src/lib/a11y/`** and use the `@/` alias like other `src/lib` modules. Barrel export from `src/lib/a11y/index.ts`.
- **`MAX_FONT_SCALE = 1.4`** — the cap for text inside fixed-height controls. Body/content text stays uncapped.
- The **assertive/polite** distinction is carried by the `accessibilityLiveRegion` prop on the element (Android); the `announce()` helper is priority-less (iOS `announceForAccessibility` takes no priority).
- **Follow the existing a11y conventions** already in the code: `accessibilityRole="button"` on pressables, `accessibilityState` for `disabled`/`checked`/`selected`, an explicit `accessibilityLabel` only for **icon-only** controls (a pressable that wraps visible `Text` is already named by that text).
- **Read https://docs.expo.dev/versions/v56.0.0/ before writing any Expo code** (AGENTS.md).
- Tests are only collected under `**/__tests__/**/*.test.ts(x)` mirroring `src/`. **Jest does not type-check — run `npx tsc --noEmit` separately.** Local jest may need `watchman shutdown-server` then `npx jest --watchman=false --runInBand --forceExit`.
- **Commit path-scoped** (never `git add -A`/`git add .`). End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- A screen test "suite failed to run" with an `RCTAsyncStorage` error means the rendered screen transitively imports `@/lib/supabase`; those suites mock the `@/api/*` layer. `src/lib/a11y/*` imports only `react-native`, so it never pulls that chain.

---

### Task 1: A11y primitives (`src/lib/a11y/`)

The shared foundation every later task consumes.

**Files:**
- Create: `src/lib/a11y/constants.ts`
- Create: `src/lib/a11y/announce.ts`
- Create: `src/lib/a11y/useReducedMotion.ts`
- Create: `src/lib/a11y/useA11yAnnounce.ts`
- Create: `src/lib/a11y/index.ts`
- Test: `src/__tests__/lib/a11y/a11y.test.tsx`

**Interfaces:**
- Produces:
  - `MAX_FONT_SCALE: number` (= `1.4`)
  - `announce(message: string): void`
  - `useReducedMotion(): boolean`
  - `useA11yAnnounce(message: string | null | undefined): void`

- [ ] **Step 1: Write the failing test**

`src/__tests__/lib/a11y/a11y.test.tsx`:

```tsx
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { act } from 'react-test-renderer';
import {
  MAX_FONT_SCALE,
  announce,
  useReducedMotion,
  useA11yAnnounce,
} from '@/lib/a11y';

describe('a11y primitives', () => {
  afterEach(() => jest.restoreAllMocks());

  it('MAX_FONT_SCALE is 1.4', () => {
    expect(MAX_FONT_SCALE).toBe(1.4);
  });

  it('announce() forwards non-empty messages to AccessibilityInfo', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce('Hello');
    expect(spy).toHaveBeenCalledWith('Hello');
  });

  it('announce() ignores empty messages', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('useReducedMotion resolves the initial system value', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let value: boolean | undefined;
    function Probe() {
      value = useReducedMotion();
      return null;
    }
    render(<Probe />);
    await act(async () => {});
    expect(value).toBe(true);
  });

  it('useA11yAnnounce announces only when the message changes', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    function Probe({ msg }: { msg: string | null }) {
      useA11yAnnounce(msg);
      return <Text>{msg}</Text>;
    }
    const r = render(<Probe msg={null} />);
    expect(spy).not.toHaveBeenCalled();
    r.rerender(<Probe msg="Saved" />);
    expect(spy).toHaveBeenCalledTimes(1);
    r.rerender(<Probe msg="Saved" />);
    expect(spy).toHaveBeenCalledTimes(1); // unchanged message → no re-announce
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/lib/a11y/a11y.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/a11y'`.

- [ ] **Step 3: Write the primitives**

`src/lib/a11y/constants.ts`:

```ts
// Cap applied to text inside fixed-height controls (buttons, pills, tab bar) so
// large Dynamic Type sizes don't clip. Body/content text stays uncapped.
export const MAX_FONT_SCALE = 1.4;
```

`src/lib/a11y/announce.ts`:

```ts
import { AccessibilityInfo } from 'react-native';

// Single egress for screen-reader announcements (iOS has no live region, so
// status/error changes must be announced imperatively). Priority (polite vs
// assertive) is expressed via the element's `accessibilityLiveRegion` on Android.
export function announce(message: string): void {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}
```

`src/lib/a11y/useReducedMotion.ts`:

```ts
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True when the OS "Reduce Motion" setting is on. Defaults to false (motion) so
// tests and first paint animate normally until the async system value resolves.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
```

`src/lib/a11y/useA11yAnnounce.ts`:

```ts
import { useEffect, useRef } from 'react';
import { announce } from './announce';

// Announces `message` to assistive tech whenever it changes to a new non-empty
// value. Pair with `accessibilityLiveRegion` on the visible element (Android).
export function useA11yAnnounce(message: string | null | undefined): void {
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (message && message !== prev.current) announce(message);
    prev.current = message;
  }, [message]);
}
```

`src/lib/a11y/index.ts`:

```ts
export { MAX_FONT_SCALE } from './constants';
export { announce } from './announce';
export { useReducedMotion } from './useReducedMotion';
export { useA11yAnnounce } from './useA11yAnnounce';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/lib/a11y/a11y.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit   # expect no NEW errors beyond the known baseline
git add src/lib/a11y src/__tests__/lib/a11y/a11y.test.tsx
git commit -m "feat(a11y): reduced-motion, announce, and font-scale primitives (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared-component a11y + font caps

Fix the reusable controls once — this covers the majority of interactive elements and applies the font-scale cap on every fixed-height control.

**Files:**
- Modify: `src/components/ui/PillBtn.tsx`
- Modify: `src/components/forms/SocialBtn.tsx`
- Modify: `src/components/ui/Toggle.tsx`
- Modify: `src/components/settings/SettingsRow.tsx`
- Modify: `src/components/ui/ScreenHeader.tsx`
- Modify: `src/components/forms/Field.tsx`
- Test: `src/__tests__/components/a11ySharedControls.test.tsx`
- Modify (callers passing a Toggle label — see Step 3e): `src/components/settings/BiometricCard.tsx`, `src/components/settings/PrivacyCard.tsx`, `src/components/settings/NotificationsCard.tsx`, and any other `Toggle` call site found via `grep -rln "<Toggle" src`

**Interfaces:**
- Consumes: `MAX_FONT_SCALE` from `@/lib/a11y`.
- Produces: `Toggle` gains a required-in-practice `accessibilityLabel?: string` prop; other component public props unchanged.

- [ ] **Step 1: Write the failing test**

`src/__tests__/components/a11ySharedControls.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { PillBtn } from '@/components/ui/PillBtn';
import { SocialBtn } from '@/components/forms/SocialBtn';
import { Toggle } from '@/components/ui/Toggle';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

describe('shared control accessibility', () => {
  it('PillBtn is a button named by its text children, with font cap', () => {
    const { getByRole } = render(<PillBtn onPress={() => {}}>Continue</PillBtn>);
    const btn = getByRole('button', { name: 'Continue' });
    expect(btn).toBeTruthy();
  });

  it('SocialBtn exposes a descriptive button role', () => {
    const { getByRole } = render(<SocialBtn provider="google" onPress={() => {}} />);
    expect(getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('Toggle is a switch reflecting its checked state and label', () => {
    const { getByRole } = render(
      <Toggle
        value
        onChange={() => {}}
        onColor="#0f0"
        offColor="#333"
        accessibilityLabel="Face ID unlock"
      />,
    );
    const sw = getByRole('switch', { name: 'Face ID unlock' });
    expect(sw.props.accessibilityState?.checked).toBe(true);
  });

  it('ScreenHeader back button is labelled', () => {
    const { getByLabelText } = render(
      <ScreenHeader title="Settings" onBack={() => {}} gradFrom="#111" gradTo="#222" />,
    );
    expect(getByLabelText('Back')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/a11ySharedControls.test.tsx`
Expected: FAIL — no element with role `button`/`switch` found; `Toggle` has no `accessibilityLabel` prop.

- [ ] **Step 3a: PillBtn** — `src/components/ui/PillBtn.tsx`

Add the import and derive the label from string children. Replace the `<Pressable>`/`<Text>` block:

```tsx
import { MAX_FONT_SCALE } from '@/lib/a11y';
// ...
  const a11yLabel = typeof children === 'string' ? children : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
    >
      <Text style={textStyle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {children}
      </Text>
    </Pressable>
  );
```

- [ ] **Step 3b: SocialBtn** — `src/components/forms/SocialBtn.tsx`

```tsx
import { MAX_FONT_SCALE } from '@/lib/a11y';
// ...
  const label = `Continue with ${isGoogle ? 'Google' : 'Apple'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Icon name={provider} color={isGoogle ? '#1a1a1a' : '#fff'} size={22} />
        <Text style={textStyle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
```

- [ ] **Step 3c: Toggle** — `src/components/ui/Toggle.tsx`

Add an `accessibilityLabel` prop and the switch role/state:

```tsx
interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  onColor: string;
  offColor: string;
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
}

export function Toggle({
  value,
  onChange,
  onColor,
  offColor,
  size = 'md',
  accessibilityLabel,
}: ToggleProps) {
  // ...dims unchanged...
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      style={[/* unchanged */]}
    >
      {/* knob unchanged */}
    </Pressable>
  );
}
```

- [ ] **Step 3d: SettingsRow** — `src/components/settings/SettingsRow.tsx`

Add role + label to the row Pressable:

```tsx
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.row,
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
```

Also add `maxFontSizeMultiplier={MAX_FONT_SCALE}` to the two `<Text>` (label + sub) and import `MAX_FONT_SCALE`.

- [ ] **Step 3e: Thread Toggle labels at call sites**

`grep -rln "<Toggle" src` and give each a concrete `accessibilityLabel` matching the adjacent row copy, e.g.:
- Biometric card → `accessibilityLabel="Unlock with Face ID"` (match the card's visible title verbatim if different).
- Privacy/analytics card → `accessibilityLabel="Share anonymous usage data"` (match the visible title).
- Notifications card → `accessibilityLabel="Push notifications"` (match the visible title).

Use the exact visible title text of each toggle's row as its label. If a call site renders the Toggle inside a shared `ToggleRow` wrapper that already receives the title as a prop, thread that prop through as `accessibilityLabel` instead of hardcoding.

- [ ] **Step 3f: ScreenHeader** — `src/components/ui/ScreenHeader.tsx`

```tsx
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Icon name="chevL" color="#fff" size={22} />
          </Pressable>
        ) : (
```

- [ ] **Step 3g: Field** — `src/components/forms/Field.tsx`

Give the `TextInput` an accessible name from its placeholder (the field's visible descriptor):

```tsx
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        // ...rest unchanged...
      />
```

Import `MAX_FONT_SCALE`. (The eye toggle already has role + dynamic label — leave it.)

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/a11ySharedControls.test.tsx`
Expected: PASS (4 tests).
Then run the previously-touched suites to confirm no regression:
Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components.test.tsx src/__tests__/components/PrivacyCard.test.tsx src/__tests__/components/notificationsCardPermission.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/ui/PillBtn.tsx src/components/forms/SocialBtn.tsx src/components/ui/Toggle.tsx src/components/settings/SettingsRow.tsx src/components/ui/ScreenHeader.tsx src/components/forms/Field.tsx src/components/settings/*.tsx src/__tests__/components/a11ySharedControls.test.tsx
git commit -m "feat(a11y): roles, labels, switch state, and font caps on shared controls (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reduced motion

Suppress looping/auto-scroll animation when the OS Reduce-Motion setting is on.

**Files:**
- Modify: `src/components/ui/Skeleton.tsx`
- Modify: `src/app/(home)/(tabs)/team.tsx`
- Modify: `src/app/(home)/(tabs)/top-picks.tsx`
- Test: `src/__tests__/components/skeletonReducedMotion.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from `@/lib/a11y`.

**Note on testability:** reanimated/`Animated` motion is not observable in jest (a rendered animation and a static one look identical to the tree). So the automated test asserts the component *consults the reduce-motion setting* (a real fail-first wiring check — the un-gated `Skeleton` never calls `AccessibilityInfo.isReduceMotionEnabled`) and renders under both states; the actual motion suppression is validated on-device (Task 8 checklist). This is consistent with the repo's existing `skeleton.test.tsx` (asserts height only).

- [ ] **Step 1: Write the failing test**

`src/__tests__/components/skeletonReducedMotion.test.tsx`:

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
import { render } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { Skeleton } from '@/components/ui/Skeleton';

describe('<Skeleton /> reduced motion', () => {
  afterEach(() => jest.restoreAllMocks());

  it('consults the reduce-motion setting on mount', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    render(<Skeleton testID="sk" />);
    expect(spy).toHaveBeenCalled();
  });

  it('still renders when reduce-motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const r = render(<Skeleton testID="sk" />);
    await act(async () => {});
    expect(r.getByTestId('sk')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/skeletonReducedMotion.test.tsx`
Expected: FAIL on "consults the reduce-motion setting" — the current `Skeleton` never calls `AccessibilityInfo.isReduceMotionEnabled` (it has no reduce-motion gating), so the spy is not called.

- [ ] **Step 3a: Skeleton** — `src/components/ui/Skeleton.tsx`

Gate the repeat on reduce-motion; rest at a static visible opacity when reduced:

```tsx
import { useReducedMotion } from '@/lib/a11y';
// ...
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.7);
  useEffect(() => {
    if (reduced) return; // static placeholder — no looping pulse
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity, reduced]);
```

- [ ] **Step 3b: Gameweek carousel** — `src/app/(home)/(tabs)/team.tsx`

Import the hook, read it, and make the programmatic paging honour it:

```tsx
import { useReducedMotion } from '@/lib/a11y';
// ...inside TeamTab, near the other hooks:
  const reduced = useReducedMotion();
// ...in scrollToGw:
  const scrollToGw = (target: number) => {
    const index = target - MIN_GW;
    if (index < 0 || index >= gwList.length) return;
    listRef.current?.scrollToIndex({ index, animated: !reduced });
  };
// ...in the arrow-fade effect, collapse the fade duration when reduced:
  useEffect(() => {
    Animated.timing(arrowOpacity, {
      toValue: arrowsVisible ? 1 : 0,
      duration: reduced ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [arrowsVisible, arrowOpacity, reduced]);
```

- [ ] **Step 3c: Top-picks pager** — `src/app/(home)/(tabs)/top-picks.tsx`

Read `src/app/(home)/(tabs)/top-picks.tsx:60,115-116`. Add `const reduced = useReducedMotion();` near the top hooks and change the programmatic `scrollTo({ ..., animated: true })` (and any `scrollToOffset`/`scrollToIndex` with `animated: true`) to `animated: !reduced`. Import `useReducedMotion` from `@/lib/a11y`.

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/skeletonReducedMotion.test.tsx src/__tests__/gameweekCarousel.test.tsx`
Expected: PASS (the carousel suite still passes — the hook defaults to false, matching prior behaviour).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/ui/Skeleton.tsx "src/app/(home)/(tabs)/team.tsx" "src/app/(home)/(tabs)/top-picks.tsx" src/__tests__/components/skeletonReducedMotion.test.tsx
git commit -m "feat(a11y): honour reduce-motion in skeleton pulse and carousels (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Screen-reader announcements

Give status banners and form errors a live region so screen readers announce them.

**Files:**
- Modify: `src/components/OfflineBanner.tsx`
- Modify: `src/components/team/ApplyAllCard.tsx`
- Modify: `src/app/(onboarding)/signup.tsx`, `signin.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `connect-team.tsx` (form-error Text)
- Modify (lighter, polite live region only): `src/components/transfer/DeadlineBanner.tsx`, `src/components/player/AvailabilityBanner.tsx`, `src/components/ui/SeasonCompleteBanner.tsx`, `src/components/transfer/ConfirmTransferBar.tsx`
- Test: `src/__tests__/components/announcements.test.tsx`
- Modify: `src/__tests__/components/OfflineBanner.test.tsx` (add live-region assertion)

**Interfaces:**
- Consumes: `useA11yAnnounce` from `@/lib/a11y`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/components/announcements.test.tsx`:

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
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { OfflineBanner } from '@/components/OfflineBanner';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('OfflineBanner announcement', () => {
  it('announces and marks a polite live region when offline', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false });
    const r = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <OfflineBanner />
      </SafeAreaProvider>,
    );
    const bar = r.getByTestId('offline-banner');
    expect(bar.props.accessibilityLiveRegion).toBe('polite');
    expect(spy).toHaveBeenCalledWith(
      "You're offline — showing your last saved data",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/announcements.test.tsx`
Expected: FAIL — `accessibilityLiveRegion` is `undefined`; `announceForAccessibility` not called.

- [ ] **Step 3a: OfflineBanner** — `src/components/OfflineBanner.tsx`

```tsx
import { useA11yAnnounce } from '@/lib/a11y';
// ...
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  // ...
  const offline = isConnected === false;
  const message = "You're offline — showing your last saved data";
  useA11yAnnounce(offline ? message : null);
  if (!offline) return null;
  return (
    <View
      testID="offline-banner"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: tk.yellowSoft }]}
    >
      <Text style={[styles.text, { color: tk.text }]}>{message}</Text>
    </View>
  );
}
```

(Note: call `useA11yAnnounce` before the early return so the hook order is stable.)

- [ ] **Step 3b: ApplyAllCard** — `src/components/team/ApplyAllCard.tsx`

Announce the success state and mark the card polite:

```tsx
import { useA11yAnnounce } from '@/lib/a11y';
// ...
  const [confirmed, setConfirmed] = useState(false);
  useA11yAnnounce(confirmed ? 'Changes confirmed. Your team has been updated' : null);
```

Add `accessibilityLiveRegion="polite"` to the outer `<View style={[styles.card, ...]}>`.

- [ ] **Step 3c: Form errors**

In each of `signup.tsx`, `signin.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `connect-team.tsx`: find the error `Text` (the `formError`/`fieldError` node rendered from an `error` state string) and add `accessibilityLiveRegion="assertive"` to it, and call `useA11yAnnounce(error)` once near the top of the component (where `error` is in scope). Example for `signup.tsx` (error text at ~`:256-267`):

```tsx
import { useA11yAnnounce } from '@/lib/a11y';
// near the top of the component body, where `formError`/`error` state exists:
  useA11yAnnounce(formError || null);
// on the error Text:
  <Text
    accessibilityLiveRegion="assertive"
    style={[styles.formError, { color: /* unchanged */ }]}
  >
    {formError}
  </Text>
```

Apply the same shape to the other four screens, using whatever the local error state variable is named (do not rename it).

- [ ] **Step 3d: Other banners (polite live region only)**

Add `accessibilityLiveRegion="polite"` to the root `View` of `DeadlineBanner.tsx`, `AvailabilityBanner.tsx`, `SeasonCompleteBanner.tsx`, and `ConfirmTransferBar.tsx`. No `announce()` call needed for these (they are present-on-mount, not transient), the live region covers Android; they are read on focus by VoiceOver.

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/components/announcements.test.tsx src/__tests__/components/OfflineBanner.test.tsx`
Expected: PASS. Also run the affected onboarding screen suites:
Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/signupScreen.test.tsx src/__tests__/connectTeamScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/OfflineBanner.tsx src/components/team/ApplyAllCard.tsx "src/app/(onboarding)/signup.tsx" "src/app/(onboarding)/signin.tsx" "src/app/(onboarding)/forgot-password.tsx" "src/app/(onboarding)/reset-password.tsx" "src/app/(onboarding)/connect-team.tsx" src/components/transfer/DeadlineBanner.tsx src/components/player/AvailabilityBanner.tsx src/components/ui/SeasonCompleteBanner.tsx src/components/transfer/ConfirmTransferBar.tsx src/__tests__/components/announcements.test.tsx src/__tests__/components/OfflineBanner.test.tsx
git commit -m "feat(a11y): announce offline/confirm/error status via live regions (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Onboarding surface — roles, labels, links, touch targets

Sweep the onboarding screens' remaining interactive elements (W5) and fix the signup legal links + touch targets (W6).

**Files:**
- Modify: `src/app/(onboarding)/index.tsx`
- Modify: `src/app/(onboarding)/signup.tsx`
- Modify: `src/app/(onboarding)/signin.tsx`
- Modify: `src/app/(onboarding)/verify-pending.tsx`
- Modify: `src/app/(onboarding)/connect-team.tsx` (any still-bare Pressables)
- Test: `src/__tests__/onboardingA11y.test.tsx`

**Rule applied throughout:** a `Pressable` whose child is visible `Text` only needs `accessibilityRole="button"` (the text names it). An **icon-only** or **dot** pressable also needs an explicit `accessibilityLabel`. Inline text links inside a sentence stay `Text` (converting to `Pressable` breaks sentence wrapping — the correct RN idiom is `accessibilityRole="link"` on the inline `Text`).

- [ ] **Step 1: Write the failing test**

`src/__tests__/onboardingA11y.test.tsx` — mock the same modules `signupScreen.test.tsx` already mocks (copy its mock header: `expo-router`, `@/store/*`, `@/api/*`, `@react-native-async-storage/async-storage`), then:

```tsx
import { render } from '@testing-library/react-native';
import Signup from '@/app/(onboarding)/signup';

describe('signup legal links a11y', () => {
  it('exposes Terms and Privacy as links', () => {
    const { getByText } = render(<Signup />);
    expect(getByText('Terms of Service').props.accessibilityRole).toBe('link');
    expect(getByText('Privacy Policy').props.accessibilityRole).toBe('link');
  });
});
```

(Match the render/provider setup used by the existing `signupScreen.test.tsx`; if that suite renders through a provider helper, reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/onboardingA11y.test.tsx`
Expected: FAIL — `accessibilityRole` is `undefined` on the link spans.

- [ ] **Step 3a: signup legal links** — `src/app/(onboarding)/signup.tsx:211-223`

Add `accessibilityRole="link"` to both inline link `Text` spans (keep them inline):

```tsx
          <Text
            accessibilityRole="link"
            style={[styles.legalLink, { color: t.accent }]}
            onPress={() => router.push('/legal/terms')}
          >
            Terms of Service
          </Text>
          {/* ...and the Privacy Policy span the same way... */}
          <Text
            accessibilityRole="link"
            style={[styles.legalLink, { color: t.accent }]}
            onPress={() => router.push('/legal/privacy')}
          >
            Privacy Policy
          </Text>
```

The footer "Sign in" link (`:231`) is already a `Pressable` with `hitSlop` — add `accessibilityRole="button"` to it.

- [ ] **Step 3b: onboarding index** — `src/app/(onboarding)/index.tsx:76-98`

- Skip pressable (`:76`) → add `accessibilityRole="button"` (text child "Skip intro" names it).
- Pager dots (`:82`) → add `accessibilityRole="button"`, `accessibilityLabel={`Go to slide ${d + 1}`}`, and `hitSlop={8}` (dots are 8px).
- CTA (`:93`) → add `accessibilityRole="button"` and `accessibilityLabel={last ? 'Sign in' : 'Next'}` (it contains text + an icon).

- [ ] **Step 3c: signin / verify-pending / connect-team**

For each, `grep -n "<Pressable" <file>` and for every bare pressable add `accessibilityRole="button"`; add an explicit `accessibilityLabel` only where the pressable has no visible `Text` child (icon-only). Do not touch the already-covered `connect-team` pressables (they have role + state).

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/onboardingA11y.test.tsx src/__tests__/signupScreen.test.tsx src/__tests__/signinScreen.test.tsx src/__tests__/connectTeamScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add "src/app/(onboarding)/index.tsx" "src/app/(onboarding)/signup.tsx" "src/app/(onboarding)/signin.tsx" "src/app/(onboarding)/verify-pending.tsx" "src/app/(onboarding)/connect-team.tsx" src/__tests__/onboardingA11y.test.tsx
git commit -m "feat(a11y): roles, labels, and link semantics across onboarding (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Tab bar + navigation controls

The custom tab bar (role/selected/label + font cap), the account menu, and the gameweek arrows.

**Files:**
- Modify: `src/app/(home)/(tabs)/_layout.tsx`
- Modify: `src/components/nav/AccountMenu.tsx`
- Modify: `src/components/team/GwNav.tsx`
- Test: `src/__tests__/tabBarA11y.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/__tests__/tabBarA11y.test.tsx` — reuse the mock header from `gameweekCarousel.test.tsx` (it already renders a `(tabs)` screen); render the tab layout and assert the GwNav arrows expose labels. Minimal, dependency-light target:

```tsx
import { render } from '@testing-library/react-native';
import { GwArrow } from '@/components/team/GwNav';

const tk: any = { card: '#111', dark: true, variant: '#ccc' };

describe('GwArrow accessibility', () => {
  it('labels the previous/next paging arrows', () => {
    const prev = render(<GwArrow dir="l" tk={tk} onPress={() => {}} />);
    expect(prev.getByLabelText('Previous gameweek')).toBeTruthy();
    const next = render(<GwArrow dir="r" tk={tk} onPress={() => {}} />);
    expect(next.getByLabelText('Next gameweek')).toBeTruthy();
  });

  it('marks a disabled arrow in its accessibility state', () => {
    const r = render(<GwArrow dir="l" tk={tk} disabled onPress={() => {}} />);
    expect(r.getByLabelText('Previous gameweek').props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/tabBarA11y.test.tsx`
Expected: FAIL — no element labelled "Previous gameweek".

- [ ] **Step 3a: GwNav arrows** — `src/components/team/GwNav.tsx:49-67`

```tsx
    <Pressable
      testID={dir === 'l' ? 'gw-prev' : 'gw-next'}
      disabled={!!disabled}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={dir === 'l' ? 'Previous gameweek' : 'Next gameweek'}
      accessibilityState={{ disabled: !!disabled }}
      style={[/* unchanged */]}
    >
```

Add `maxFontSizeMultiplier={MAX_FONT_SCALE}` to the `GwPill` `pillText` `<Text>` and import `MAX_FONT_SCALE`.

- [ ] **Step 3b: Tab bar** — `src/app/(home)/(tabs)/_layout.tsx:55-95`

For each of the three tab `Pressable`s:

```tsx
                  <Pressable
                    key={tab.name}
                    accessibilityRole="tab"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected: focused }}
                    style={styles.tab}
                    onPress={() => {
                      setActiveTab(tab.name);
                      props.navigation.navigate(tab.name);
                    }}
                  >
```

Add `maxFontSizeMultiplier={MAX_FONT_SCALE}` to the tab `<Text>` label. For the Account pressable (`:86`):

```tsx
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account"
                style={styles.tab}
                onPress={() => setMenuOpen(true)}
              >
```

Add `maxFontSizeMultiplier={MAX_FONT_SCALE}` to its "Account" `<Text>`. Import `MAX_FONT_SCALE` from `@/lib/a11y`.

- [ ] **Step 3c: AccountMenu** — `src/components/nav/AccountMenu.tsx`

- Backdrop dismiss pressable (`:39`) → `accessibilityRole="button"` + `accessibilityLabel="Close menu"`.
- Light/Dark segment pressables (`:71`) → `accessibilityRole="button"` + `accessibilityLabel={mode === 'dark' ? 'Dark theme' : 'Light theme'}` + `accessibilityState={{ selected: active }}`.
- Profile / Settings / Sign out rows (`:98,102,107`) → each gets `accessibilityRole="button"` (visible text names them; no explicit label needed).

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/tabBarA11y.test.tsx src/__tests__/gameweekCarousel.test.tsx src/__tests__/components/navIdentity.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add "src/app/(home)/(tabs)/_layout.tsx" src/components/nav/AccountMenu.tsx src/components/team/GwNav.tsx src/__tests__/tabBarA11y.test.tsx
git commit -m "feat(a11y): tab/selected roles, menu labels, and gameweek arrow labels (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Settings, profile, player detail & misc controls + decorative hiding

The remaining post-auth pressables plus hiding decorative clusters from the a11y tree.

**Files:**
- Modify: `src/app/(home)/settings.tsx` (inline pressables `:98,124,148`)
- Modify: `src/app/(home)/player/[id].tsx` (back chevron `:59`, Close `:47`, Retry `:128`)
- Modify: `src/components/profile/DeleteAccount.tsx`, `src/components/profile/ChangePassword.tsx` (remaining bare pressables)
- Modify: `src/components/picks/PickRow.tsx`, `src/components/notifications/PushPrimingSheet.tsx`, `src/components/settings/FollowUsRow.tsx`, `src/components/transfer/TransferTargetsHeader.tsx`, `src/components/team/TeamIdInput.tsx`
- Modify (decorative → hidden): `src/components/onboarding/SlideVisual.tsx`, plus the glow/pitch decoration `View`s in `src/app/(onboarding)/index.tsx`
- Test: `src/__tests__/playerDetailA11y.test.tsx`

**Icon-only labels to use (explicit):**
- `player/[id].tsx` back chevron (`:59`) → `accessibilityLabel="Back"`, `accessibilityRole="button"`.
- `player/[id].tsx` "Close" (`:47`) and "Retry" (`:128`) contain visible text → `accessibilityRole="button"` only.
- `PushPrimingSheet` close/dismiss icon → `accessibilityLabel="Dismiss"` (confirm from the file; if it is a text button, role only).
- `TransferTargetsHeader` icon button → label it from its purpose visible in the file (e.g. `"Close"`/`"Filter"`); if it wraps text, role only.
- `TeamIdInput` icon button → label from its purpose (e.g. `"Clear"`/`"Help"`); role only if it wraps text.

**Rule (same as Task 5):** text-child pressables → `accessibilityRole="button"`; icon-only → role + explicit label; toggle-like → role `switch` + state.

- [ ] **Step 1: Write the failing test**

`src/__tests__/playerDetailA11y.test.tsx` — reuse the mock header from the existing player-detail test if present (`grep -rl "player/\[id\]" src/__tests__`); otherwise mock `expo-router` (`useRouter`, `useLocalSearchParams`), `@/store/themeStore`, and the player/clubs/summary `@/api/*` hooks the screen calls. Assert:

```tsx
import { render } from '@testing-library/react-native';
import PlayerDetail from '@/app/(home)/player/[id]';

describe('player detail a11y', () => {
  it('labels the back control', () => {
    const { getByLabelText } = render(<PlayerDetail />);
    expect(getByLabelText('Back')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/playerDetailA11y.test.tsx`
Expected: FAIL — no element labelled "Back".

- [ ] **Step 3a: player/[id].tsx** — add role/label to back chevron, Close, Retry as above.

- [ ] **Step 3b: settings inline pressables** (`:98,124,148`) — `grep -n "<Pressable" src/app/\(home\)/settings.tsx`; add `accessibilityRole="button"` to each; explicit label only if icon-only.

- [ ] **Step 3c: DeleteAccount / ChangePassword / PickRow / PushPrimingSheet / FollowUsRow / TransferTargetsHeader / TeamIdInput** — apply the rule per file; use the icon-only labels listed above.

- [ ] **Step 3d: Decorative hiding** — on the `SlideVisual` root wrapper and the glow/pitch decoration `View`s (non-interactive, purely visual), add:

```tsx
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
```

so screen readers skip them. Do **not** hide anything that carries meaningful text or is interactive.

- [ ] **Step 4: Run tests**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/playerDetailA11y.test.tsx src/__tests__/components/PickRow.test.tsx src/__tests__/components/PushPrimingSheet.test.tsx src/__tests__/settingsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add "src/app/(home)/settings.tsx" "src/app/(home)/player/[id].tsx" src/components/profile/DeleteAccount.tsx src/components/profile/ChangePassword.tsx src/components/picks/PickRow.tsx src/components/notifications/PushPrimingSheet.tsx src/components/settings/FollowUsRow.tsx src/components/transfer/TransferTargetsHeader.tsx src/components/team/TeamIdInput.tsx src/components/onboarding/SlideVisual.tsx "src/app/(onboarding)/index.tsx" src/__tests__/playerDetailA11y.test.tsx
git commit -m "feat(a11y): roles/labels on post-auth controls; hide decorative clusters (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Conventions doc + manual validation checklist

Document the standardized props and the on-device validation the ACs require.

**Files:**
- Create: `docs/a11y.md`

- [ ] **Step 1: Write `docs/a11y.md`**

Include exactly these sections:

1. **Conventions** — a table of control type → required props:
   - Text button → `accessibilityRole="button"` (named by its text).
   - Icon-only button → `role="button"` + explicit `accessibilityLabel`.
   - Toggle → `role="switch"` + `accessibilityState={{ checked }}` + `accessibilityLabel`.
   - Tab → `role="tab"` + `accessibilityState={{ selected }}` + label.
   - Inline text link → `accessibilityRole="link"` on the `Text` span.
   - Status banner / form error → `accessibilityLiveRegion` (`polite`/`assertive`) + `useA11yAnnounce`.
   - Fixed-height control text → `maxFontSizeMultiplier={MAX_FONT_SCALE}`.
   - Decorative view → `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`.
2. **Primitives** — how to use `useReducedMotion`, `useA11yAnnounce`, `announce`, `MAX_FONT_SCALE` from `@/lib/a11y`.
3. **Manual validation checklist** (the ACs jest can't exercise):
   - [ ] VoiceOver (iOS) walk-through: onboarding slides → sign in → connect team → each tab (Top Picks / My Team / Transfer) → account menu → settings → profile → player detail → sign out. Every control is announced with a sensible role + name; focus order is logical; modals trap focus.
   - [ ] TalkBack (Android) spot-check of the same main flow.
   - [ ] Reduce Motion ON: skeleton pulse is static; gameweek/top-picks paging jumps without a slide animation.
   - [ ] Large Dynamic Type (max accessibility size): buttons/pills/tab bar don't clip text; content remains readable.
   - [ ] Accessibility Inspector (Xcode) audit run on the main screens — **note:** contrast warnings are addressed in the separate **W7 contrast** PR, not here.
   - [ ] expo-web build → Lighthouse accessibility score ≥ 90 (`npm run web`, then Lighthouse on the served pages).
4. **Out of scope (tracked separately):** W7 colour-contrast retune.

- [ ] **Step 2: Commit**

```bash
git add docs/a11y.md
git commit -m "docs(a11y): conventions and manual validation checklist (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full suite: `watchman shutdown-server; npx jest --watchman=false --runInBand --forceExit`
- [ ] Typecheck: `npx tsc --noEmit` — no NEW errors beyond the known ~23-error baseline (pre-existing test/Deno files).
- [ ] `npm run lint` (do not commit any auto-generated `eslint.config.js`).
- [ ] Confirm no visual/colour token was changed (W7 is a separate PR) and no new runtime dependency was added.
