import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockSendReset = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  sendPasswordReset: (...args: unknown[]) => mockSendReset(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import ForgotPassword from '@/app/(onboarding)/forgot-password';

describe('ForgotPassword screen', () => {
  beforeEach(() => {
    mockSendReset.mockReset();
    mockReplace.mockReset();
    mockSearchParams = {};
  });

  it('shows inline error for invalid email', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'not-an-email');
    fireEvent.press(getByText('Send reset link'));
    expect(queryByText(/valid email/i)).toBeTruthy();
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  it('always shows the success state after submit', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/we've sent a reset link/i);
    expect(mockSendReset).toHaveBeenCalledWith('ada@example.com');
  });

  it('Back to sign in goes to signin', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/we've sent a reset link/i);
    fireEvent.press(getByText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('renders expired banner when ?expired=1 is set', () => {
    mockSearchParams = { expired: '1' };
    const { getByText } = render(<ForgotPassword />);
    expect(getByText('That reset link has expired — request a new one.')).toBeTruthy();
  });

  it('shows a Sign up link in the success state for users without an account', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/we've sent a reset link/i);
    expect(getByText(/don't have an account yet/i)).toBeTruthy();
    fireEvent.press(getByText('Sign up'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signup');
  });

  it('mentions the spam folder in the success copy', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/spam folder/i);
  });
});
