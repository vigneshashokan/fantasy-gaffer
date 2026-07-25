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

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (url: string) => mockExchangeCodeForSession(url),
    },
  },
}));

jest.mock('expo-linking', () => ({
  __esModule: true,
  useLinkingURL: jest.fn(() => null),
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

describe('parseAuthDeepLink', () => {
  it('classifies the verify URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify?code=abc')).toEqual({
      kind: 'verify',
    });
  });

  it('classifies the reset-password URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://reset-password?code=xyz')).toEqual({
      kind: 'reset',
    });
  });

  it('classifies unknown paths', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://something-else?x=1')).toEqual({
      kind: 'unknown',
    });
  });

  it('classifies non-app schemes', () => {
    expect(parseAuthDeepLink('https://example.com/verify')).toEqual({ kind: 'unknown' });
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
  });

  it('exchanges code and replaces to reset-password on reset URL', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ data: { session: {} }, error: null });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=abc' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith(
      'fplgafferreactnativeapp://reset-password?code=abc',
    );
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/reset-password');
  });

  it('exchanges code and lets layout route on verify URL (no explicit replace)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ data: { session: {} }, error: null });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=xyz' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
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
