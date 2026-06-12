import type { TopPickPlayer } from '@/types/fpl';

// xPts derived from form, gently varied by price hash. Matches prototype formula.
export function xPtsOf(p: Pick<TopPickPlayer, 'f' | 'p'>): number {
  return p.f + 0.3 + (Math.round(p.p * 10) % 4) * 0.1;
}

// HSL hue band that gets brighter as xPts climbs.
export function xpColor(v: number, dark: boolean): string {
  const t = Math.max(0, Math.min(1, (v - 3) / 6));
  const L = dark ? 80 - t * 16 : 68 - t * 20;
  return `hsl(263, ${dark ? 78 : 72}%, ${L}%)`;
}
