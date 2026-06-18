jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { projectionsFromRows } from '@/api/projections';

describe('projectionsFromRows', () => {
  it('keys by String(player_id) and carries p25/p50/p75', () => {
    const m = projectionsFromRows([
      { player_id: 7, p25: 2.1, p50: 5.4, p75: 9.8 },
      { player_id: 12, p25: 1.0, p50: 3.0, p75: 6.0 },
    ]);
    expect(m.get('7')).toEqual({ p25: 2.1, p50: 5.4, p75: 9.8 });
    expect(m.get('12')?.p50).toBe(3.0);
    expect(m.size).toBe(2);
  });

  it('returns an empty map for no rows', () => {
    expect(projectionsFromRows([]).size).toBe(0);
  });
});
