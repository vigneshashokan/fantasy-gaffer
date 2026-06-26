import * as Notifications from 'expo-notifications';

// Foreground display behaviour. Imported for its side-effect from the root layout.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
