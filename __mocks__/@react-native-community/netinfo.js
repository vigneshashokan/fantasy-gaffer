// Manual mock — jest auto-applies this for every `@react-native-community/netinfo`
// import so tests never touch the native module. The bridge/banner tests override
// these per-case (e.g. (useNetInfo as jest.Mock).mockReturnValue(...)).
const NetInfo = {
  addEventListener: jest.fn(() => jest.fn()), // returns an unsubscribe fn
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
};

module.exports = {
  __esModule: true,
  default: NetInfo,
  addEventListener: NetInfo.addEventListener,
  fetch: NetInfo.fetch,
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
};
