// src/__tests__/api/profile.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { profileFromRow, useProfile } from '@/api/profile';
import { queryKeys } from '@/api/queryKeys';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));
jest.mock('@/store/biometricStore', () => ({
  useBiometricStore: () => ({ enabled: true }),
}));
jest.mock('@/store/authStore', () => ({
  useAuthStore: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

function setSession(session: { user: { id: string; email: string } } | null) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((selector?: (s: unknown) => unknown) => {
    const state = { session };
    return selector ? selector(state) : state;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('profileFromRow', () => {
  it('maps DB columns to Profile shape with faceId from biometric store', () => {
    const row = {
      first_name: 'Apex', last_name: 'Gaffer',
      dob: '1990-08-14',
      fpl_team_id: 12345,
    };
    const result = profileFromRow(row, 'apex@example.com', true);
    expect(result).toEqual({
      firstName: 'Apex',
      lastName: 'Gaffer',
      dob: '14 Aug 1990',
      gender: 'Prefer not to say',
      email: 'apex@example.com',
      faceId: true,
      fplTeamId: 12345,
    });
  });

  it('returns null fplTeamId when DB column is null', () => {
    const row = {
      first_name: 'A', last_name: 'B', dob: '2000-01-01', fpl_team_id: null,
    };
    expect(profileFromRow(row, 'x@y.com', false).fplTeamId).toBeNull();
  });
});

describe('useProfile', () => {
  it('fetches the row for the current user and uses a user-scoped cache key', async () => {
    setSession({ user: { id: 'user-A', email: 'apex@example.com' } });
    const single = jest.fn().mockResolvedValue({
      data: { first_name: 'Apex', last_name: 'Gaffer', dob: '1990-08-14', fpl_team_id: null },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single }),
      }),
    });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.firstName).toBe('Apex');
    expect(result.current.data?.email).toBe('apex@example.com');

    // Cache key is scoped by the auth user id, not a static literal.
    const matched = client.getQueryCache().findAll({ queryKey: queryKeys.profile('user-A') });
    expect(matched).toHaveLength(1);
  });

  it('stays idle when there is no session', () => {
    setSession(null);

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('refetches under a fresh cache key when the auth user changes', async () => {
    const single = jest.fn()
      .mockResolvedValueOnce({
        data: { first_name: 'Alice', last_name: 'A', dob: '1990-01-01', fpl_team_id: 111 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { first_name: 'Bob', last_name: 'B', dob: '1991-02-02', fpl_team_id: 222 },
        error: null,
      });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single }),
      }),
    });

    const client = makeTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    setSession({ user: { id: 'user-A', email: 'a@x.com' } });
    const { result, rerender } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.data?.firstName).toBe('Alice'));

    // Auth user changes — same hook instance, different session.
    setSession({ user: { id: 'user-B', email: 'b@x.com' } });
    rerender(undefined);
    await waitFor(() => expect(result.current.data?.firstName).toBe('Bob'));

    expect(client.getQueryCache().findAll({ queryKey: queryKeys.profile('user-A') })).toHaveLength(1);
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.profile('user-B') })).toHaveLength(1);
  });
});
