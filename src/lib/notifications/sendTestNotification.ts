import * as Notifications from 'expo-notifications';

export interface TestNotificationPayload {
  title: string;
  body: string;
  /** Deep-link target — must start with `/` to be routed (see useNotificationDeepLinks). */
  url: string;
  /** Rides along for the `notification_opened { type }` analytics event. */
  type: string;
}

export interface TestNotificationResult {
  scheduled: boolean;
  status: string;
}

// DEV-ONLY harness for push Slice 1. Schedules a LOCAL notification carrying the
// exact `{ url, type }` deep-link payload a remote push would, so the deep-link
// routing + foreground display handler can be validated on a Simulator — no
// APNs/FCM, no EAS push credentials, no physical device required. Not wired into
// any production flow; strip with the settings dev section before merge.
//
// Requests notification authorization directly: iOS won't *display* even a local
// notification while undetermined, and the production register path skips the
// request on a simulator (Device.isDevice === false), so the priming flow can't
// grant it there. Returns scheduled:false (with the status) when not authorized.
export async function sendTestNotification(
  payload: TestNotificationPayload,
  delaySeconds = 4,
): Promise<TestNotificationResult> {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted' && existing.canAskAgain) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { scheduled: false, status };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      data: { url: payload.url, type: payload.type },
    },
    trigger:
      delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          }
        : null,
  });
  return { scheduled: true, status };
}
