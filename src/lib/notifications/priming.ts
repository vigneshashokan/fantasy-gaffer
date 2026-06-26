import { registerForPushNotifications } from '@/lib/notifications/register';
import { upsertPushToken } from '@/api/pushTokens';
import { usePushStore } from '@/store/pushStore';
import { track } from '@/lib/analytics';

// The Enable-flow: request permission, and on grant cache + persist the token.
// Pure logic (no React) so it is unit-testable; called from PushOrchestrator.
export async function runPrimingEnable(userId: string | undefined): Promise<'granted' | 'denied'> {
  const { status, token } = await registerForPushNotifications();
  if (status === 'granted') {
    if (token && userId) {
      usePushStore.getState().setToken(token);
      await upsertPushToken(userId, token).catch(() => {});
    }
    track('push_permission_granted', {});
    return 'granted';
  }
  track('push_permission_denied', {});
  return 'denied';
}
