// Manual mock — jest auto-applies this for every `@sentry/react-native` import,
// so suites that transitively reach the monitoring egress (authStore, _layout)
// never touch the native module. The dedicated sentry.test.ts inline-mocks
// instead, so it can inspect what Sentry.init was called with.
module.exports = {
  __esModule: true,
  init: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  wrap: jest.fn((component) => component),
  reactNavigationIntegration: jest.fn(() => ({ registerNavigationContainer: jest.fn() })),
};
