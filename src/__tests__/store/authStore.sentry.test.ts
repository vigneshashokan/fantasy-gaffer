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

import { handleAuthChange } from '@/store/authStore';

describe('authStore Sentry user scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets the Sentry user id on SIGNED_IN', () => {
    handleAuthChange('SIGNED_IN', {
      user: { id: 'u-42', app_metadata: { provider: 'email' } },
    } as never);
    expect(mockSetSentryUser).toHaveBeenCalledWith('u-42');
  });

  it('clears the Sentry user on SIGNED_OUT', () => {
    handleAuthChange('SIGNED_OUT', null);
    expect(mockSetSentryUser).toHaveBeenCalledWith(null);
  });
});
