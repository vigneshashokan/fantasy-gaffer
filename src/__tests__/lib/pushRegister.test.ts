jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-123' } } } },
}));

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerForPushNotifications } from '@/lib/notifications/register';

describe('registerForPushNotifications', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    (Device as { isDevice: boolean }).isDevice = true;
  });

  it('returns the token when permission is granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[abc]' });
    const r = await registerForPushNotifications();
    expect(r).toEqual({ status: 'granted', token: 'ExponentPushToken[abc]' });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-123' });
  });

  it('requests permission when undetermined and can ask', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[xyz]' });
    const r = await registerForPushNotifications();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(r.token).toBe('ExponentPushToken[xyz]');
  });

  it('returns no token when permission denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: false });
    const r = await registerForPushNotifications();
    expect(r).toEqual({ status: 'denied', token: null });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns no token on a non-device (simulator)', async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const r = await registerForPushNotifications();
    expect(r.token).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('swallows a token-fetch rejection and returns token null', async () => {
    (Device as { isDevice: boolean }).isDevice = true;
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('no network'));
    const r = await registerForPushNotifications();
    expect(r).toEqual({ status: 'granted', token: null });
  });
});
