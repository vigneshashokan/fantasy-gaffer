const mockGetSession = jest.fn();
const mockInsert = jest.fn();
const mockEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({
  insert: mockInsert,
  delete: () => ({ eq: mockEq }),
}));
const mockSignOut = jest.fn();
const mockBiometricDisable = jest.fn();

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signOut: (args: unknown) => mockSignOut(args),
    },
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: {
    getState: () => ({ disable: () => mockBiometricDisable() }),
  },
}));

import { requestDeletion, cancelDeletion } from '@/lib/auth/account-deletion';

describe('requestDeletion', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockInsert.mockReset();
    mockFrom.mockClear();
    mockSignOut.mockReset();
    mockBiometricDisable.mockReset();
  });

  it('returns unauthorized when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await requestDeletion();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauthorized');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('INSERTs into account_deletions with the current user id, then signs out + disables biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockInsert).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(mockBiometricDisable).toHaveBeenCalled();
  });

  it('treats unique-violation (code 23505) as success and still signs out + disables biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockBiometricDisable).toHaveBeenCalled();
  });

  it('returns network error when INSERT fails and does NOT sign out or disable biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: { code: 'PGRST301', message: 'boom' } });

    const r = await requestDeletion();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockBiometricDisable).not.toHaveBeenCalled();
  });

  it('returns ok even when signOut fails (logged warn, deletion already landed)', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockRejectedValueOnce(new Error('boom'));
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
  });

  it('returns ok even when biometric disable fails', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockRejectedValueOnce(new Error('boom'));

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
  });
});

describe('cancelDeletion', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDelete.mockReset();
    mockEq.mockReset();
    mockFrom.mockClear();
  });

  it('returns unauthorized when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await cancelDeletion();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauthorized');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('DELETEs the account_deletions row for the current user', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockEq.mockResolvedValueOnce({ error: null });

    const r = await cancelDeletion();

    expect(r.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('returns network error on DELETE failure', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockEq.mockResolvedValueOnce({ error: { code: 'PGRST301', message: 'boom' } });

    const r = await cancelDeletion();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });
});
