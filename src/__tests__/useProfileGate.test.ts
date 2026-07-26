jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockProfilesMaybeSingle = jest.fn();
const mockProfilesEq = jest.fn((_col: string, _val: unknown) => ({
  maybeSingle: mockProfilesMaybeSingle,
}));
const mockProfilesSelect = jest.fn((_cols: string) => ({ eq: mockProfilesEq }));

const mockDeletionsMaybeSingle = jest.fn();
const mockDeletionsEq = jest.fn((_col: string, _val: unknown) => ({
  maybeSingle: mockDeletionsMaybeSingle,
}));
const mockDeletionsSelect = jest.fn((_cols: string) => ({ eq: mockDeletionsEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'profiles') return { select: mockProfilesSelect };
  if (table === 'account_deletions') return { select: mockDeletionsSelect };
  throw new Error('unexpected table: ' + table);
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: jest.fn(),
    },
    from: ((table: string) => mockFrom(table)) as never,
  },
}));

import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useProfileGate } from '../lib/useProfileGate';

const fakeSession = { user: { id: 'u1' }, access_token: 't' };

// A PostgREST failure resolves as { data: null, error } — it does not reject.
// That is the whole reason #170 existed, so the fixtures model it exactly.
const NETWORK_ERROR = {
  message: 'TypeError: Network request failed',
  details: '',
  hint: '',
  code: '',
};

// Fresh client per test so no verdict leaks across cases; retries off so a
// failing case resolves immediately instead of sleeping through backoff.
function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useProfileGate(), { wrapper });
}

describe('useProfileGate', () => {
  beforeEach(() => {
    mockProfilesMaybeSingle.mockReset();
    mockProfilesEq.mockClear();
    mockProfilesSelect.mockClear();
    mockDeletionsMaybeSingle.mockReset();
    mockDeletionsEq.mockClear();
    mockDeletionsSelect.mockClear();
    mockFrom.mockClear();
    act(() => useAuthStore.setState({ session: null, hydrated: true }));
  });

  it('stays loading while auth is unhydrated', () => {
    act(() => useAuthStore.setState({ session: null, hydrated: false }));
    const { result } = renderGate();
    expect(result.current.status).toBe('loading');
  });

  it('stays loading when there is no session', async () => {
    const { result } = renderGate();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.status).toBe('loading');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('resolves to missing when there is a session and no profile row', async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockProfilesEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('resolves to complete when a profile row is returned', async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });

  it('refetch() re-runs the query', async () => {
    mockProfilesMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('missing'));
    mockProfilesMaybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });

  it("resolves to 'pending_deletion' when a deletion row exists (regardless of profile)", async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({
      data: { user_id: 'u1', requested_at: '2026-05-31T12:00:00.000Z' },
      error: null,
    });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('pending_deletion'));
  });

  it("'pending_deletion' wins even when the profile row is missing", async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({
      data: { user_id: 'u1', requested_at: '2026-05-31T12:00:00.000Z' },
      error: null,
    });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('pending_deletion'));
  });

  it('stays loading if either query is still in flight', async () => {
    let resolveProfile: (v: unknown) => void = () => {};
    mockProfilesMaybeSingle.mockReturnValueOnce(
      new Promise((r) => {
        resolveProfile = r as never;
      }) as never,
    );
    mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.status).toBe('loading');
    resolveProfile({ data: null, error: null });
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });

  // ---- #170: a resolved-with-error read is not a verdict ----

  it("reports 'error', not 'missing', when the profiles read fails", async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: null, error: NETWORK_ERROR });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it("reports 'error', not 'complete', when the account_deletions read fails", async () => {
    // The dangerous half: a pending-deletion user would otherwise sail past
    // the restore gate the moment this one query hiccuped.
    mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: NETWORK_ERROR });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it("reports 'error' when a query rejects outright", async () => {
    mockProfilesMaybeSingle.mockRejectedValue(new Error('boom'));
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('keeps the last verdict when a later refetch fails', async () => {
    mockProfilesMaybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('complete'));

    mockProfilesMaybeSingle.mockResolvedValueOnce({ data: null, error: NETWORK_ERROR });
    mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => {
      result.current.refetch();
    });
    expect(result.current.status).toBe('complete');
  });

  // ---- #171: identity, not object identity ----

  it('ignores a session-object swap for the same user (TOKEN_REFRESHED)', async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('complete'));

    mockFrom.mockClear();
    // auth-js constructs a NEW Session object on every hourly token refresh
    // and authStore `set`s it, so subscribing to the object identity blanked
    // the home navigator once an hour. Same user id => nothing should move.
    act(() =>
      useAuthStore.setState({
        session: { user: { id: 'u1' }, access_token: 'refreshed' } as never,
      }),
    );
    expect(result.current.status).toBe('complete');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('re-resolves when the user id actually changes', async () => {
    mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderGate();
    await waitFor(() => expect(result.current.status).toBe('complete'));

    mockFrom.mockClear();
    act(() =>
      useAuthStore.setState({
        session: { user: { id: 'u2' }, access_token: 't' } as never,
      }),
    );
    await waitFor(() => expect(mockProfilesEq).toHaveBeenCalledWith('user_id', 'u2'));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
  });
});
