const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockTrack = jest.fn();

jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  identify: (...a: unknown[]) => mockIdentify(...a),
  reset: (...a: unknown[]) => mockReset(...a),
  track: (...a: unknown[]) => mockTrack(...a),
}));

// authStore subscribes to supabase at module init; stub the client so import is safe.
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

import { handleAuthChange } from '@/store/authStore';

describe('handleAuthChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the user and tracks sign_in on SIGNED_IN', () => {
    // Reset module state first so this case is clean.
    handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    handleAuthChange('SIGNED_IN', {
      user: { id: 'u-9', app_metadata: { provider: 'google' } },
    } as never);
    expect(mockIdentify).toHaveBeenCalledWith('u-9');
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'google' });
  });

  it('falls back to provider "unknown" when missing', () => {
    handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    handleAuthChange('SIGNED_IN', { user: { id: 'u-1', app_metadata: {} } } as never);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'unknown' });
  });

  it('resets identity on SIGNED_OUT', () => {
    handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    handleAuthChange('SIGNED_OUT', null);
    expect(mockReset).toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('deduplicates sign_in: fires track once but identify on every SIGNED_IN for same user', () => {
    // Reset module-level state via SIGNED_OUT, then clear mocks.
    handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    const session = { user: { id: 'dup-1', app_metadata: { provider: 'email' } } } as never;
    handleAuthChange('SIGNED_IN', session);
    handleAuthChange('SIGNED_IN', session);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'email' });
    expect(mockIdentify).toHaveBeenCalledTimes(2);
  });

  it('fires sign_in when a different user logs in after sign-out', () => {
    // Reset module dedup state and mocks.
    handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();

    // User A signs in.
    handleAuthChange('SIGNED_IN', {
      user: { id: 'user-A', app_metadata: { provider: 'email' } },
    } as never);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'email' });

    // User A signs out.
    handleAuthChange('SIGNED_OUT', null);

    // User B signs in (different user).
    handleAuthChange('SIGNED_IN', {
      user: { id: 'user-B', app_metadata: { provider: 'google' } },
    } as never);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'google' });

    // Verify sign_in was tracked exactly twice (once for A, once for B).
    const signInCalls = mockTrack.mock.calls.filter(call => call[0] === 'sign_in');
    expect(signInCalls).toHaveLength(2);
  });
});
