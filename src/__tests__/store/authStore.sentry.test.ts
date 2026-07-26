const mockSetSentryUser = jest.fn();

jest.mock('@/lib/monitoring/sentry', () => ({
  __esModule: true,
  setSentryUser: (...a: unknown[]) => mockSetSentryUser(...a),
  captureException: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  identify: jest.fn(),
  reset: jest.fn(),
  track: jest.fn(),
}));
jest.mock('@/api/pushTokens', () => ({ __esModule: true, deletePushToken: jest.fn() }));
jest.mock('@/store/pushStore', () => ({
  __esModule: true,
  usePushStore: { getState: () => ({ token: null }) },
}));
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { handleAuthChange } from '@/store/authStore';

const sessionFor = (id: string) => ({ user: { id, app_metadata: { provider: 'email' } } }) as never;

describe('authStore Sentry user scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets the Sentry user id on SIGNED_IN', async () => {
    await handleAuthChange('SIGNED_IN', sessionFor('u-42'));
    expect(mockSetSentryUser).toHaveBeenCalledWith('u-42');
  });

  // The cold-start path: a stored access token older than the JWT's hour is
  // refreshed during initialize(), which emits INITIAL_SESSION and
  // TOKEN_REFRESHED but never SIGNED_IN. Scoping only on SIGNED_IN left
  // those launches reporting crashes with no user attached.
  it('sets the Sentry user id on INITIAL_SESSION', async () => {
    await handleAuthChange('INITIAL_SESSION', sessionFor('u-42'));
    expect(mockSetSentryUser).toHaveBeenCalledWith('u-42');
  });

  it('sets the Sentry user id on TOKEN_REFRESHED', async () => {
    await handleAuthChange('TOKEN_REFRESHED', sessionFor('u-42'));
    expect(mockSetSentryUser).toHaveBeenCalledWith('u-42');
  });

  it('does not scope a sessionless INITIAL_SESSION', async () => {
    await handleAuthChange('INITIAL_SESSION', null);
    expect(mockSetSentryUser).not.toHaveBeenCalled();
  });

  it('clears the Sentry user on SIGNED_OUT', async () => {
    await handleAuthChange('SIGNED_OUT', null);
    expect(mockSetSentryUser).toHaveBeenCalledWith(null);
  });
});
