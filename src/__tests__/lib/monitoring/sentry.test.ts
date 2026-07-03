// Inline-mock so we can inspect what Sentry.init was called with (the manual
// __mocks__ file is for OTHER suites). Mirrors src/__tests__/lib/analytics.test.ts.
let mockInitOpts: Record<string, unknown> | undefined;
const mockCapture = jest.fn();
const mockSetUser = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { sentryDsn: 'https://pub@o0.ingest.sentry.io/1' } } },
}));

jest.mock('@sentry/react-native', () => ({
  __esModule: true,
  init: (opts: Record<string, unknown>) => {
    mockInitOpts = opts;
  },
  captureException: (...a: unknown[]) => mockCapture(...a),
  setUser: (...a: unknown[]) => mockSetUser(...a),
  wrap: (c: unknown) => c,
  reactNavigationIntegration: () => ({ registerNavigationContainer: jest.fn() }),
}));

import { scrubEvent, captureException, setSentryUser } from '@/lib/monitoring/sentry';

describe('sentry monitoring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inits enabled with DSN, 0.15 trace sample, no default PII, and a beforeSend', () => {
    expect(mockInitOpts?.enabled).toBe(true);
    expect(mockInitOpts?.dsn).toBe('https://pub@o0.ingest.sentry.io/1');
    expect(mockInitOpts?.tracesSampleRate).toBe(0.15);
    expect(mockInitOpts?.sendDefaultPii).toBe(false);
    expect(typeof mockInitOpts?.beforeSend).toBe('function');
  });

  it('scrubEvent drops request/server_name and clamps user to id only', () => {
    const cleaned = scrubEvent({
      request: { url: 'https://x', cookies: 'sid=1' },
      server_name: 'host-1',
      user: { id: 'u-1', email: 'a@b.com', ip_address: '1.2.3.4' },
      message: 'boom',
    } as never);
    expect(cleaned.request).toBeUndefined();
    expect(cleaned.server_name).toBeUndefined();
    expect(cleaned.user).toEqual({ id: 'u-1' });
    expect((cleaned as { message?: string }).message).toBe('boom');
  });

  it('captureException forwards to Sentry with extra context', () => {
    const err = new Error('x');
    captureException(err, { foo: 'bar' });
    expect(mockCapture).toHaveBeenCalledWith(err, { extra: { foo: 'bar' } });
  });

  it('setSentryUser sets { id } or clears with null', () => {
    setSentryUser('u-7');
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'u-7' });
    setSentryUser(null);
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });
});

describe('sentry monitoring with no DSN', () => {
  it('inits disabled when no DSN is configured', () => {
    jest.resetModules();
    let opts: Record<string, unknown> | undefined;
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
    jest.doMock('@sentry/react-native', () => ({
      __esModule: true,
      init: (o: Record<string, unknown>) => {
        opts = o;
      },
      captureException: jest.fn(),
      setUser: jest.fn(),
      wrap: (c: unknown) => c,
      reactNavigationIntegration: () => ({ registerNavigationContainer: jest.fn() }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/monitoring/sentry');
    expect(opts?.enabled).toBe(false);
  });
});
