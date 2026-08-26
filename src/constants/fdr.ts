//
// Fixture Difficulty Rating colour scale. FPL difficulty is 1..5:
// 1-2 easy (green), 3 neutral, 4-5 hard (red).
//
// The v2 mock paints fixture cards as a SOFT tint plus a 1px border, with the
// label text in the normal theme colours — not as solid chips with their own
// ink. It only draws three bands; these keep all five, because a 5 (away to
// the champions) is worth telling apart from a 4 in an FPL app.
export interface FdrSoft {
  bg: string;
  border: string;
}

const LIGHT: Record<1 | 2 | 3 | 4 | 5, FdrSoft> = {
  1: { bg: 'rgba(0,180,90,0.17)', border: '#1A8A4F' },
  2: { bg: 'rgba(0,180,90,0.09)', border: '#4FC07E' },
  3: { bg: 'rgba(40,10,60,0.05)', border: 'rgba(40,10,60,0.18)' },
  4: { bg: 'rgba(233,0,82,0.09)', border: '#FF5274' },
  5: { bg: 'rgba(142,19,56,0.15)', border: '#8E1338' },
};

const DARK: Record<1 | 2 | 3 | 4 | 5, FdrSoft> = {
  1: { bg: 'rgba(0,228,120,0.18)', border: '#00E478' },
  2: { bg: 'rgba(0,228,120,0.10)', border: '#2E9D62' },
  3: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.14)' },
  4: { bg: 'rgba(255,40,90,0.14)', border: '#C9344F' },
  5: { bg: 'rgba(255,40,90,0.22)', border: '#FF8AA3' },
};

export function fdrSoft(difficulty: number, dark: boolean): FdrSoft {
  const clamped = Math.min(5, Math.max(1, Math.round(difficulty))) as 1 | 2 | 3 | 4 | 5;
  return (dark ? DARK : LIGHT)[clamped];
}
