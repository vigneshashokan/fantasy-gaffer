# Colour-Contrast Retune (W7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the six failing text-on-background colour tokens to WCAG AA (4.5:1) with minimal hue-preserving nudges, guarded by a contrast unit test.

**Architecture:** A test-only `contrastRatio(fg, bg)` helper drives a guard test that asserts the real `getTheme`/`apexTokens` return values meet 4.5:1. Writing the guard first fails against the current tokens (RED); retuning the six token literals makes it pass (GREEN). Token-value edits only — no component, layout, or copy changes.

**Tech Stack:** TypeScript · Jest (`jest-expo`). No new dependencies.

## Global Constraints

- **Exactly six token values change, verbatim:** `theme.ts` dark `textFaint` `#7C6588→#917A9C`; `theme.ts` light `textFaint` `#A593AE→#776182`; `apexTokens.ts` light `faint` `#8B8694→#746F7E`, light `green` `#00984E→#008343`, light `yellow` `#B8860B→#926B09`, light `pink` `#FF2882→#E0005E`.
- **Only the six solid tokens change.** Leave `greenSoft`/`yellowSoft`/`pinkSoft` and every `rgba(...)` tint UNCHANGED (out of scope — they are low-alpha backgrounds; the spec scoped to the six solids).
- **Dark-mode `apexTokens` accents and all passing tokens are untouched** (`variant`, `formText`, `textMuted`, `onPrimaryMuted`, deadline colours, brand primaries/gradients).
- **No component/layout/copy changes** — this is a token-value + test change.
- **The contrast helper is test-scoped** — it lives under `src/__tests__/utils/`, NOT `src/lib` (no runtime consumer, so no shipped code / no new runtime dependency).
- **tsc baseline** is ~23 pre-existing errors in unrelated files — only NEW errors count. Local jest: `watchman shutdown-server` then `npx jest --watchman=false --runInBand --forceExit`.
- **Commit path-scoped** (never `git add -A`). End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- On-device Xcode **Accessibility Inspector** contrast scan (light + dark) is the operator's final visual confirmation (the #47 AC this PR closes) — not automatable in jest.

---

### Task 1: Contrast guard test + six-token retune

**Files:**
- Create: `src/__tests__/utils/contrast.ts` (test-only helper — NOT collected as a suite; only `*.test.ts` are)
- Create: `src/__tests__/constants/contrast.test.ts` (the guard)
- Modify: `src/constants/theme.ts` (two `textFaint` literals in `getTheme`)
- Modify: `src/constants/apexTokens.ts` (light branch `faint`/`green`/`yellow`/`pink`)
- Modify: `src/__tests__/apexTokens.test.ts:16` (the one assertion pinning the old light `green`)

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` from `src/__tests__/utils/contrast.ts`.

- [ ] **Step 1: Write the contrast helper**

`src/__tests__/utils/contrast.ts`:

```ts
// WCAG relative-luminance contrast ratio. Test-only helper (no runtime consumer,
// so it lives with the tests). Supports "#rgb" / "#rrggbb" / "#rrggbbaa" and
// "rgb()/rgba()"; a translucent fg is composited over the opaque bg first.
type RGB = [number, number, number];

