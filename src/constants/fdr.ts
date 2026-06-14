//
// Fixture Difficulty Rating colour scale. FPL difficulty is 1..5:
// 1-2 easy (green), 3 neutral (grey), 4-5 hard (red). Tuned for legible
// text on each band in both light and dark mode.

export interface FdrColor {
  bg: string;
  text: string;
}

const LIGHT: Record<1 | 2 | 3 | 4 | 5, FdrColor> = {
  1: { bg: '#1A8A4F', text: '#FFFFFF' },
  2: { bg: '#4FC07E', text: '#06281A' },
  3: { bg: '#D8DAE3', text: '#2A2F3D' },
  4: { bg: '#FF5274', text: '#FFFFFF' },
  5: { bg: '#8E1338', text: '#FFFFFF' },
};

const DARK: Record<1 | 2 | 3 | 4 | 5, FdrColor> = {
  1: { bg: '#12653A', text: '#EAFBF1' },
  2: { bg: '#2E9D62', text: '#EAFBF1' },
  3: { bg: '#2A3145', text: '#C7CEE0' },
  4: { bg: '#C9344F', text: '#FFFFFF' },
  5: { bg: '#7A1031', text: '#FFE3EA' },
};

export function fdrColor(difficulty: number, dark: boolean): FdrColor {
  const clamped = Math.min(5, Math.max(1, Math.round(difficulty))) as 1 | 2 | 3 | 4 | 5;
  return (dark ? DARK : LIGHT)[clamped];
}
