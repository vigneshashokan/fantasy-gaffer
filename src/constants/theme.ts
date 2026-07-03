export type PaletteKey = 'classic' | 'pitch' | 'electric';

export interface Theme {
  dark: boolean;
  paletteKey: PaletteKey;
  primary: string;
  primaryGrad: string;
  accentGrad: string;
  accentChip: string;
  accentLight: string;
  pink: string;
  cyan: string;
  onPrimary: string;
  onPrimaryMuted: string;
  bg: string;
  bg2: string;
  surface: string;
  surfaceAlt: string;
  surface2: string;
  text: string;
  textMuted: string;
  textFaint: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentInk: string;
  shadow: string;
  islandText: string;
}

export interface PaletteEntry {
  key: PaletteKey;
  label: string;
  swatch: [string, string, string];
}

export const PALETTE: PaletteEntry[] = [
  { key: 'classic',  label: 'Classic',  swatch: ['#37003C', '#00FF87', '#E90052'] },
  { key: 'pitch',    label: 'Pitch',    swatch: ['#06371F', '#B6FF3C', '#FFFFFF'] },
  { key: 'electric', label: 'Electric', swatch: ['#1B0A3E', '#04F5FF', '#FF2D9B'] },
];

const ACCENTS: Record<PaletteKey, {
  primary: string; primaryGrad: string;
  accent: string; accentLight: string;
  accentGrad: string; accentInk: string;
  pink: string; cyan: string;
}> = {
  classic: {
    primary:     '#37003C',
    primaryGrad: 'linear-gradient(135deg, #37003C 0%, #6A0060 100%)',
    accent:      '#00E676',
    accentLight: '#00B863',
    accentGrad:  'linear-gradient(90deg, #00FF87 0%, #04F5FF 100%)',
    accentInk:   '#06351E',
    pink:        '#E90052',
    cyan:        '#04C9D6',
  },
  pitch: {
    primary:     '#06371F',
    primaryGrad: 'linear-gradient(135deg, #06371F 0%, #0B6B38 100%)',
    accent:      '#A6F03C',
    accentLight: '#5C9B12',
    accentGrad:  'linear-gradient(90deg, #B6FF3C 0%, #5CE36B 100%)',
    accentInk:   '#1A2E00',
    pink:        '#FF7A00',
    cyan:        '#39C16C',
  },
  electric: {
    primary:     '#1B0A3E',
    primaryGrad: 'linear-gradient(135deg, #1B0A3E 0%, #4A1B8C 100%)',
    accent:      '#04F5FF',
    accentLight: '#0093B8',
    accentGrad:  'linear-gradient(90deg, #04F5FF 0%, #8A6BFF 100%)',
    accentInk:   '#04212A',
    pink:        '#FF2D9B',
    cyan:        '#04F5FF',
  },
};

export function getTheme(paletteKey: PaletteKey = 'classic', dark = false): Theme {
  const a = ACCENTS[paletteKey] ?? ACCENTS.classic;
  const base = dark
    ? {
        bg:         '#120016',
        bg2:        '#1C0922',
        surface:    '#241030',
        surfaceAlt: '#2E1640',
        surface2:   '#190a22',
        text:       '#F6EEFB',
        textMuted:  '#B49CC6',
        textFaint:  '#917A9C',
        line:       'rgba(255,255,255,0.09)',
        lineStrong: 'rgba(255,255,255,0.16)',
        accent:     a.accent,
        accentInk:  a.accentInk,
        shadow:     '0 10px 30px rgba(0,0,0,0.5)',
        islandText: '#fff',
      }
    : {
        bg:         '#EFE9F3',
        bg2:        '#E6DCEE',
        surface:    '#FFFFFF',
        surfaceAlt: '#F6F1FA',
        surface2:   '#FBF8FD',
        text:       '#23042B',
        textMuted:  '#74627E',
        textFaint:  '#776182',
        line:       'rgba(40,0,48,0.09)',
        lineStrong: 'rgba(40,0,48,0.16)',
        accent:     a.accentLight,
        accentInk:  '#fff',
        shadow:     '0 10px 30px rgba(40,0,48,0.12)',
        islandText: '#000',
      };

  return {
    dark,
    paletteKey,
    ...base,
    primary:        a.primary,
    primaryGrad:    a.primaryGrad,
    accentGrad:     a.accentGrad,
    accentChip:     a.accent,
    accentLight:    a.accentLight,
    pink:           a.pink,
    cyan:           a.cyan,
    onPrimary:      '#FFFFFF',
    onPrimaryMuted: 'rgba(255,255,255,0.62)',
  };
}
