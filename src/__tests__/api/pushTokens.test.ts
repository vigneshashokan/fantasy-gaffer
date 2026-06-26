const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockDeleteEq = jest.fn().mockResolvedValue({ error: null });
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: { from: jest.fn(() => ({ upsert: mockUpsert, delete: mockDelete })) },
}));

import { upsertPushToken, deletePushToken } from '@/api/pushTokens';

describe('pushTokens api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts the token with user_id + onConflict user_id,token', async () => {
    await upsertPushToken('u-1', 'ExponentPushToken[abc]');
    const [row, opts] = mockUpsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: 'u-1', token: 'ExponentPushToken[abc]' });
    expect(row.last_seen_at).toEqual(expect.any(String));
    expect(['ios', 'android']).toContain(row.platform);
    expect(opts).toEqual({ onConflict: 'user_id,token' });
  });

  it('deletes by token (RLS scopes to the current user)', async () => {
    await deletePushToken('ExponentPushToken[abc]');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith('token', 'ExponentPushToken[abc]');
  });
});
