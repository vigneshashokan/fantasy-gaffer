const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockDeletePushToken = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}));
jest.mock('@/lib/analytics', () => ({ __esModule: true, identify: jest.fn(), reset: jest.fn(), track: jest.fn() }));
jest.mock('@/api/pushTokens', () => ({ __esModule: true, deletePushToken: (...a: unknown[]) => mockDeletePushToken(...a) }));
jest.mock('@/store/pushStore', () => ({ __esModule: true, usePushStore: { getState: () => ({ token: 'ExponentPushToken[abc]' }) } }));

import { useAuthStore } from '@/store/authStore';

describe('authStore.signOut push cleanup', () => {
  it('deletes the cached device token before signing out', async () => {
    await useAuthStore.getState().signOut();
    expect(mockDeletePushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockDeletePushToken.mock.invocationCallOrder[0]).toBeLessThan(mockSignOut.mock.invocationCallOrder[0]);
  });
});
