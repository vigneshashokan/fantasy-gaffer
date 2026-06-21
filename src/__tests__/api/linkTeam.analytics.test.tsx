import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  track: (...a: unknown[]) => mockTrack(...a),
}));

const mockEq = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: () => ({ update: () => ({ eq: mockEq }) }),
  },
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ session: { user: { id: 'u-1' } } }),
}));

import { useLinkTeam } from '@/api/linkTeam';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useLinkTeam analytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tracks squad_imported on a successful link', async () => {
    const { result } = renderHook(() => useLinkTeam(), { wrapper });
    result.current.mutate({ teamId: 123 });
    await waitFor(() =>
      expect(mockTrack).toHaveBeenCalledWith('squad_imported', { via: 'team_id' }),
    );
  });
});
