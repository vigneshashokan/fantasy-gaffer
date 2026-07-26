import React from 'react';
import { render, act } from '@testing-library/react-native';
import { parseAuthDeepLink, useEmailAuthDeepLinks } from '@/lib/auth/deepLink';

const mockExchangeCodeForSession = jest.fn();
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
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
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
  it('classifies the verify URL and extracts the code', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify?code=abc')).toEqual({
      kind: 'verify',
      code: 'abc',
    });
  });

  it('classifies the reset-password URL and extracts the code', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://reset-password?code=xyz')).toEqual({
      kind: 'reset',
      code: 'xyz',
    });
  });

  it('finds the code among other query params, and url-decodes it', () => {
    expect(
      parseAuthDeepLink('fplgafferreactnativeapp://verify?type=signup&code=a%2Fb&x=1'),
    ).toEqual({ kind: 'verify', code: 'a/b' });
  });

  it('reports a null code when the link carries none', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify')).toEqual({
      kind: 'verify',
      code: null,
    });
  });

  it('does not mistake a fragment for a query string', () => {
    expect(
      parseAuthDeepLink('fplgafferreactnativeapp://verify#access_token=t&code=nope'),
    ).toEqual({ kind: 'verify', code: null });
  });

  it('classifies unknown paths', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://something-else?x=1')).toEqual({
      kind: 'unknown',
    });
  });

  it('classifies non-app schemes', () => {
    expect(parseAuthDeepLink('https://example.com/verify')).toEqual({ kind: 'unknown' });
  });

  // #71: Supabase now redirects to Universal Links, so these are the shape the
  // OS actually delivers. The custom scheme above stays supported — Google
  // OAuth still uses it, as do the web fallback pages and any auth email
  // already sitting in an inbox from before this shipped.
  describe('Universal Links', () => {
    it('classifies the https verify URL and extracts the code', () => {
      expect(parseAuthDeepLink('https://fantasy-gaffer.com/verify?code=abc')).toEqual({
        kind: 'verify',
        code: 'abc',
      });
    });

    it('classifies the https reset-password URL and extracts the code', () => {
      expect(
        parseAuthDeepLink('https://fantasy-gaffer.com/reset-password?code=xyz'),
      ).toEqual({ kind: 'reset', code: 'xyz' });
    });

    // The parser used to gate on scheme alone. Matching on path without also
    // checking the host would make any https link the OS handed us — a shared
    // article, a tapped ad — read as an auth callback.
    it('rejects a look-alike path on another host', () => {
      expect(parseAuthDeepLink('https://evil.example/verify?code=abc')).toEqual({
        kind: 'unknown',
      });
      expect(
        parseAuthDeepLink('https://fantasy-gaffer.com.evil.example/verify?code=abc'),
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
        parseAuthDeepLink('https://fantasy-gaffer.com/verify#access_token=t&code=nope'),
      ).toEqual({ kind: 'verify', code: null });
    });

    // http:// is not claimed by the association, so it should never arrive —
    // but if it does it is an unauthenticated channel, not our callback.
    it('does not accept plain http', () => {
      expect(parseAuthDeepLink('http://fantasy-gaffer.com/verify?code=abc')).toEqual({
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
    mockExchangeCodeForSession.mockReset();
    mockReplace.mockReset();
    mockAddEventListener.mockClear();
    urlListener = null;
    mockHydrated = true;
    mockInitialUrl = null;
  });

  it('exchanges the bare code — not the whole URL — and routes to reset-password', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=abc' });
    });
    // auth-js posts this value straight through as `auth_code`; the full
    // deep-link URL was never a usable code.
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/reset-password');
  });

  it('exchanges code and lets layout route on verify URL (no explicit replace)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=xyz' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('xyz');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes to forgot-password?expired=1 when the reset exchange RESOLVES with an error', async () => {
    // auth-js resolves { error } for a dead link rather than rejecting, so
    // this is the path a real expired reset link takes.
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'invalid flow state', name: 'AuthApiError' },
    });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=dead' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('routes to signin?verify_expired=1 when the verify exchange RESOLVES with an error', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'expired', name: 'AuthApiError' },
    });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=dead' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin?verify_expired=1');
  });

  it('routes to forgot-password?expired=1 if reset exchange rejects', async () => {
    mockExchangeCodeForSession.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('routes to signin?verify_expired=1 if verify exchange rejects', async () => {
    mockExchangeCodeForSession.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin?verify_expired=1');
  });

  it('treats a codeless auth link as expired instead of posting a null code', async () => {
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password' });
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('exchanges a warm-open URL once, not once per delivery channel', async () => {
    // useLinkingURL() and the 'url' listener both surface the same URL on a
    // warm open; the code is single-use, so the second exchange would fail.
    mockInitialUrl = 'fplgafferreactnativeapp://reset-password?code=once';
    mockExchangeCodeForSession.mockResolvedValue(OK);
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=once' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown URLs', async () => {
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'https://example.com/other' });
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not exchange while authStore is not hydrated', async () => {
    mockHydrated = false;
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=abc' });
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});
