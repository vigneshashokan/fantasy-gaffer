import React from 'react';
import { render, act } from '@testing-library/react-native';
import { parseAuthDeepLink, useEmailAuthDeepLinks } from '@/lib/auth/deepLink';

const mockVerifyOtp = jest.fn();
const mockReplace = jest.fn();
let urlListener: ((event: { url: string }) => void) | null = null;
const mockAddEventListener = jest.fn((_evt: string, cb: (e: { url: string }) => void) => {
  urlListener = cb;
  return { remove: jest.fn() };
});
let mockInitialUrl: string | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (params: { token_hash: string; type: string }) => mockVerifyOtp(params),
    },
  },
}));

jest.mock('expo-linking', () => ({
  __esModule: true,
  useLinkingURL: () => mockInitialUrl,
  addEventListener: (evt: string, cb: (e: { url: string }) => void) =>
    mockAddEventListener(evt, cb),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (path: string) => mockReplace(path) },
}));

let mockHydrated = true;
jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { hydrated: boolean }) => unknown) =>
    selector({ hydrated: mockHydrated }),
}));

function Harness() {
  useEmailAuthDeepLinks();
  return null;
}

const OK = { data: { session: {} }, error: null };

describe('parseAuthDeepLink', () => {
  it('classifies the verify URL and extracts the token hash', () => {
    expect(
      parseAuthDeepLink('fplgafferreactnativeapp://verify?token_hash=abc&type=email'),
    ).toEqual({ kind: 'verify', tokenHash: 'abc', type: 'email' });
  });

  it('classifies the reset-password URL and extracts the token hash', () => {
    expect(
      parseAuthDeepLink(
        'fplgafferreactnativeapp://reset-password?token_hash=xyz&type=recovery',
      ),
    ).toEqual({ kind: 'reset', tokenHash: 'xyz', type: 'recovery' });
  });

  it('finds the token hash among other query params, and url-decodes it', () => {
    expect(
      parseAuthDeepLink(
        'fplgafferreactnativeapp://verify?type=signup&token_hash=a%2Fb&x=1',
      ),
    ).toEqual({ kind: 'verify', tokenHash: 'a/b', type: 'signup' });
  });

  it('reports a null token hash when the link carries none', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify')).toEqual({
      kind: 'verify',
      tokenHash: null,
      type: 'email',
    });
  });

  // The email template picks the type; these fallbacks only cover a template
  // that omits it, so the route's own intent has to stand in.
  describe('otp type', () => {
    it('falls back to email on verify and recovery on reset when absent', () => {
      expect(parseAuthDeepLink('fplgafferreactnativeapp://verify?token_hash=a')).toEqual({
        kind: 'verify',
        tokenHash: 'a',
        type: 'email',
      });
      expect(
        parseAuthDeepLink('fplgafferreactnativeapp://reset-password?token_hash=a'),
      ).toEqual({ kind: 'reset', tokenHash: 'a', type: 'recovery' });
    });

    it('falls back when the type is not one auth-js recognises', () => {
      expect(
        parseAuthDeepLink('fplgafferreactnativeapp://verify?token_hash=a&type=nonsense'),
      ).toEqual({ kind: 'verify', tokenHash: 'a', type: 'email' });
    });

    it('accepts every email otp type auth-js defines', () => {
      for (const t of ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']) {
        expect(
          parseAuthDeepLink(`fplgafferreactnativeapp://verify?token_hash=a&type=${t}`),
        ).toEqual({ kind: 'verify', tokenHash: 'a', type: t });
      }
    });
  });

  it('does not mistake a fragment for a query string', () => {
    expect(
      parseAuthDeepLink('fplgafferreactnativeapp://verify#access_token=t&token_hash=nope'),
    ).toEqual({ kind: 'verify', tokenHash: null, type: 'email' });
  });

  it('classifies unknown paths', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://something-else?x=1')).toEqual({
      kind: 'unknown',
    });
  });

  it('classifies non-app schemes', () => {
    expect(parseAuthDeepLink('https://example.com/verify')).toEqual({ kind: 'unknown' });
  });

  // #71: the auth emails point straight at our own domain, so these are the
  // shape the OS actually delivers. The custom scheme above stays supported —
  // Google OAuth still uses it, as do the web fallback pages' "Open in the
  // app" button (which is the only route in on Android).
  describe('Universal Links', () => {
    it('classifies the https verify URL and extracts the token hash', () => {
      expect(
        parseAuthDeepLink('https://fantasy-gaffer.com/verify?token_hash=abc&type=email'),
      ).toEqual({ kind: 'verify', tokenHash: 'abc', type: 'email' });
    });

    it('classifies the https reset-password URL and extracts the token hash', () => {
      expect(
        parseAuthDeepLink(
          'https://fantasy-gaffer.com/reset-password?token_hash=xyz&type=recovery',
        ),
      ).toEqual({ kind: 'reset', tokenHash: 'xyz', type: 'recovery' });
    });

    // The parser used to gate on scheme alone. Matching on path without also
    // checking the host would make any https link the OS handed us — a shared
    // article, a tapped ad — read as an auth callback.
    it('rejects a look-alike path on another host', () => {
      expect(parseAuthDeepLink('https://evil.example/verify?token_hash=abc')).toEqual({
        kind: 'unknown',
      });
      expect(
        parseAuthDeepLink('https://fantasy-gaffer.com.evil.example/verify?token_hash=abc'),
      ).toEqual({ kind: 'unknown' });
    });

    it('ignores our own non-auth pages', () => {
      expect(parseAuthDeepLink('https://fantasy-gaffer.com/privacy')).toEqual({
        kind: 'unknown',
      });
      expect(parseAuthDeepLink('https://fantasy-gaffer.com/')).toEqual({ kind: 'unknown' });
    });

    it('does not mistake a fragment for a query string over https', () => {
      expect(
        parseAuthDeepLink('https://fantasy-gaffer.com/verify#access_token=t&token_hash=nope'),
      ).toEqual({ kind: 'verify', tokenHash: null, type: 'email' });
    });

    // http:// is not claimed by the association, so it should never arrive —
    // but if it does it is an unauthenticated channel, not our callback.
    it('does not accept plain http', () => {
      expect(parseAuthDeepLink('http://fantasy-gaffer.com/verify?token_hash=abc')).toEqual({
        kind: 'unknown',
      });
    });
  });

  it('handles malformed URLs gracefully', () => {
    expect(parseAuthDeepLink('not-a-url-at-all')).toEqual({ kind: 'unknown' });
  });
});

