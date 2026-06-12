import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthErrorBoundary } from '@/lib/auth/authErrorBoundary';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthErrorBoundary', () => {
  it('calls refreshSession when a query throws 401', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthErrorBoundary />
      </QueryClientProvider>,
    );
    await act(async () => {
      await client.fetchQuery({
        queryKey: ['x'],
        queryFn: async () => {
          const e: any = new Error('unauth');
          e.status = 401;
          throw e;
        },
        retry: false,
      }).catch(() => {});
    });
    await waitFor(() => expect(supabase.auth.refreshSession).toHaveBeenCalled());
  });

  it('calls signOut when refreshSession itself fails', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: {},
      error: { message: 'refresh failed' },
    });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthErrorBoundary />
      </QueryClientProvider>,
    );
    await act(async () => {
      await client.fetchQuery({
        queryKey: ['y'],
        queryFn: async () => {
          const e: any = new Error('unauth');
          e.status = 401;
          throw e;
        },
        retry: false,
      }).catch(() => {});
    });
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });
});
