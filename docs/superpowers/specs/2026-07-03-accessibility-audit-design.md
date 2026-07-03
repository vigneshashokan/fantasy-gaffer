# Accessibility Audit — Design (#47, Phase 5)

**Status:** Approved (brainstorm) → writing plan
**Issue:** #47 [Phase 5] Accessibility audit
**Date:** 2026-07-03

## Goal

Make the app operable with VoiceOver/TalkBack and usable at large font sizes, by
adding the missing accessibility metadata, screen-reader announcements,
reduced-motion handling, and font-scaling safeguards across the app — **without**
changing its visual design. The one visually-invasive workstream (contrast
retune) is split into its own follow-up (see Non-goals).

## Background — current posture (from survey)

- ~70 interactive elements (all bare `Pressable`, no `Touchable*`); only ~9 set
  `accessibilityRole`/`accessibilityLabel`. **~61 (~87%) missing.**
- **Zero** uses of `AccessibilityInfo`, `useReducedMotion`,
  `accessibilityLiveRegion`, `announceForAccessibility`, `allowFontScaling`, or
  `maxFontSizeMultiplier` anywhere in the app.
- Good existing conventions to copy: `connect-team.tsx` buttons
  (`role="button"` + `accessibilityState={{ disabled }}`), `Checkbox.tsx`
  (`role="checkbox"` + `state.checked`), password show/hide toggles (dynamic
  label), `PitchBadges.tsx` (labeled non-text group). Strong `testID` discipline
  throughout.

## Approach — leverage-first

Build three tiny a11y primitives once, fix the shared components (covers ~26 call
sites at ~4 edit points), then sweep the remaining ~35 per-screen elements.
Contrast becomes a guard *test* in its own PR. RN's built-in a11y props are
sufficient — no new runtime dependency.

## In scope (this spec / PR)

### W1 · A11y primitives — `src/lib/a11y/`

The shared foundation every other workstream consumes.

- **`useReducedMotion(): boolean`** — reads `AccessibilityInfo.isReduceMotionEnabled()`
  on mount and subscribes to `reduceMotionChanged`; unsubscribes on unmount.
  Returns `false` until resolved (motion is the safe default in tests).
- **`announce(message: string): void`** — thin wrapper over
  `AccessibilityInfo.announceForAccessibility`. Single egress so tests mock one
  place.
- **`useA11yAnnounce(message: string | null | undefined, opts?: { assertive?: boolean })`**
  — calls `announce()` whenever a non-empty `message` changes (covers iOS, which
  has no live region). Callers additionally set
  `accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}` on the visible
  element (covers Android). This pairing is the **one convention** all
  banners/errors use.
- **`MAX_FONT_SCALE = 1.4`** — the cap applied to text inside fixed-height
  controls (W8).

### W2 · Shared-component a11y (highest leverage)

| Component | Change |
|---|---|
| `src/components/ui/PillBtn.tsx` (13 sites) | `accessibilityRole="button"`; `accessibilityLabel` derived from string `children` (fall back to explicit prop); `accessibilityState={{ disabled }}`; `maxFontSizeMultiplier={MAX_FONT_SCALE}` on its label Text |
| `src/components/forms/SocialBtn.tsx` (4) | `role="button"` + label + font cap |
| `src/components/ui/Toggle.tsx` (4) | `accessibilityRole="switch"` + `accessibilityState={{ checked }}`; thread an `accessibilityLabel` prop from each caller |
| `src/components/settings/SettingsRow.tsx` (5) | `role="button"` + `accessibilityLabel` from `label` prop |
| `src/components/ui/ScreenHeader.tsx` | back button `role="button"` + `accessibilityLabel="Back"` |
| `src/components/forms/Field.tsx` | `accessibilityLabel` on the `TextInput` from its `label`; error text wired via W4 |

### W3 · Reduced motion

- **`src/components/ui/Skeleton.tsx:36-41`** — gate the infinite Reanimated
  `withRepeat` pulse on `useReducedMotion()`; render a static (non-animating)
  placeholder when reduce-motion is on.
- **Gameweek carousel `src/app/(home)/(tabs)/team.tsx`** — pass `animated: false`
  to `scrollToIndex` (`:108`) / `scrollToOffset` (`:168`) and skip the
  `Animated.timing` arrow-opacity fades (`:41-43,197-218`) when reduce-motion is
  on.
- **Top-picks pager `src/app/(home)/(tabs)/top-picks.tsx:60,115-116`** — same:
  `animated: false` scrolls under reduce-motion.

### W4 · Screen-reader announcements

Apply the W1 live-region + `useA11yAnnounce` convention to:

- **`src/components/OfflineBanner.tsx`** — announce "You're offline" on show;
  `accessibilityLiveRegion="polite"`.
- **`src/components/team/ApplyAllCard.tsx:41-49`** — announce the "Changes
  confirmed" success state (polite).
- **Form errors** (assertive): `signup.tsx` (`fieldError`/`formError`
  `:256-267`), `signin.tsx`, `forgot-password.tsx`, `reset-password.tsx`,
  `connect-team.tsx:207` — the error Text gets
  `accessibilityLiveRegion="assertive"` + announce on change.
