// src/__tests__/api/linkTeam.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLinkTeam } from '@/api/linkTeam';
import { queryKeys } from '@/api/queryKeys';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useLinkTeam', () => {
  it('updates profiles.fpl_team_id for the current user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    const wrapper = ({ children }: { children: React.ReactNode }) => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
    const { result } = renderHook(() => useLinkTeam(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ teamId: 12345 });
    });

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ fpl_team_id: 12345 }));
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('invalidates the profile cache key on success', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const eq = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ update: jest.fn().mockReturnValue({ eq }) });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLinkTeam(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ teamId: 12345 });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.profile('current') });
  });

  it('throws when there is no authenticated user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLinkTeam(), { wrapper });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ teamId: 12345 });
      }),
    ).rejects.toThrow(/No authenticated user/);
  });

  it('surfaces supabase error when the update fails', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const eq = jest.fn().mockResolvedValue({ error: { message: 'forbidden', code: '42501' } });
    (supabase.from as jest.Mock).mockReturnValue({ update: jest.fn().mockReturnValue({ eq }) });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLinkTeam(), { wrapper });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ teamId: 12345 });
      }),
    ).rejects.toMatchObject({ message: 'forbidden' });
  });
});
