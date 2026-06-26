import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface RegistrationResult {
  status: string;
  token: string | null;
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Single push-registration egress. Returns the Expo push token only when this is
// a physical device AND permission is granted; otherwise token is null with the
// resolved permission status. Never throws on the permission/non-device paths.
export async function registerForPushNotifications(): Promise<RegistrationResult> {
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    const { status } = await Notifications.getPermissionsAsync();
    return { status, token: null };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted' && existing.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { status, token: null };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    const resp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return { status, token: resp.data };
  } catch {
    // Token fetch can fail on a real device (no network, APNs/FCM not yet
    // configured). Degrade to no-token rather than throwing into callers.
    return { status, token: null };
  }
}
