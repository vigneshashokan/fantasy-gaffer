import { fdrColor } from '@/constants/fdr';

describe('fdrColor', () => {
  it('returns the easy band for difficulty 2 in light mode', () => {
    expect(fdrColor(2, false)).toEqual({ bg: '#4FC07E', text: '#06281A' });
  });
  it('returns the very-hard band for difficulty 5 in dark mode', () => {
    expect(fdrColor(5, true)).toEqual({ bg: '#7A1031', text: '#FFE3EA' });
  });
  it('clamps out-of-range difficulty into 1..5', () => {
    expect(fdrColor(0, false)).toEqual(fdrColor(1, false));
    expect(fdrColor(9, false)).toEqual(fdrColor(5, false));
  });
  it('rounds fractional difficulty', () => {
    expect(fdrColor(3.4, false)).toEqual(fdrColor(3, false));
  });
});
