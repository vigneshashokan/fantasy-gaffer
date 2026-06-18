import { xpColor } from '@/utils/xpts';

describe('xpColor', () => {
  it('clamps low values to band start', () => {
    expect(xpColor(2, false)).toBe('hsl(263, 72%, 68%)');
  });

  it('clamps high values to band end', () => {
    expect(xpColor(12, false)).toBe('hsl(263, 72%, 48%)');
  });

  it('uses higher saturation in dark mode', () => {
    expect(xpColor(2, true)).toContain('78%');
  });
});
