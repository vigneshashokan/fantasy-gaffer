# First-run onboarding tutorial — Design

**Issue:** [#49 — [Phase 5] First-run onboarding tutorial](https://github.com/vigneshashokan/fantasy-gaffer/issues/49)
**Status:** Approved, ready for implementation plan
**Authors:** @vigneshashokan (with Claude)
**Date:** 2026-07-08

## Goal

New users land on three unfamiliar tabs (Top Picks, My Team, Transfer) right after sign-in with no guidance on what each does or how chip timing fits in. Add a lightweight, per-tab tip the first time each tab is visited, dismissible and replayable from Settings.

## Scope decisions (from brainstorming)

- **No in-app squad builder exists**, so the issue's "after sign-in + squad setup" trigger is reinterpreted as: **first visit to each of the 3 existing tabs, post-sign-in.** Onboarding today ends at connect-team / Team-ID import, then redirects straight into `(home)/(tabs)/team`.
- **Banner tip, not a true anchored spotlight+arrow.** A dismissible strip near the top of the tab content, not a full-screen scrim with a cutout around a specific element. Matches the issue's "coachmark" intent at a fraction of the build cost, and — critically — is testable the normal way (jest can verify text/visibility/dismiss; it cannot verify true on-screen anchoring, the same class of limitation already noted for reanimated motion elsewhere in this repo).
- **Chip-strategy guidance folds into the Transfer tab's single tip** rather than getting its own second coachmark, keeping this to exactly one tip per tab (the issue's stated cap is "1–2 max").
- **Mirrors `OfflineBanner` exactly**, an existing, already-tested "docked strip" pattern in this codebase: normal document flow (not an absolute overlay — no z-index/layering needed), `accessibilityLiveRegion="polite"` + `useA11yAnnounce`, renders `null` when not applicable. This is a refinement of "banner style" landed on during implementation-detail review of the existing pattern, not a new mechanism.
- **State lives in one small Zustand store** (`onboardingStore.ts`), following the `themeStore.ts` shape exactly (`persist` + `createJSONStorage(AsyncStorage)` — no manual hydration boilerplate, no side effects to wire up, unlike `biometricStore.ts` which also listens to auth events this feature doesn't need).
- **One shared banner instance, not three.** `(home)/(tabs)/_layout.tsx` already tracks `activeTab` (for the tab-bar active indicator) — the coachmark is rendered once in the layout, keyed off that existing state, instead of duplicating focus-detection in each of the three tab screens.

## Non-goals

- No true spotlight/scrim/arrow-anchored coachmark engine (see scope decision above).
- No new third-party tooltip library (`react-native-walkthrough-tooltip` etc.) — reuses existing primitives only.
- No "skip all" affordance beyond replay-from-Settings; each tip is dismissed independently via its own "Got it".
- No gating on tab data-loading state — the tip can appear over a loading skeleton; this is cosmetic, not a correctness concern.
- No exit animation on dismiss (tip disappears immediately on "Got it", matching `OfflineBanner`'s binary render/no-render — no fade-out transition anywhere else in this codebase either).

## Architecture

```
STATE                              COMPONENT                          WIRING
─────                              ─────────                          ──────
src/store/onboardingStore.ts  ◄──  src/components/onboarding/
  seen: Record<TabKey, bool>       TabCoachmark.tsx            ◄──  (home)/(tabs)/_layout.tsx
  markSeen(tab)                    (self-sufficient: reads          renders <TabCoachmark tab={activeTab} />
  resetAll()                       its own theme tokens,             directly above <Tabs>, in normal
  persist → AsyncStorage           reduced-motion, a11y             flow (pushes tab content down
  key 'fantasy-gaffer/             announce — mirrors               when visible, like OfflineBanner)
  onboarding-tips')                OfflineBanner's shape)

                                                                  (home)/settings.tsx
                                                                  new "Replay tutorial" SettingsRow
                                                                  in the existing "More" SectionCard
                                                                  → calls resetAll()
```

### Store (`src/store/onboardingStore.ts`)

```ts
type TabKey = 'top-picks' | 'team' | 'transfer';

interface OnboardingState {
  seen: Record<TabKey, boolean>;
  markSeen: (tab: TabKey) => void;
  resetAll: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: { 'top-picks': false, team: false, transfer: false },
      markSeen: (tab) => set((s) => ({ seen: { ...s.seen, [tab]: true } })),
      resetAll: () => set({ seen: { 'top-picks': false, team: false, transfer: false } }),
    }),
    {
      name: 'fantasy-gaffer/onboarding-tips',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ seen: s.seen }),
    },
  ),
);
```

`TabKey` is declared independently here rather than imported from `(tabs)/_layout.tsx`'s existing (unexported) `TabName` — small duplication of a 3-string union, avoided coupling a store to a route file. Same accepted flash-of-default-state trade-off as `themeStore.ts`: on cold start, `seen` briefly reads all-`false` before AsyncStorage rehydrates, so a previously-dismissed tip could flash for one frame. `themeStore` accepts the equivalent for palette/dark-mode; not worth a `hydrated` guard here either.

### Component (`src/components/onboarding/TabCoachmark.tsx`)

Self-sufficient like `OfflineBanner` — reads its own theme tokens, takes only `tab: TabKey` as a prop:

```tsx
const TIPS: Record<TabKey, string> = {
  'top-picks': "Swipe between positions, or tap a player to see why we're suggesting them",
  team: 'Use the chevrons to plan the upcoming gameweek',
  transfer: 'Tap any player to see who you should bring in — check the chip strip above for Wildcard/Bench Boost timing',
};

export function TabCoachmark({ tab }: { tab: TabKey }) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const seen = useOnboardingStore((s) => s.seen[tab]);
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const reduced = useReducedMotion();
  const message = TIPS[tab];

  useA11yAnnounce(seen ? null : message);
  if (seen) return null;

  // Entrance only — same reduced-motion idiom as Skeleton.tsx's pulse gate:
  // skip the animation setup entirely rather than animate-then-snap.
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(1, { duration: 200 });
  }, [reduced]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={`coachmark-${tab}`}
      accessibilityLiveRegion="polite"
      style={[styles.bar, animatedStyle, { backgroundColor: tk.surface, borderColor: tk.line }]}
    >
      <Text style={[styles.text, { color: tk.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {message}
      </Text>
      <Pressable onPress={() => markSeen(tab)} accessibilityRole="button" accessibilityLabel="Got it" hitSlop={8}>
        <Text style={[styles.dismiss, { color: tk.purple }]}>Got it</Text>
      </Pressable>
    </Animated.View>
  );
}
```

Reduced-motion handling mirrors `Skeleton.tsx` exactly: `useSharedValue` + `useAnimatedStyle`, with the animation-starting effect short-circuiting (`if (reduced) return`) instead of using reanimated's `entering={FadeInDown}` layout-animation prop — this repo has no precedent for that API, so the existing `withTiming`-based idiom is followed instead.

### Wiring

- **`(home)/(tabs)/_layout.tsx`** — render `<TabCoachmark tab={activeTab} />` directly above `<Tabs>` (`activeTab` already exists as layout state for the tab-bar indicator; no new tracking needed).
- **`(home)/settings.tsx`** — add a `SettingsRow` "Replay tutorial" in the existing "More" `SectionCard`, alongside Share/Feedback/Privacy/Terms, calling `useOnboardingStore().resetAll()`.

## Data flow

Entirely local and synchronous — no network, no `@/api/*`. `TabCoachmark` reads `activeTab` (passed down), the store's `seen[tab]` flag, and the OS reduced-motion flag; the only write is `markSeen`/`resetAll` back into the persisted store.

## Error handling

None needed — `AsyncStorage` failures during `persist` rehydration are swallowed by the zustand persist middleware itself (same as every other persisted store in this app); worst case is the tips re-show once, which is harmless.

## Testing

Unit / component (`src/__tests__/`, mirroring the source tree):

- **`store/onboardingStore.test.ts`** — `markSeen` flips only the targeted tab; `resetAll` clears all three; AsyncStorage round-trip (mock `@react-native-async-storage/async-storage` the same way `OfflineBanner.test.tsx` does).
- **`components/onboarding/TabCoachmark.test.tsx`** — modeled directly on `OfflineBanner.test.tsx`:
  - shows the correct copy + `testID="coachmark-<tab>"` + `accessibilityLiveRegion="polite"` when `seen[tab]` is false
  - renders nothing when `seen[tab]` is true
  - pressing "Got it" calls `markSeen(tab)` (assert via a store spy / mocked hook return)
  - spies `AccessibilityInfo.isReduceMotionEnabled` to confirm the component consults it (per the established a11y test convention — real motion isn't observable in jest, so only "did it check" is asserted, not "did it animate")
- **`settingsScreen.test.tsx`** — updated to assert the new "Replay tutorial" row exists and calls `resetAll()`.
- No test needed for `(tabs)/_layout.tsx` itself — none exists today for that file; `TabCoachmark` is tested in isolation and the wiring is a one-line render call.

`tsc` note: none expected — no new routes, no `typedRoutes` surface touched.

## Follow-ups (not now)

- True anchored spotlight/arrow coachmarks, if the simple-banner version proves insufficient in practice.
- A "skip all" control.
- Coachmarks for the Account menu / Settings screen itself.

## Acceptance criteria mapping (issue #49)

- **Tutorial fires on first time visiting each tab post-sign-in** → `TabCoachmark` keyed by `activeTab`, gated on `seen[tab]`.
- **Skippable** → "Got it" dismisses immediately, no forced interaction with underlying content.
- **Replayable from Settings** → new "Replay tutorial" row calling `resetAll()`.
