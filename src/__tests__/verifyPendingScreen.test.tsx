import React from 'react';
import { fireEvent, render, act } from '@testing-library/react-native';

const mockResend = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  resendVerification: (...args: unknown[]) => mockResend(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p), back: () => mockBack() },
  useLocalSearchParams: () => ({ email: 'ada@example.com' }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import VerifyPending from '@/app/(onboarding)/verify-pending';

describe('VerifyPending screen', () => {
  beforeEach(() => {
    mockResend.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    jest.useRealTimers();
  });

  it('renders the email from query params', () => {
    const { getByText } = render(<VerifyPending />);
    expect(getByText(/ada@example\.com/)).toBeTruthy();
  });

  it('calls resendVerification and disables the button for 30s', async () => {
    jest.useFakeTimers();
    mockResend.mockResolvedValueOnce({ ok: true });
    const { getByText } = render(<VerifyPending />);
    await act(async () => {
      fireEvent.press(getByText('Resend email'));
    });
    expect(mockResend).toHaveBeenCalledWith('ada@example.com');
    // Press again immediately — should be a no-op.
    await act(async () => {
      fireEvent.press(getByText(/Resend.*\(/));
    });
    expect(mockResend).toHaveBeenCalledTimes(1);
    // Advance 30s.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(() => getByText('Resend email')).not.toThrow();
  });

  it('shows a friendly error on rate_limited resend', async () => {
    mockResend.mockResolvedValueOnce({ ok: false, error: 'rate_limited' });
    const { getByText, findByText } = render(<VerifyPending />);
    await act(async () => {
      fireEvent.press(getByText('Resend email'));
    });
    await findByText('Already sent — check your inbox or wait a minute');
  });

  it('Already verified link replaces to signin', () => {
    const { getByText } = render(<VerifyPending />);
    fireEvent.press(getByText('Already verified? Sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('Wrong email link goes back', () => {
    const { getByText } = render(<VerifyPending />);
    fireEvent.press(getByText('Wrong email? Go back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
