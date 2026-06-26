import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/authStore';
import { registerForPushNotifications } from '@/lib/notifications/register';
import { upsertPushToken } from '@/api/pushTokens';
import { usePushStore } from '@/store/pushStore';

// On an authenticated launch where permission is already granted, silently
// refresh the token (last_seen_at + rotation). No prompt — that's the priming.
export function usePushTokenSync(): void {
  const userId = useAuthStore((s) => s.session?.user.id);
  const setToken = usePushStore((s) => s.setToken);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      const { token } = await registerForPushNotifications();
      if (cancelled || !token) return;
      setToken(token);
      await upsertPushToken(userId, token).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, setToken]);
}