describe('useEmailAuthDeepLinks', () => {
  beforeEach(() => {
    mockVerifyOtp.mockReset();
    mockReplace.mockReset();
    mockAddEventListener.mockClear();
    urlListener = null;
    mockHydrated = true;
    mockInitialUrl = null;
  });

  it('verifies the bare token hash — not the whole URL — and routes to reset-password', async () => {
    mockVerifyOtp.mockResolvedValueOnce(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({
        url: 'fplgafferreactnativeapp://reset-password?token_hash=abc&type=recovery',
      });
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/reset-password');
  });

  it('verifies and lets layout route on verify URL (no explicit replace)', async () => {
    mockVerifyOtp.mockResolvedValueOnce(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?token_hash=xyz&type=signup' });
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'signup' });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes to forgot-password?expired=1 when the reset verify RESOLVES with an error', async () => {
    // auth-js resolves { error } for a dead link rather than rejecting, so
    // this is the path a real expired reset link takes.
    mockVerifyOtp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Token has expired or is invalid', name: 'AuthApiError' },
    });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?token_hash=dead' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('routes to signin?verify_expired=1 when the verify RESOLVES with an error', async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'expired', name: 'AuthApiError' },
    });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?token_hash=dead' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin?verify_expired=1');
  });

  it('routes to forgot-password?expired=1 if reset verify rejects', async () => {
    mockVerifyOtp.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?token_hash=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('routes to signin?verify_expired=1 if verify rejects', async () => {
    mockVerifyOtp.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?token_hash=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin?verify_expired=1');
  });

  // The shape the #71 on-device pass actually hit: under the implicit flow the
  // web fallback page forwarded an empty `window.location.search`, so the app
  // got a bare link, treated it as expired, and bounced the user back to
  // "request a reset" — which read as an infinite loop on a valid link.
  it('treats a token-less auth link as expired instead of verifying null', async () => {
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password' });
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('verifies a warm-open URL once, not once per delivery channel', async () => {
    // useLinkingURL() and the 'url' listener both surface the same URL on a
    // warm open; the token is single-use, so the second verify would fail.
    mockInitialUrl = 'fplgafferreactnativeapp://reset-password?token_hash=once';
    mockVerifyOtp.mockResolvedValue(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?token_hash=once' });
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown URLs', async () => {
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'https://example.com/other' });
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not verify while authStore is not hydrated', async () => {
    mockHydrated = false;
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?token_hash=abc' });
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});
