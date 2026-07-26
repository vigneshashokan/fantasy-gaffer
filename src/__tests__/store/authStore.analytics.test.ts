const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockTrack = jest.fn();

jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  identify: (...a: unknown[]) => mockIdentify(...a),
  reset: (...a: unknown[]) => mockReset(...a),
  track: (...a: unknown[]) => mockTrack(...a),
}));

// authStore now imports pushTokens + pushStore; stub both so the module-init import is safe.
jest.mock('@/api/pushTokens', () => ({ __esModule: true, deletePushToken: jest.fn() }));
jest.mock('@/store/pushStore', () => ({ __esModule: true, usePushStore: { getState: () => ({ token: null }) } }));

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

const mockGetItem = jest.fn((_key: string): Promise<string | null> => Promise.resolve(null));
const mockSetItem = jest.fn((_key: string, _value: string): Promise<void> => Promise.resolve());
const mockRemoveItem = jest.fn((_key: string): Promise<void> => Promise.resolve());
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: mockGetItem, setItem: mockSetItem, removeItem: mockRemoveItem },
}));

// require, not `import`: authStore reads AsyncStorage at module scope to seed
// the sign_in dedupe, and ES imports hoist above the mock consts above — so a
// static import would invoke the factory before they exist.
const { handleAuthChange } = require('@/store/authStore') as typeof import('@/store/authStore');

const sessionFor = (id: string, provider?: string) =>
  ({ user: { id, app_metadata: provider ? { provider } : {} } }) as never;

describe('handleAuthChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the user and tracks sign_in on SIGNED_IN', async () => {
    // Reset module state first so this case is clean.
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('SIGNED_IN', sessionFor('u-9', 'google'));
    expect(mockIdentify).toHaveBeenCalledWith('u-9');
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'google' });
  });

  it('falls back to provider "unknown" when missing', async () => {
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('SIGNED_IN', sessionFor('u-1'));
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'unknown' });
  });

  it('resets identity on SIGNED_OUT', async () => {
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('SIGNED_OUT', null);
    expect(mockReset).toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('deduplicates sign_in: fires track once but identify on every SIGNED_IN for same user', async () => {
    // Reset module-level state via SIGNED_OUT, then clear mocks.
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    const session = sessionFor('dup-1', 'email');
    await handleAuthChange('SIGNED_IN', session);
    await handleAuthChange('SIGNED_IN', session);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'email' });
    expect(mockIdentify).toHaveBeenCalledTimes(2);
  });

  it('fires sign_in when a different user logs in after sign-out', async () => {
    // Reset module dedup state and mocks.
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();

    await handleAuthChange('SIGNED_IN', sessionFor('user-A', 'email'));
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'email' });

    await handleAuthChange('SIGNED_OUT', null);

    await handleAuthChange('SIGNED_IN', sessionFor('user-B', 'google'));
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'google' });

    const signInCalls = mockTrack.mock.calls.filter((call) => call[0] === 'sign_in');
    expect(signInCalls).toHaveLength(2);
  });

  // ---- #176: cold-start scoping ----

  it('identifies on INITIAL_SESSION without counting a sign_in', async () => {
    // The event a cold start actually delivers. Identity must be scoped
    // (otherwise every crash and event that launch is anonymous) but this is
    // a restore, not a sign-in, so the funnel must not move.
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('INITIAL_SESSION', sessionFor('u-cold', 'email'));
    expect(mockIdentify).toHaveBeenCalledWith('u-cold');
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('identifies on TOKEN_REFRESHED without counting a sign_in', async () => {
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('TOKEN_REFRESHED', sessionFor('u-refresh', 'email'));
    expect(mockIdentify).toHaveBeenCalledWith('u-refresh');
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('does not scope identity for a sessionless event', async () => {
    jest.clearAllMocks();
    await handleAuthChange('INITIAL_SESSION', null);
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('persists the dedupe so a relaunch does not re-count the same sign_in', async () => {
    // auth-js re-emits SIGNED_IN from its session-restore path on every cold
    // start, so a process-scoped flag counted one user's sign-in once per
    // launch. Simulate the relaunch: fresh module, dedupe key already on disk.
    jest.resetModules();
    jest.clearAllMocks();
    mockGetItem.mockReturnValueOnce(Promise.resolve('u-returning'));

    const { handleAuthChange: afterRelaunch } = require('@/store/authStore');
    await afterRelaunch('SIGNED_IN', sessionFor('u-returning', 'email'));

    expect(mockIdentify).toHaveBeenCalledWith('u-returning');
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('writes the dedupe key when a genuinely new sign_in is tracked', async () => {
    await handleAuthChange('SIGNED_OUT', null);
    jest.clearAllMocks();
    await handleAuthChange('SIGNED_IN', sessionFor('u-new', 'email'));
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'email' });
    expect(mockSetItem).toHaveBeenCalledWith('analytics_last_sign_in_user', 'u-new');
  });

  it('clears the persisted dedupe on SIGNED_OUT', async () => {
    jest.clearAllMocks();
    await handleAuthChange('SIGNED_OUT', null);
    expect(mockRemoveItem).toHaveBeenCalledWith('analytics_last_sign_in_user');
  });
});
