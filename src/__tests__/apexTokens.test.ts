import { apexTokens } from '@/constants/apexTokens';

describe('apexTokens', () => {
  it('returns dark tokens', () => {
    const tk = apexTokens(true, 'classic');
    expect(tk.bg).toBe('#020617');
    expect(tk.card).toBe('#0B1224');
    expect(tk.green).toBe('#00E478');
    expect(tk.chipFill).toBe('#37003C'); // classic active
  });

  it('returns light tokens', () => {
    const tk = apexTokens(false, 'classic');
    expect(tk.bg).toBe('#FAF8FF');
    expect(tk.card).toBe('#FFFFFF');
    expect(tk.green).toBe('#008343');
    expect(tk.chipFill).toBe('#37003C');
  });

  it('uses pitch palette', () => {
    const tk = apexTokens(false, 'pitch');
    expect(tk.chipFill).toBe('#0B6B38'); // pitch active
  });

  it('uses electric palette', () => {
    const tk = apexTokens(true, 'electric');
    expect(tk.chipFill).toBe('#4A1B8C'); // electric active
  });

  it('falls back to classic for unknown palette', () => {
    const tk = apexTokens(false, 'unknown' as any);
    expect(tk.bg).toBe('#FAF8FF');
  });
});
