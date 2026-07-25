const mockIsSupported = jest.fn();
const mockPromptBiometric = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
  promptBiometric: (reason: string) => mockPromptBiometric(reason),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: (k: string, v: string) => mockSetItem(k, v),
    removeItem: (k: string) => mockRemoveItem(k),
  },
}));

import { enable, disable } from '@/lib/auth/biometric/enrollment';

describe('enable', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockPromptBiometric.mockReset();
    mockSetItem.mockReset();
  });

  it('returns unsupported when device cannot do biometrics', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unsupported');
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('returns cancel when user dismisses the prompt', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('cancel');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('flips the AsyncStorage flag on happy path', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockSetItem.mockResolvedValueOnce(undefined);
    const r = await enable();
    expect(r.ok).toBe(true);
    expect(mockSetItem).toHaveBeenCalledWith('biometric_enabled', 'true');
  });

  it('passes "Confirm Face ID to enable" as the prompt reason', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    await enable();
    expect(mockPromptBiometric).toHaveBeenCalledWith('Confirm Face ID to enable');
  });
});

describe('disable', () => {
  beforeEach(() => {
    mockRemoveItem.mockReset();
  });

  it('clears SecureStore and removes the AsyncStorage flag', async () => {
    mockRemoveItem.mockResolvedValueOnce(undefined);
    await disable();
    expect(mockRemoveItem).toHaveBeenCalledWith('biometric_enabled');
  });

  it('resolves even if AsyncStorage.removeItem rejects', async () => {
    mockRemoveItem.mockRejectedValueOnce(new Error('boom'));
    await expect(disable()).resolves.toBeUndefined();
  });
});