- **Other status banners** (polite, lighter touch): `DeadlineBanner.tsx`,
  `player/AvailabilityBanner.tsx`, `ui/SeasonCompleteBanner.tsx`,
  `transfer/ConfirmTransferBar.tsx`.

### W5 · Per-screen interactive elements (~35 remaining)

Add `accessibilityRole` + `accessibilityLabel` (+ `accessibilityState` where a
disabled/selected/checked state exists) to:

- `src/components/nav/AccountMenu.tsx:98,102,107` (backdrop + menu rows)
- `src/app/(home)/settings.tsx:98,124,148` (inline Pressables)
- `src/app/(home)/player/[id].tsx:47,59,128` (Close, back chevron, Retry)
- `src/components/profile/DeleteAccount.tsx`, `ChangePassword.tsx` (remaining)
- `src/app/(onboarding)/index.tsx` (skip, pager dots `:82`, CTA `:93`)
- **Custom tab bar `src/app/(home)/(tabs)/_layout.tsx:55-95`** —
  `accessibilityRole="tab"` + `accessibilityState={{ selected }}` + per-tab label
- `src/components/team/GwNav.tsx:49-66` (prev/next arrows)
- `src/components/picks/PickRow.tsx`, `notifications/PushPrimingSheet.tsx:40`,
  `settings/NotificationsCard.tsx`, `settings/FollowUsRow.tsx`,
  `team/ApplyAllCard.tsx`, `transfer/TransferTargetsHeader.tsx:34`,
  `team/TeamIdInput.tsx:63`

**Decorative content** — hide from the a11y tree with
`accessibilityElementsHidden` (iOS) + `importantForAccessibility="no-hide-descendants"`
(Android): `SlideVisual` mock phone, onboarding glow blobs, pitch marks / glow
decorations.

### W6 · Touch targets (≥44pt effective)

- Add `hitSlop` where missing: `GwNav.tsx` arrows, onboarding pager dots
  (`index.tsx:82-90`), tab-bar items.
- **Signup legal links `signup.tsx:211-223`** — convert the tiny nested
  `<Text onPress>` spans into `Pressable` targets with
  `accessibilityRole="link"` + `hitSlop` (also resolves the #46 a11y follow-up).
- `signin.tsx:231` footer link — add `accessibilityLabel`.

### W8 · Font scaling (targeted caps)

- Apply `maxFontSizeMultiplier={MAX_FONT_SCALE}` to text inside fixed-height
  controls — mostly through the W2 shared components (`PillBtn`, `SocialBtn`
  `height:54`, `Field` `height:54`, `Toggle`), plus `GwPill` (`height:46`) and
  the tab bar.
- Convert the tightest fixed `height:` to `minHeight:` where a control would clip
  at the cap. Body/content text stays uncapped (fully scalable).

### W9 · Conventions doc + validation checklist — `docs/a11y.md`

- The standardized props the codebase uses (`role`/`label`/`state` per control
  type; the announce + live-region convention; the font-scale cap).
- The **manual on-device validation checklist** for the ACs jest can't exercise:
  VoiceOver walk-through of the main flows (onboarding → connect team → tabs →
  settings), Accessibility Inspector scan, and expo-web Lighthouse ≥90.

## Testing

- **Props**: React Testing Library `getByRole` / `getByLabelText` / `toBeDisabled`
  assertions on the shared components and representative screens.
- **Reduced motion & announcements**: mock `AccessibilityInfo`
  (`isReduceMotionEnabled`, `announceForAccessibility`, the change subscription)
  and assert Skeleton renders static / carousels pass `animated:false` /
  banners announce on show.
- Follow the repo jest conventions: tests under `src/__tests__/**` mirroring
  `src/`; screens that import `@/api/*` must mock that chain; run `tsc --noEmit`
  separately (jest doesn't type-check).
- **Out of jest's reach** (→ W9 manual checklist): VoiceOver operability,
  Accessibility Inspector contrast warnings, Lighthouse score.

## Acceptance criteria mapping (#47)

- *App operable with VoiceOver throughout main flows* — delivered by W2/W4/W5/W6;
  **validated manually** via the W9 checklist.
- *Lighthouse a11y ≥ 90 (expo-web)* — supported by the same; **validated
  manually** (expo-web build) per W9.
- *No contrast warnings from Accessibility Inspector* — **W7, separate PR** (see
  Non-goals); the contrast portion of the W9 checklist runs with that PR.

## Non-goals / follow-ups

- **W7 · Contrast retune — separate spec/PR.** A WCAG-ratio util + guard test
  asserting text-on-bg token pairs meet 4.5:1 (normal) / 3:1 (large), with each
  failing token (`apexTokens faint`, `theme textFaint`/`textMuted`, translucent
  onboarding whites) bumped minimally and hue-preserving, reviewed as a
  before/after swatch list. Split out because it's the only visually-invasive
  change and needs a design eye on the new values.
- **No shared `<AppText>` migration** — targeted `maxFontSizeMultiplier` on
  fixed-height controls only; not a full Dynamic-Type redesign.
- **No new runtime dependency / no a11y library** — RN built-ins suffice.
- On-device validation (VoiceOver, Inspector, Lighthouse) is an operator pass
  the user runs against the W9 checklist, same pattern as #46's hosting step.
