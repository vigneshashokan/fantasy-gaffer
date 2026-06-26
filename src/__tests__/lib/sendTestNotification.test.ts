import * as Notifications from 'expo-notifications';
import { sendTestNotification } from '@/lib/notifications/sendTestNotification';

describe('sendTestNotification (dev harness)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('schedules a local notification carrying the deep-link payload in data', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    const r = await sendTestNotification({
      title: 'Deadline soon',
      body: 'GW1 deadline in 1h',
      url: '/(home)/(tabs)/transfer',
      type: 'deadline',
    });
    expect(r).toEqual({ scheduled: true, status: 'granted' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Deadline soon',
        body: 'GW1 deadline in 1h',
        data: { url: '/(home)/(tabs)/transfer', type: 'deadline' },
      },
      trigger: { type: 'timeInterval', seconds: 4 },
    });
  });

  it('requests permission when undetermined, then schedules on grant', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const r = await sendTestNotification({ title: 't', body: 'b', url: '/(home)/(tabs)/team', type: 'gw_confirm' });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(r.scheduled).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('does not schedule and reports status when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: false });
    const r = await sendTestNotification({ title: 't', body: 'b', url: '/(home)/(tabs)/team', type: 'gw_confirm' });
    expect(r).toEqual({ scheduled: false, status: 'denied' });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('uses an immediate (null) trigger when delaySeconds is 0', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    await sendTestNotification(
      { title: 't', body: 'b', url: '/(home)/(tabs)/team', type: 'gw_confirm' },
      0,
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: null }),
    );
  });
});
