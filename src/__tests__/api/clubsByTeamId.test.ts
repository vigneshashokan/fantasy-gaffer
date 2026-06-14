// src/__tests__/api/clubsByTeamId.test.tsx
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { clubCodeByTeamIdFromRows } from '@/api/clubs';

describe('clubCodeByTeamIdFromRows', () => {
  it('maps numeric team id to club code, dropping unknown codes', () => {
    const rows = [
      { id: 1, short_name: 'ARS', name: 'Arsenal' },
      { id: 13, short_name: 'MCI', name: 'Man City' },
      { id: 99, short_name: 'ZZZ', name: 'Not Real' },
    ];
    expect(clubCodeByTeamIdFromRows(rows)).toEqual({ 1: 'ARS', 13: 'MCI' });
  });
});
