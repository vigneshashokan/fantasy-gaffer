// Manual mock — jest auto-uses this for every `expo-notifications` import so
// tests never load the real native SDK. Tests that assert behaviour override
// individual fns with jest.spyOn / local jest.mock.
module.exports = {
  __esModule: true,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { DEFAULT: 3, MAX: 5 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date', DAILY: 'daily' },
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id'),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[test]' }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  useLastNotificationResponse: jest.fn(() => null),
};
