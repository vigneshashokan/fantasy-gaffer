// src/__tests__/api/clubs.test.tsx
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useClubs, clubsFromRows } from '@/api/clubs';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('clubsFromRows adapter', () => {
  it('maps short_name to ClubCode and joins kit colors', () => {
    const rows = [
      { id: 1, short_name: 'ARS', name: 'Arsenal' },
      { id: 11, short_name: 'LIV', name: 'Liverpool' },
    ];
    const result = clubsFromRows(rows);
    expect(result.ARS).toEqual({ name: 'Arsenal', kit: '#EF0107', kit2: '#fff', ink: '#fff' });
    expect(result.LIV).toEqual({ name: 'Liverpool', kit: '#C8102E', kit2: '#00B2A9', ink: '#fff' });
  });

  it('drops rows whose short_name is not a known ClubCode', () => {
    const rows = [
      { id: 99, short_name: 'XYZ', name: 'Unknown FC' },
      { id: 1,  short_name: 'ARS', name: 'Arsenal' },
    ];
    const result = clubsFromRows(rows);
    expect(result).not.toHaveProperty('XYZ');
    expect(result.ARS).toBeDefined();
  });
});

describe('useClubs', () => {
  it('returns mapped clubs from supabase', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [{ id: 1, short_name: 'ARS', name: 'Arsenal' }],
        error: null,
      }),
    });
    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClubs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ARS?.name).toBe('Arsenal');
  });
});
