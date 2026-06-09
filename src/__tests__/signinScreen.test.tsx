import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signInWithEmail: (...args: unknown[]) => mockSignIn(...args),
}));

jest.mock('@/lib/auth/google', () => ({
  __esModule: true,
  signInWithGoogle: jest.fn(() => Promise.resolve({ ok: false, error: 'cancel' })),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (p: string) => mockPush(p) },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import SignIn from '@/app/(onboarding)/signin';

describe('SignIn screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
    mockSearchParams = {};
  });

  it('shows inline error on invalid_credentials', async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Sign in'));
    await findByText('Email or password is incorrect');
  });

  it('routes to verify-pending on email_not_confirmed', async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'email_not_confirmed' });
    const { getByPlaceholderText, getByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Secret123');
    fireEvent.press(getByText('Sign in'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        '/(onboarding)/verify-pending?email=a%40b.co',
      ),
    );
  });

  it('navigates to sign-up via footer link', () => {
    const { getByText } = render(<SignIn />);
    fireEvent.press(getByText('Sign up'));
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/signup');
  });

  it('navigates to forgot-password via link', () => {
    const { getByText } = render(<SignIn />);
    fireEvent.press(getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/forgot-password');
  });

  it('renders verify-expired banner when query param is set', () => {
    mockSearchParams = { verify_expired: '1' };
    const { getByText } = render(<SignIn />);
    expect(getByText('Verification link expired. Sign in again to resend.')).toBeTruthy();
  });
});
