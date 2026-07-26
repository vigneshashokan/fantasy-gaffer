// Guards #166: the OAuth callback URL and provider error detail must never
// reach the device log stream in a release build, and the callback URL must
// never be logged at all.

const mockSignInWithOAuth = jest.fn();
const mockSetSession = jest.fn();
const mockOpenAuthSessionAsync = jest.fn();

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSessionAsync(...a),
}));

jest.mock('expo-auth-session', () => ({
  __esModule: true,
  makeRedirectUri: () => 'fplgafferreactnativeapp://auth/callback',
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      setSession: (...a: unknown[]) => mockSetSession(...a),
    },
  },
}));

import { signInWithGoogle } from '@/lib/auth/google';

const dev = globalThis as { __DEV__?: boolean };
const REAL_DEV = dev.__DEV__;

// A callback URL that hits the missing-tokens branch: it carries neither
// access_token nor refresh_token, but does carry a secret-looking value the
// old code would have printed wholesale.
const CALLBACK_URL =
  'fplgafferreactnativeapp://auth/callback#provider_token=super-secret-value';

let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null });
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: CALLBACK_URL });
});

afterEach(() => {
  logSpy.mockRestore();
  dev.__DEV__ = REAL_DEV;
});

function loggedText(): string {
  return logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
}

describe('signInWithGoogle logging', () => {
  it('logs nothing at all in a release build', async () => {
    dev.__DEV__ = false;
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: false, error: 'missing_tokens_in_redirect' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('never logs the callback URL, even in dev', async () => {
    dev.__DEV__ = true;
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: false, error: 'missing_tokens_in_redirect' });
    expect(loggedText()).not.toContain(CALLBACK_URL);
    expect(loggedText()).not.toContain('super-secret-value');
  });

  it('logs nothing on the provider-error path in a release build', async () => {
    dev.__DEV__ = false;
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'fplgafferreactnativeapp://auth/callback?error=access_denied&error_description=nope',
    });
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: false, error: 'nope' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs nothing on the setSession-error path in a release build', async () => {
    dev.__DEV__ = false;
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'fplgafferreactnativeapp://auth/callback#access_token=at&refresh_token=rt',
    });
    mockSetSession.mockResolvedValue({ error: { message: 'bad token' } });
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: false, error: 'bad token' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs nothing on the signInWithOAuth-error path in a release build', async () => {
    dev.__DEV__ = false;
    mockSignInWithOAuth.mockResolvedValue({ data: null, error: { message: 'oauth down' } });
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: false, error: 'oauth down' });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
