// #14 — native Sign in with Apple. Same #166 rule as google.test.ts: nothing
// this module logs may be auth material, and the identity token must never be
// logged at all, in any build.

const mockSignInAsync = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  signInAsync: (...a: unknown[]) => mockSignInAsync(...a),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
    },
  },
}));

import { signInWithApple } from '@/lib/auth/apple';

const dev = globalThis as { __DEV__?: boolean };
const REAL_DEV = dev.__DEV__;

const IDENTITY_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.super-secret-jwt.sig';

let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockSignInWithIdToken.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  logSpy.mockRestore();
  dev.__DEV__ = REAL_DEV;
});

describe('signInWithApple', () => {
  it('exchanges the identity token for a Supabase session', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: IDENTITY_TOKEN, fullName: null });

    expect(await signInWithApple()).toEqual({ ok: true });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: IDENTITY_TOKEN,
    });
  });

  it('requests both scopes', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: IDENTITY_TOKEN, fullName: null });
    await signInWithApple();
    expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1] });
  });

  // Apple hands back the name ONCE, on first authorization, and it is not in
  // the identity token — so if this write is dropped the name is gone for good.
  it('stashes a first-sign-in name where complete-profile reads it', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: IDENTITY_TOKEN,
      fullName: { givenName: 'Pep', familyName: 'Guardiola' },
    });

    await signInWithApple();

    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: { given_name: 'Pep', family_name: 'Guardiola' },
    });
  });

  it('does not touch metadata on a later sign-in, when Apple sends no name', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: IDENTITY_TOKEN, fullName: null });
    await signInWithApple();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  // Losing the session over a failed prefill would be worse than no prefill.
  it('still signs in when the name write fails', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: IDENTITY_TOKEN,
      fullName: { givenName: 'Pep', familyName: null },
    });
    mockUpdateUser.mockResolvedValueOnce({ error: { message: 'nope' } });

    expect(await signInWithApple()).toEqual({ ok: true });
  });

  it('reports a dismissed sheet as a cancel, not a failure', async () => {
    mockSignInAsync.mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });

    expect(await signInWithApple()).toEqual({ ok: false, error: 'cancel' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('fails closed when the credential carries no identity token', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: null, fullName: null });

    expect(await signInWithApple()).toEqual({ ok: false, error: 'missing_identity_token' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('surfaces a Supabase exchange error', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: IDENTITY_TOKEN, fullName: null });
    mockSignInWithIdToken.mockResolvedValueOnce({ error: { message: 'bad_audience' } });

    expect(await signInWithApple()).toEqual({ ok: false, error: 'bad_audience' });
  });

  // #166: console.* in a release build lands in the device log stream.
  it('logs nothing outside __DEV__', async () => {
    dev.__DEV__ = false;
    mockSignInAsync.mockResolvedValueOnce({ identityToken: null, fullName: null });

    await signInWithApple();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('never logs the identity token, even under __DEV__', async () => {
    dev.__DEV__ = true;
    mockSignInAsync.mockResolvedValueOnce({ identityToken: IDENTITY_TOKEN, fullName: null });
    mockSignInWithIdToken.mockResolvedValueOnce({ error: { message: 'bad_audience' } });

    await signInWithApple();

    const logged = logSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(IDENTITY_TOKEN);
    expect(logged).toContain('bad_audience');
  });
});
