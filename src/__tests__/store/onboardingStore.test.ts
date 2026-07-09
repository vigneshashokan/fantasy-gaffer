jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { act } from 'react';
import { useOnboardingStore } from '@/store/onboardingStore';

const ALL_UNSEEN = { 'top-picks': false, team: false, transfer: false } as const;

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ seen: { ...ALL_UNSEEN } });
  });

  it('initialises with every tab unseen', () => {
    expect(useOnboardingStore.getState().seen).toEqual(ALL_UNSEEN);
  });

  it('markSeen flips only the targeted tab', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    const seen = useOnboardingStore.getState().seen;
    expect(seen.team).toBe(true);
    expect(seen['top-picks']).toBe(false);
    expect(seen.transfer).toBe(false);
  });

  it('markSeen on a second tab does not clear the first', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    act(() => useOnboardingStore.getState().markSeen('transfer'));
    const seen = useOnboardingStore.getState().seen;
    expect(seen.team).toBe(true);
    expect(seen.transfer).toBe(true);
    expect(seen['top-picks']).toBe(false);
  });

  it('resetAll clears every tab back to unseen', () => {
    act(() => useOnboardingStore.getState().markSeen('team'));
    act(() => useOnboardingStore.getState().markSeen('transfer'));
    act(() => useOnboardingStore.getState().resetAll());
    expect(useOnboardingStore.getState().seen).toEqual(ALL_UNSEEN);
  });
});
