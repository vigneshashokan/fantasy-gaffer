const mockRegister = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue(undefined);
const mockTrack = jest.fn();
const mockSetToken = jest.fn();

jest.mock('@/lib/notifications/register', () => ({ __esModule: true, registerForPushNotifications: (...a: unknown[]) => mockRegister(...a) }));
jest.mock('@/api/pushTokens', () => ({ __esModule: true, upsertPushToken: (...a: unknown[]) => mockUpsert(...a) }));
jest.mock('@/lib/analytics', () => ({ __esModule: true, track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/store/pushStore', () => ({ __esModule: true, usePushStore: { getState: () => ({ setToken: mockSetToken }) } }));

import { runPrimingEnable } from '@/lib/notifications/priming';

describe('runPrimingEnable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('on grant: caches token, upserts it, tracks granted', async () => {
    mockRegister.mockResolvedValue({ status: 'granted', token: 'ExponentPushToken[abc]' });
    const result = await runPrimingEnable('u-1');
    expect(result).toBe('granted');
    expect(mockSetToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
    expect(mockUpsert).toHaveBeenCalledWith('u-1', 'ExponentPushToken[abc]');
    expect(mockTrack).toHaveBeenCalledWith('push_permission_granted', {});
  });

  it('on denial: tracks denied, no upsert', async () => {
    mockRegister.mockResolvedValue({ status: 'denied', token: null });
    const result = await runPrimingEnable('u-1');
    expect(result).toBe('denied');
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('push_permission_denied', {});
  });

  it('on grant with no token: tracks granted, no upsert, no setToken', async () => {
    mockRegister.mockResolvedValue({ status: 'granted', token: null });
    const result = await runPrimingEnable('u-1');
    expect(result).toBe('granted');
    expect(mockTrack).toHaveBeenCalledWith('push_permission_granted', {});
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSetToken).not.toHaveBeenCalled();
  });
});