function composite(fg: RGB, a: number, bg: RGB): RGB {
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

function parse(color: string, bg?: RGB): RGB {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const rgb: RGB = [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ];
    const a = n.length === 8 ? parseInt(n.slice(6, 8), 16) / 255 : 1;
    return a < 1 && bg ? composite(rgb, a, bg) : rgb;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unparseable colour: ${color}`);
  const p = m[1].split(',').map((s) => parseFloat(s.trim()));
  const a = p[3] === undefined ? 1 : p[3];
  const rgb: RGB = [p[0], p[1], p[2]];
  return a < 1 && bg ? composite(rgb, a, bg) : rgb;
}

function luminance([r, g, b]: RGB): number {
  const f = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

// Contrast ratio of `fg` over opaque `bg` (1..21). A translucent `fg` is
// composited over `bg` before measuring.
export function contrastRatio(fg: string, bg: string): number {
  const bgRgb = parse(bg);
  const fgRgb = parse(fg, bgRgb);
  const L1 = luminance(fgRgb);
  const L2 = luminance(bgRgb);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 2: Write the failing guard test**

`src/__tests__/constants/contrast.test.ts`:

```ts
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { contrastRatio } from '../utils/contrast';

const AA = 4.5; // WCAG AA, normal text

const themeLight = getTheme('classic', false);
const themeDark = getTheme('classic', true);
const apexLight = apexTokens(false, 'classic');

// Every fixed text-on-background pair must clear 4.5:1. Values are read from the
// real theme functions (not copied literals) so editing a token back below
// threshold breaks this test.
const pairs: [string, string, string][] = [
  ['theme.light textFaint / bg', themeLight.textFaint, themeLight.bg],
  ['theme.light textFaint / surface', themeLight.textFaint, themeLight.surface],
  ['theme.dark textFaint / bg', themeDark.textFaint, themeDark.bg],
  ['theme.dark textFaint / surface', themeDark.textFaint, themeDark.surface],
  ['apex.light faint / bg', apexLight.faint, apexLight.bg],
  ['apex.light faint / card', apexLight.faint, apexLight.card],
  ['apex.light green / card', apexLight.green, apexLight.card],
  ['apex.light yellow / card', apexLight.yellow, apexLight.card],
  ['apex.light pink / card', apexLight.pink, apexLight.card],
];

describe('WCAG AA contrast — text tokens', () => {
  it.each(pairs)('%s meets 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  // Fill-safety: the Confirm button paints white text on the light `green` fill.
  // (Contrast is symmetric, so this equals green/card — asserted explicitly to
  // document that darkening the accent keeps the button legible.)
  it('white text on the light green fill meets 4.5:1', () => {
    expect(contrastRatio('#FFFFFF', apexLight.green)).toBeGreaterThanOrEqual(AA);
  });

  // Sanity: the helper matches known reference ratios.
  it('contrastRatio matches known references', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 3: Run the guard to verify it FAILS**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/constants/contrast.test.ts`
Expected: FAIL — the current tokens are below AA (e.g. `theme.light textFaint / bg` ≈ 2.39, `apex.light pink / card` ≈ 3.57). The two reference/sanity assertions pass.

- [ ] **Step 4: Retune the six token literals**

In `src/constants/theme.ts`, inside `getTheme`:
- Dark base object: change `textFaint:  '#7C6588',` → `textFaint:  '#917A9C',`
- Light base object: change `textFaint:  '#A593AE',` → `textFaint:  '#776182',`

In `src/constants/apexTokens.ts`, in the **light** return branch (the `return { ... dark: false }` block), change ONLY these four solids — leave `greenSoft`/`yellowSoft`/`pinkSoft` and all `rgba(...)` values exactly as they are:
- `faint: '#8B8694'` → `faint: '#746F7E'`
- `green: '#00984E'` → `green: '#008343'`
- `pink: '#FF2882'` → `pink: '#E0005E'`
- `yellow: '#B8860B'` → `yellow: '#926B09'`

- [ ] **Step 5: Update the one existing assertion that pins the old value**

In `src/__tests__/apexTokens.test.ts`, line 16:
- Change `expect(tk.green).toBe('#00984E');` → `expect(tk.green).toBe('#008343');`

(No other existing test asserts a changed literal — the other five tokens aren't pinned by value.)

- [ ] **Step 6: Run the guard + affected suites to verify GREEN**

Run: `npx jest --watchman=false --runInBand --forceExit src/__tests__/constants/contrast.test.ts src/__tests__/apexTokens.test.ts src/__tests__/theme.test.ts`
Expected: PASS — all contrast pairs ≥ 4.5, and the `apexTokens`/`theme` suites green.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors beyond the ~23-error baseline (unrelated test/Deno files). The new `contrast.ts` + `contrast.test.ts` add zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/utils/contrast.ts src/__tests__/constants/contrast.test.ts src/constants/theme.ts src/constants/apexTokens.ts src/__tests__/apexTokens.test.ts
git commit -m "fix(a11y): retune failing text tokens to WCAG AA + contrast guard (#47)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after the task)

- [ ] Full suite: `watchman shutdown-server; npx jest --watchman=false --runInBand --forceExit` — all green.
- [ ] `npx tsc --noEmit` — no NEW errors beyond baseline.
- [ ] Confirm the diff changed only the six solid token values (+ the one test assertion) and added the two new files — no `rgba` tint, component, or layout change.
