const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockOptIn = jest.fn();
const mockOptOut = jest.fn();
let mockConstructedWith: { key: string; opts: Record<string, unknown> } | undefined;
let mockOptedOutValue = false;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { posthogKey: 'phc_test', posthogHost: 'https://us.i.posthog.com' },
    },
  },
}));

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: class {
    constructor(key: string, opts: Record<string, unknown>) {
      mockConstructedWith = { key, opts };
    }
    capture(...args: unknown[]) {
      return mockCapture(...args);
    }
    identify(...args: unknown[]) {
      return mockIdentify(...args);
    }
    reset(...args: unknown[]) {
      return mockReset(...args);
    }
    optIn(...args: unknown[]) {
      return mockOptIn(...args);
    }
    optOut(...args: unknown[]) {
      return mockOptOut(...args);
    }
    get optedOut() {
      return mockOptedOutValue;
    }
  },
}));

import { track, identify, reset, optIn, optOut, isOptedOut, setAnalyticsConsent } from '@/lib/analytics';

describe('analytics core', () => {
  beforeEach(() => jest.clearAllMocks());

  it('constructs the client with the configured key, US host, and hardening', () => {
    expect(mockConstructedWith?.key).toBe('phc_test');
    expect(mockConstructedWith?.opts.host).toBe('https://us.i.posthog.com');
    expect(mockConstructedWith?.opts.disabled).toBe(false);
    expect(mockConstructedWith?.opts.disableGeoip).toBe(true);
  });

  it('track forwards the typed event + props to capture', () => {
    track('sign_in', { provider: 'email' });
    expect(mockCapture).toHaveBeenCalledWith('sign_in', { provider: 'email' });
  });

  it('identify and reset delegate to the client', () => {
    identify('user-1');
    expect(mockIdentify).toHaveBeenCalledWith('user-1');
    reset();
    expect(mockReset).toHaveBeenCalled();
  });

  it('opt in/out and consent map to the client', () => {
    optOut();
    expect(mockOptOut).toHaveBeenCalled();
    optIn();
    expect(mockOptIn).toHaveBeenCalled();
    setAnalyticsConsent(false);
    expect(mockOptOut).toHaveBeenCalledTimes(2);
    setAnalyticsConsent(true);
    expect(mockOptIn).toHaveBeenCalledTimes(2);
  });

  it('isOptedOut reflects the client', () => {
    mockOptedOutValue = true;
    expect(isOptedOut()).toBe(true);
    mockOptedOutValue = false;
    expect(isOptedOut()).toBe(false);
  });
});

describe('analytics with no key', () => {
  it('constructs the client disabled', () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
    let opts: Record<string, unknown> | undefined;
    jest.doMock('posthog-react-native', () => ({
      __esModule: true,
      default: class {
        constructor(_key: string, o: Record<string, unknown>) {
          opts = o;
        }
        capture() {}
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/analytics');
    expect(opts?.disabled).toBe(true);
  });
});
