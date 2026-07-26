import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthErrorBoundary } from '@/lib/auth/authErrorBoundary';
import { FplFetchError } from '@/api/fpl-client';

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

// The real shape supabase-js surfaces for an expired JWT: a PostgrestError,
// which carries `code` and NOT `status`.
function jwtExpiredError() {
  const e = new Error('JWT expired') as Error & {
    code: string;
    details: string;
    hint: string;
  };
  e.name = 'PostgrestError';
  e.code = 'PGRST301';
  e.details = '';
  e.hint = '';
  return e;
}

async function runFailingQuery(client: QueryClient, key: string, error: unknown) {
  await act(async () => {
    await client
      .fetchQuery({
        queryKey: [key],
        queryFn: async () => {
          throw error;
        },
        retry: false,
      })
      .catch(() => {});
  });
}

function mount(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <AuthErrorBoundary />
    </QueryClientProvider>,
  );
}

describe('AuthErrorBoundary', () => {
  it('calls refreshSession on a PostgREST expired-JWT error', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    const client = new QueryClient();
    mount(client);
    await runFailingQuery(client, 'x', jwtExpiredError());
    await waitFor(() => expect(supabase.auth.refreshSession).toHaveBeenCalled());
  });

  it('calls signOut when refreshSession itself fails', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: {},
      error: { message: 'refresh failed' },
    });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });

    const client = new QueryClient();
    mount(client);
    await runFailingQuery(client, 'y', jwtExpiredError());
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });

  it('ignores an FPL 401 — refreshing the Supabase session would be wrong', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    const client = new QueryClient();
    mount(client);
    await runFailingQuery(client, 'fpl', new FplFetchError('FPL 401 for /x', 401));
    await new Promise((r) => setTimeout(r, 0));
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('ignores an unrelated PostgREST error', async () => {
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: {}, error: null });
    const client = new QueryClient();
    mount(client);
    const e = new Error('violates row-level security') as Error & { code: string };
    e.code = '42501';
    await runFailingQuery(client, 'rls', e);
    await new Promise((r) => setTimeout(r, 0));
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });
});
