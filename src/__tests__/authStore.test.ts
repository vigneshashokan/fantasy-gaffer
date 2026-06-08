jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));
let onAuthStateChangeCallback: ((event: string, session: unknown) => void) | null = null;
const mockOnAuthStateChange = jest.fn((cb) => {
  onAuthStateChangeCallback = cb;
  return { data: { subscription: { unsubscribe: jest.fn() } } };
});
const mockGetSession = jest.fn(() => Promise.resolve({ data: { session: null }, error: null }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => mockOnAuthStateChange(cb),
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
    },
  },
}));

describe('authStore', () => {
  beforeEach(() => {
    jest.resetModules();
    onAuthStateChangeCallback = null;
    mockSignOut.mockClear();
    mockOnAuthStateChange.mockClear();
    mockGetSession.mockClear();
  });

  it('starts with no session and hydrated=false', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    mockGetSession.mockReturnValueOnce(
      new Promise((r) => { resolveGet = r as never; }) as never,
    );
    const { useAuthStore } = require('../store/authStore');
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().hydrated).toBe(false);
    resolveGet({ data: { session: null }, error: null });
  });

  it('flips hydrated=true after getSession resolves with no session', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('picks up an existing session from getSession', async () => {
    const fakeSession = { user: { id: 'u1' }, access_token: 't' };
    mockGetSession.mockReturnValueOnce(
      Promise.resolve({ data: { session: fakeSession }, error: null }) as never,
    );
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().session).toEqual(fakeSession);
    expect(useAuthStore.getState().hydrated).toBe(true);
  });

  it('updates session when onAuthStateChange fires', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    const fakeSession = { user: { id: 'u2' }, access_token: 'tt' };
    onAuthStateChangeCallback?.('SIGNED_IN', fakeSession);
    expect(useAuthStore.getState().session).toEqual(fakeSession);
  });

  it('signOut() delegates to supabase.auth.signOut', async () => {
    const { useAuthStore } = require('../store/authStore');
    await new Promise((r) => setTimeout(r, 0));
    await useAuthStore.getState().signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
