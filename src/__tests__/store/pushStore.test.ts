const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
  },
}));

import { usePushStore } from '@/store/pushStore';

describe('pushStore', () => {
  it('setPrimingShown flips the flag and persists it', () => {
    usePushStore.getState().setPrimingShown();
    expect(usePushStore.getState().primingShown).toBe(true);
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('fantasy-gaffer/push-priming-shown', 'true');
  });

  it('setToken caches the token', () => {
    usePushStore.getState().setToken('ExponentPushToken[abc]');
    expect(usePushStore.getState().token).toBe('ExponentPushToken[abc]');
  });
});
