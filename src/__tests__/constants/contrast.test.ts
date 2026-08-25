import { getTheme, PALETTE, PaletteKey } from '@/constants/theme';
import { apexTokens, HERO_ON_DARK, ON_PITCH } from '@/constants/apexTokens';
import { contrastRatio } from '../utils/contrast';

const AA = 4.5; // WCAG AA, normal text

const themeLight = getTheme('classic', false);
const themeDark = getTheme('classic', true);
const apexLight = apexTokens(false, 'classic');
const apexDark = apexTokens(true, 'classic');

const KEYS: PaletteKey[] = PALETTE.map((p) => p.key);

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
  // The floating nav's labels. The v2 mock's own idle greys measure 2.53:1
  // (light) and 3.46:1 (dark) here, so `navIdle` keeps the mock's hue but is
  // lifted to clear AA — this pair is what stops it drifting back.
  ['apex.light navIdle / navBg', apexLight.navIdle, apexLight.navBg],
  ['apex.light navActive / navBg', apexLight.navActive, apexLight.navBg],
  ['apex.dark navIdle / navBg', apexDark.navIdle, apexDark.navBg],
  ['apex.dark navActive / navBg', apexDark.navActive, apexDark.navBg],
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

  // #188: the sub-on/sub-off pills sit on the grass, which is one fixed colour
  // in every mode and palette, so they carry fixed ink rather than a token.
  // Both fills used to fail against their own white text (3.48:1 / 2.36:1) and
  // were invisible to this guard because it only ever read theme tokens.
  it.each([
    ['on-pitch ink / subOff', ON_PITCH.ink, ON_PITCH.subOff],
    ['on-pitch ink / subIn', ON_PITCH.ink, ON_PITCH.subIn],
  ])('%s meets 4.5:1', (_l, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  // Sanity: the helper matches known reference ratios.
  it('contrastRatio matches known references', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

// The pairs below are palette-swept: a token that only passes on `classic`
// still fails for two thirds of users. Each `it.each` reads the real
// getTheme/apexTokens return value for the palette under test.
describe.each(KEYS)('WCAG AA contrast — palette %s', (key) => {
  const tL = getTheme(key, false);
  const tD = getTheme(key, true);
  const aL = apexTokens(false, key);
  const aD = apexTokens(true, key);

  // #173: one mode-aware error colour replacing #FF3B5C (2.92:1) and
  // #FF6B6B (2.78:1). It lands on both token systems' surfaces.
  it.each([
    ['theme.light danger / bg', tL.danger, tL.bg],
    ['theme.light danger / surface', tL.danger, tL.surface],
    ['theme.light danger / surfaceAlt', tL.danger, tL.surfaceAlt],
    ['theme.dark danger / bg', tD.danger, tD.bg],
    ['theme.dark danger / surface', tD.danger, tD.surface],
    ['theme.dark danger / surfaceAlt', tD.danger, tD.surfaceAlt],
    ['apex.light danger / bg', aL.danger, aL.bg],
    ['apex.light danger / card', aL.danger, aL.card],
    ['apex.dark danger / bg', aD.danger, aD.bg],
    ['apex.dark danger / card', aD.danger, aD.card],
  ])('%s meets 4.5:1', (_l, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  // #173: light-mode `accent` is BOTH the primary-CTA fill (white ink on it)
  // and inline link text on `bg`. Both readings must clear AA — the old
  // #00E676 fill measured 1.67:1 against its own white ink.
  it('light accent carries white ink (primary CTA fill)', () => {
    expect(contrastRatio(tL.accentInk, tL.accent)).toBeGreaterThanOrEqual(AA);
  });
  it('light accent reads as link text on bg', () => {
    expect(contrastRatio(tL.accent, tL.bg)).toBeGreaterThanOrEqual(AA);
  });
  it('dark accent carries its ink and reads on bg', () => {
    expect(contrastRatio(tD.accentInk, tD.accent)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(tD.accent, tD.bg)).toBeGreaterThanOrEqual(AA);
  });

  // #179/#180: `purple` is the accent for links and rails on apex surfaces
  // (it replaced the hardcoded #A78BFA, which measured 2.72:1 on a card).
  // #188: the same pair now also paints the dugout's outfield glyph, and
  // `green` its keeper glyph — both on `card`, both swept for palette bleed.
  it.each([
    ['apex.light purple / card', aL.purple, aL.card],
    ['apex.light purple / bg', aL.purple, aL.bg],
    ['apex.dark purple / card', aD.purple, aD.card],
    ['apex.dark purple / bg', aD.purple, aD.bg],
    ['apex.light green / card', aL.green, aL.card],
    ['apex.dark green / card', aD.green, aD.card],
  ])('%s meets 4.5:1', (_l, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  // #173: the hero gradient is dark in both modes, so its text uses fixed
  // on-dark values. Measured at `heroBg` (the gradient's first stop), which
  // is where the vs-avg pill and the stat block sit.
  it.each([
    ['light hero accent', HERO_ON_DARK.accent, aL.heroBg],
    ['dark hero accent', HERO_ON_DARK.accent, aD.heroBg],
    ['light hero muted', HERO_ON_DARK.muted, aL.heroBg],
    ['dark hero muted', HERO_ON_DARK.muted, aD.heroBg],
  ])('%s meets 4.5:1', (_l, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  // #179: the hero gradient's second stop must belong to the palette, not
  // to `classic` — the regression was a hardcoded #5B0F63 in 8 files.
  it('heroBg2 is palette-owned in light mode', () => {
    expect(aL.heroBg2).toBe(apexTokens(false, key).heroBg2);
    if (key !== 'classic') expect(aL.heroBg2).not.toBe(apexTokens(false, 'classic').heroBg2);
  });
});
