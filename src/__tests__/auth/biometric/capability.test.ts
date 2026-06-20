const mockHasHardware = jest.fn();
const mockIsEnrolled = jest.fn();
const mockSupportedTypes = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('expo-local-authentication', () => ({
  __esModule: true,
  hasHardwareAsync: () => mockHasHardware(),
  isEnrolledAsync: () => mockIsEnrolled(),
  supportedAuthenticationTypesAsync: () => mockSupportedTypes(),
  authenticateAsync: (opts: unknown) => mockAuthenticate(opts),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

import {
  isSupported,
  supportedTypes,
  promptBiometric,
} from '@/lib/auth/biometric/capability';

describe('isSupported', () => {
  beforeEach(() => {
    mockHasHardware.mockReset();
    mockIsEnrolled.mockReset();
  });

  it('returns true when hardware present and enrolled', async () => {
    mockHasHardware.mockResolvedValueOnce(true);
    mockIsEnrolled.mockResolvedValueOnce(true);
    expect(await isSupported()).toBe(true);
  });

  it('returns false when hardware absent', async () => {
    mockHasHardware.mockResolvedValueOnce(false);
    mockIsEnrolled.mockResolvedValueOnce(true);
    expect(await isSupported()).toBe(false);
  });

  it('returns false when hardware present but no enrollment', async () => {
    mockHasHardware.mockResolvedValueOnce(true);
    mockIsEnrolled.mockResolvedValueOnce(false);
    expect(await isSupported()).toBe(false);
  });

  it('returns false when the OS call throws', async () => {
    mockHasHardware.mockRejectedValueOnce(new Error('boom'));
    expect(await isSupported()).toBe(false);
  });
});

describe('supportedTypes', () => {
  beforeEach(() => {
    mockSupportedTypes.mockReset();
  });

  it('maps FACIAL_RECOGNITION (2) to "face"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([2]);
    expect(await supportedTypes()).toEqual(['face']);
  });

  it('maps FINGERPRINT (1) to "fingerprint"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([1]);
    expect(await supportedTypes()).toEqual(['fingerprint']);
  });

  it('maps IRIS (3) to "iris"', async () => {
    mockSupportedTypes.mockResolvedValueOnce([3]);
    expect(await supportedTypes()).toEqual(['iris']);
  });

  it('maps multiple types in order', async () => {
    mockSupportedTypes.mockResolvedValueOnce([1, 2]);
    expect(await supportedTypes()).toEqual(['fingerprint', 'face']);
  });

  it('returns [] when the OS call throws', async () => {
    mockSupportedTypes.mockRejectedValueOnce(new Error('boom'));
    expect(await supportedTypes()).toEqual([]);
  });
});

describe('promptBiometric', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
  });

  it('passes promptMessage and fallback label to authenticateAsync', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: true });
    await promptBiometric('Unlock Fantasy Gaffer with Face ID');
    expect(mockAuthenticate).toHaveBeenCalledWith({
      promptMessage: 'Unlock Fantasy Gaffer with Face ID',
      fallbackLabel: 'Use password',
      disableDeviceFallback: true,
    });
  });

  it('returns ok on success', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: true });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: true });
  });

  it('maps user_cancel error to cancel', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'cancel' });
  });

  it('maps system_cancel error to cancel', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'system_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'cancel' });
  });

  it('maps lockout error to lockout', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'lockout' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'lockout' });
  });

  it('maps unknown errors to unknown', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'app_cancel' });
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });

  it('maps thrown errors to unknown', async () => {
    mockAuthenticate.mockRejectedValueOnce(new Error('boom'));
    const r = await promptBiometric('Confirm');
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });
});
