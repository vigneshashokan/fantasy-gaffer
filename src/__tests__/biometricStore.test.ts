// Stable mock functions that survive jest.resetModules() — the factory below
// must reference these outer variables so that every re-invocation (after each
// resetModules) returns the same jest.fn instances that the top-level
// `import AsyncStorage` captured on first load.
const mockGetItem = jest.fn(() => Promise.resolve(null));
const mockSetItem = jest.fn(() => Promise.resolve());
const mockRemoveItem = jest.fn(() => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
  },
}));

const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockPersistCurrentSession = jest.fn();
let onAuthStateChangeCallback:
  | ((event: string, session: unknown) => void)
  | null = null;
const mockOnAuthStateChange = jest.fn((cb) => {
  onAuthStateChangeCallback = cb;
  return { data: { subscription: { unsubscribe: jest.fn() } } };
});

jest.mock('@/lib/auth/biometric/enrollment', () => ({
  __esModule: true,
  enable: () => mockEnable(),
  disable: () => mockDisable(),
  persistCurrentSession: () => mockPersistCurrentSession(),
  BIOMETRIC_ENABLED_KEY: 'biometric_enabled',
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        mockOnAuthStateChange(cb),
    },
  },
}));

describe('useBiometricStore', () => {
  beforeEach(() => {
    jest.resetModules();
    onAuthStateChangeCallback = null;
    mockEnable.mockClear();
    mockDisable.mockClear();
    mockPersistCurrentSession.mockClear();
    mockOnAuthStateChange.mockClear();
    mockGetItem.mockClear();
    mockGetItem.mockReturnValue(Promise.resolve(null));
  });

  it('starts with enabled=false, hydrated=false, justSignedOut=false', () => {
    mockGetItem.mockReturnValueOnce(new Promise(() => {}) as never);
    const { useBiometricStore } = require('@/store/biometricStore');
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.hydrated).toBe(false);
    expect(s.justSignedOut).toBe(false);
  });

  it('hydrates from AsyncStorage with enabled=true', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.hydrated).toBe(true);
  });

  it('hydrates with enabled=false when AsyncStorage is empty', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const s = useBiometricStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.hydrated).toBe(true);
  });

  it('flips enabled=true after enable() resolves ok', async () => {
    mockEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    mockGetItem.mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const r = await useBiometricStore.getState().enable();
    expect(r.ok).toBe(true);
    expect(useBiometricStore.getState().enabled).toBe(true);
  });

  it('leaves enabled=false when enable() resolves error', async () => {
    mockEnable.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    mockGetItem.mockResolvedValueOnce(null);
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    const r = await useBiometricStore.getState().enable();
    expect(r.ok).toBe(false);
    expect(useBiometricStore.getState().enabled).toBe(false);
  });

  it('flips enabled=false after disable()', async () => {
    mockEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    mockDisable.mockResolvedValueOnce(undefined);
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    await useBiometricStore.getState().disable();
    expect(useBiometricStore.getState().enabled).toBe(false);
  });

  it('calls persistCurrentSession on TOKEN_REFRESHED when enabled is true', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(mockPersistCurrentSession).toHaveBeenCalled();
  });

  it('does NOT call persistCurrentSession on TOKEN_REFRESHED when enabled is false', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(mockPersistCurrentSession).not.toHaveBeenCalled();
  });

  it('sets justSignedOut=true on SIGNED_OUT', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('SIGNED_OUT', null);
    expect(useBiometricStore.getState().justSignedOut).toBe(true);
  });

  it('consumeJustSignedOut() flips the flag back to false', async () => {
    mockGetItem.mockResolvedValueOnce('true');
    const { useBiometricStore } = require('@/store/biometricStore');
    await new Promise((r) => setTimeout(r, 0));
    onAuthStateChangeCallback?.('SIGNED_OUT', null);
    expect(useBiometricStore.getState().justSignedOut).toBe(true);
    useBiometricStore.getState().consumeJustSignedOut();
    expect(useBiometricStore.getState().justSignedOut).toBe(false);
  });
});
