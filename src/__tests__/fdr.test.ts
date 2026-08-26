import { fdrSoft } from '@/constants/fdr';

describe('fdrSoft', () => {
  it('returns the easy band for difficulty 2 in light mode', () => {
    expect(fdrSoft(2, false)).toEqual({ bg: 'rgba(0,180,90,0.09)', border: '#4FC07E' });
  });
  it('returns the very-hard band for difficulty 5 in dark mode', () => {
    expect(fdrSoft(5, true)).toEqual({ bg: 'rgba(255,40,90,0.22)', border: '#FF8AA3' });
  });
  it('clamps out-of-range difficulty into 1..5', () => {
    expect(fdrSoft(0, false)).toEqual(fdrSoft(1, false));
    expect(fdrSoft(9, false)).toEqual(fdrSoft(5, false));
  });
  it('rounds fractional difficulty', () => {
    expect(fdrSoft(3.4, false)).toEqual(fdrSoft(3, false));
  });
});
