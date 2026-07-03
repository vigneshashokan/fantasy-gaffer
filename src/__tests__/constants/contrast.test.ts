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
