import { DANGER_DARK, DANGER_LIGHT, PaletteKey } from './theme';

const APEX_BRAND: Record<string, {
  p1: string; p2: string;
  glowD: string; glowL: string;
  active: string;
  purpleD: string; purpleL: string;
  moneyD: string; moneyL: string;
  infoL: string;
}> = {
  classic:  { p1: '#37003C', p2: '#5B0F63', glowD: 'rgba(124,58,237,0.50)', glowL: 'rgba(0,228,120,0.42)', active: '#37003C', purpleD: '#C9A6FF', purpleL: '#7C3AED', moneyD: '#D8B9FF', moneyL: '#37003C', infoL: '#EAEDFF' },
  pitch:    { p1: '#06371F', p2: '#0B6B38', glowD: 'rgba(0,228,120,0.45)', glowL: 'rgba(0,228,120,0.42)', active: '#0B6B38', purpleD: '#7CE0A6', purpleL: '#0B6B38', moneyD: '#9BE8B5', moneyL: '#06371F', infoL: '#E4F3E9' },
  electric: { p1: '#1B0A3E', p2: '#4A1B8C', glowD: 'rgba(4,245,255,0.45)', glowL: 'rgba(4,245,255,0.40)', active: '#4A1B8C', purpleD: '#9FD9FF', purpleL: '#3C2A9E', moneyD: '#9FD9FF', moneyL: '#1B0A3E', infoL: '#E7E3FB' },
};

/**
 * Text colours for content painted on the hero gradient. The hero is
 * permanently dark in BOTH modes (`heroBg`/`heroBg2` are always deep
 * brand colours), so surface-tuned tokens like `tk.green` are wrong there —
 * light mode's `green` (#008343) measured 2.56:1 on the classic hero.
 * These are fixed on-dark values, like the hero's sibling stats.
 */
export const HERO_ON_DARK = {
  accent: '#7CFFB0',
  muted: 'rgba(255,255,255,0.85)',
  pill: 'rgba(255,255,255,0.14)',
} as const;

/**
 * Colours for badges painted on the pitch. The grass is the same green in both
 * modes and every palette, so surface tokens are wrong here for the same reason
 * they are wrong on the hero — and `danger` especially so, since its dark
 * variant is a light pink that white ink can't sit on.
 *
 * The fills are dark enough to carry `ink` at AA (the old #FF3B5C measured
 * 3.48:1 against its own white text, #16C172 2.36:1). Dark-on-grass then needs
 * an edge to stay legible, which the existing drop shadow doesn't provide —
 * hence `ring`, the same trick the dugout's alert dot uses against the card.
 */
export const ON_PITCH = {
  subOff: '#C8102E',
  subIn: '#00703C',
  ink: '#FFFFFF',
  ring: 'rgba(255,255,255,0.92)',
} as const;

export interface ApexTokens {
  bg: string;
  card: string;
  cardBorder: string;
  shadow: string;
  text: string;
  variant: string;
  faint: string;
  line: string;
  zebra: string;
  headStrip: string;
  formText: string;
  green: string;
  greenSoft: string;
  pink: string;
  pinkSoft: string;
  yellow: string;
  yellowSoft: string;
  purple: string;
  activeFill: string;
  track: string;
  rowSel: string;
  benchDisc: string;
  infoCard: string;
  captCard: string;
  moneyText: string;
  deadlineBg: string;
  deadlineFg: string;
  chipFill: string;
  heroBg: string;
  /**
   * Second stop of the hero/screen-header gradient (`heroBg` is the first).
   * Per-palette in light mode, one neutral in dark — call sites used to
   * hardcode `dark ? '#0C1018' : '#5B0F63'`, which painted the *classic*
   * purple onto the pitch and electric palettes.
   */
  heroBg2: string;
  heroGlow: string;
  /** Error / destructive text. Same pair as `Theme.danger`. */
  danger: string;
  dark: boolean;
}

export function apexTokens(dark: boolean, palette: PaletteKey | string = 'classic'): ApexTokens {
  const B = APEX_BRAND[palette] ?? APEX_BRAND.classic;
  if (dark) {
    return {
      bg: '#020617', card: '#0B1224', cardBorder: 'rgba(255,255,255,0.08)',
      shadow: '0 12px 32px rgba(0,0,0,0.5)', text: '#EEF1FF', variant: '#9AA6C0', faint: '#7E8AA6',
      line: 'rgba(255,255,255,0.07)', zebra: 'rgba(255,255,255,0.028)', headStrip: 'rgba(255,255,255,0.025)',
      formText: '#AEB8D2',
      green: '#00E478', greenSoft: 'rgba(0,228,120,0.16)',
      pink: '#FF2882', pinkSoft: 'rgba(255,40,130,0.18)',
      yellow: '#FFC53D', yellowSoft: 'rgba(255,197,61,0.16)',
      purple: B.purpleD, activeFill: B.active, track: 'rgba(255,255,255,0.06)', rowSel: 'rgba(0,228,120,0.09)',
      benchDisc: 'rgba(255,255,255,0.05)',
      infoCard: B.p1, captCard: B.p1, moneyText: B.moneyD,
      deadlineBg: 'rgba(255,40,90,0.12)', deadlineFg: '#FF7A95',
      chipFill: B.active,
      heroBg: B.p1, heroBg2: '#0C1018', heroGlow: B.glowD,
      danger: DANGER_DARK,
      dark: true,
    };
  }
  return {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#E7E9F2',
    shadow: '0 10px 28px rgba(2,6,23,0.10)', text: '#1A2236', variant: '#4F434D', faint: '#746F7E',
    line: '#ECEEF6', zebra: 'rgba(91,76,160,0.035)', headStrip: '#F6F4FD',
    formText: '#3A4256',
    green: '#008343', greenSoft: 'rgba(0,152,78,0.10)',
    pink: '#E0005E', pinkSoft: 'rgba(255,40,130,0.10)',
    yellow: '#926B09', yellowSoft: 'rgba(184,134,11,0.12)',
    purple: B.purpleL, activeFill: B.active, track: '#EAEDFF', rowSel: 'rgba(0,152,78,0.07)',
    benchDisc: '#F1EEFA',
    infoCard: B.infoL, captCard: B.infoL, moneyText: B.moneyL,
    deadlineBg: '#FFE3E9', deadlineFg: '#C8102E',
    chipFill: B.active,
    heroBg: B.p1, heroBg2: B.p2, heroGlow: B.glowL,
    danger: DANGER_LIGHT,
    dark: false,
  };
}
