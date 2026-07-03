# Colour-Contrast Retune (W7) — Design

**Status:** Approved (brainstorm) → writing plan
**Issue:** #47 accessibility audit — W7 follow-up (the contrast portion, split out from the main a11y PR #120)
**Date:** 2026-07-03

## Goal

Bring the theme's failing text-on-background colour pairs up to WCAG AA
(**4.5:1** for normal text) with **minimal, hue-preserving** token nudges, and add
a guard test so contrast can't silently regress. This closes the one #47
acceptance criterion deferred from PR #120 ("no contrast warnings from
Accessibility Inspector").

## Background — the audit

A WCAG contrast pass over every muted/accent text token across all three
palettes (classic/pitch/electric) × light/dark found that **most tokens already
pass**. Passing (untouched): `variant`, `formText`, `textMuted`,
`onPrimaryMuted`, `deadlineFg`, translucent onboarding whites, and **all
dark-mode accents**. Only **six tokens fail 4.5:1 for normal text** — the neutral
muted greys (worst: light `textFaint` at 2.39) and the three light-mode brand
accents used as small text.

## Approach — direct token retune

Each failing token's value is nudged in HSL along lightness only (hue + saturation
preserved) until it clears **4.6:1** (a small margin over the 4.5 floor) against
its worst-case background. Values were solved offline; they are fixed constants,
not computed at runtime.

**Retuning the accent token directly is safe** (no separate accent-text token
needed): darkening an accent only ever *raises* contrast for its non-text uses —
white-text-on-accent-fill (e.g. the Confirm button's white text on `green`) and
accent-text-on-soft-tint both improve. The apex accents are only ever paired with
white text or used as text/dots (never dark text on an accent fill), so darkening
is monotonically safe. The guard test asserts the white-on-fill pairs to prove it.

## The changes — six token values

**Neutral muted-grey text:**

| File / token | Old | New | Ratio old → new (worst-case bgs) |
|---|---|---|---|
| `src/constants/theme.ts` — dark base `textFaint` | `#7C6588` | `#917A9C` | 3.42 → 4.60 (on surface `#241030`) |
| `src/constants/theme.ts` — light base `textFaint` | `#A593AE` | `#776182` | 2.39 → 4.60 (on bg `#EFE9F3`) |
| `src/constants/apexTokens.ts` — light `faint` | `#8B8694` | `#746F7E` | 3.36 → 4.61 (on bg `#FAF8FF`) |

**Light-mode brand accents (`apexTokens.ts` light branch only):**

| Token | Old | New | Ratio old → new (on white card) |
|---|---|---|---|
| light `green` | `#00984E` | `#008343` | 3.75 → 4.85 |
| light `yellow` | `#B8860B` | `#926B09` | 3.25 → 4.86 |
| light `pink` | `#FF2882` | `#E0005E` | 3.57 → 4.86 |

Dark-mode `apexTokens` accents (`green #00E478`, `yellow #FFC53D`, `pink #FF2882`)
already pass and are **not** changed. The `theme.ts` light/dark `textMuted`,
`variant`, `formText`, and per-palette brand primaries/gradients are **not** text
failures and are untouched.

## Components

- **`src/constants/theme.ts`** — change the two `textFaint` literals (one in the
  dark base object, one in the light base object) in `getTheme`.
- **`src/constants/apexTokens.ts`** — change `faint`, `green`, `yellow`, `pink`
  in the **light** return branch of `apexTokens()` only.
- **Contrast guard (test-only):** a small pure `contrastRatio(fg, bg)` helper
  (sRGB relative-luminance formula; supports `#rgb`/`#rrggbb` and, for
  completeness, `rgba()` composited over an opaque bg) plus a unit test that
  asserts a table of pairs each meet a stated minimum. No runtime consumer, so it
  lives with the tests — not shipped in `src/lib`.

## The guard test — asserted pairs

The test table pins every fixed pair to **≥ 4.5** and includes fill-safety pairs
to prove the accent darkening didn't harm non-text uses:

- Fixed text pairs: `theme.light textFaint`/bg `#EFE9F3` + /surface `#FFFFFF`;
  `theme.dark textFaint`/bg `#120016` + /surface `#241030`; `apex.light faint`/bg
  `#FAF8FF` + /card `#FFFFFF`; `apex.light green`/`#FFFFFF`; `apex.light
  yellow`/`#FFFFFF`; `apex.light pink`/`#FFFFFF`.
- Fill-safety pairs (white text on the retuned accents): `#FFFFFF` on `apex.light
  green #008343` — asserts still ≥ 4.5.

The table drives the assertions off the **real** `getTheme(...)` / `apexTokens(...)`
return values (not copied literals) so the test breaks if a token is edited back
below threshold.

## Testing

- New contrast guard test passes; existing `theme.test.ts` and `apexTokens.test.ts`
  stay green (update any test that asserts an old literal value).
- `tsc --noEmit`: no new errors beyond the ~23-error baseline.
- jest cannot render colour on a device, so the final visual confirmation — the
  Xcode Accessibility Inspector contrast scan of the main screens (light + dark)
  — is an on-device check the operator runs (the #47 AC this PR closes). The
  values are computed to pass, so this is a confirmation, not a discovery step.

## Non-goals

- No component, layout, copy, or spacing changes — token-value edits + a test only.
- No new runtime dependency; the contrast helper is test-scoped.
- Dark-mode accents, passing neutral tokens, and brand primaries are out of scope.
- Not introducing a separate "accent-on-surface text" token — the direct retune is
  proven safe by the fill-safety assertions.
