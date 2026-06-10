import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

const mockBiometricEnable = jest.fn();
const mockBiometricSupported = jest.fn();
let mockBiometricEnabled = false;
let mockBiometricHydrated = true;
let mockBiometricJustSignedOut = false;
const mockConsumeJustSignedOut = jest.fn();

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

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockBiometricSupported(),
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (selector: (s: {
    enabled: boolean;
    hydrated: boolean;
    justSignedOut: boolean;
    enable: () => Promise<unknown>;
    consumeJustSignedOut: () => void;
  }) => unknown) =>
    selector({
      enabled: mockBiometricEnabled,
      hydrated: mockBiometricHydrated,
      justSignedOut: mockBiometricJustSignedOut,
      enable: () => mockBiometricEnable(),
      consumeJustSignedOut: () => mockConsumeJustSignedOut(),
    }),
}));

import SignIn from '@/app/(onboarding)/signin';

describe('SignIn screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
    mockSearchParams = {};
    mockBiometricEnable.mockReset();
    mockBiometricSupported.mockReset().mockResolvedValue(false);
    mockConsumeJustSignedOut.mockReset();
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = false;
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

  it('shows field errors and does not call signInWithEmail when both fields are empty', () => {
    const { getByText, queryByText } = render(<SignIn />);
    fireEvent.press(getByText('Sign in'));
    expect(queryByText("Email can't be empty")).toBeTruthy();
    expect(queryByText("Password can't be empty")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows only password error when email is valid but password is empty', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.press(getByText('Sign in'));
    expect(queryByText("Email can't be empty")).toBeNull();
    expect(queryByText("Password can't be empty")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows "Enter a valid email" for malformed email', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'not-an-email');
    fireEvent.changeText(getByPlaceholderText('Password'), 'whatever');
    fireEvent.press(getByText('Sign in'));
    expect(queryByText(/valid email/i)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('clears the form fields when navigating to sign-up', async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Sign in'));
    await findByText('Email or password is incorrect');
    fireEvent.press(getByText('Sign up'));
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/signup');
    expect(getByPlaceholderText('Email address').props.value).toBe('');
    expect(getByPlaceholderText('Password').props.value).toBe('');
  });
});

describe('SignIn screen — biometric enrollment', () => {
  beforeEach(() => {
    mockBiometricEnable.mockReset();
    mockBiometricSupported.mockReset().mockResolvedValue(false);
    mockConsumeJustSignedOut.mockReset();
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = false;
  });

  it('does not render the "Sign in with Face ID" Face ID button block', () => {
    mockBiometricSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<SignIn />);
    expect(queryByText('Sign in with Face ID')).toBeNull();
  });

  it('hides the Remember Face ID checkbox when device is unsupported', async () => {
    mockBiometricSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<SignIn />);
    await waitFor(() =>
      expect(queryByText('Remember to use Face ID')).toBeNull(),
    );
  });

  it('hides the Remember Face ID checkbox when biometric is already enabled', async () => {
    mockBiometricEnabled = true;
    mockBiometricSupported.mockResolvedValueOnce(true);
    const { queryByText } = render(<SignIn />);
    await waitFor(() =>
      expect(queryByText('Remember to use Face ID')).toBeNull(),
    );
  });

  it('shows the checkbox when supported and not yet enabled', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
  });

  it('calls biometricStore.enable() when the checkbox is ticked and sign-in succeeds', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: true, value: undefined });
    mockBiometricEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Strong1Pass');
    fireEvent.press(getByText('Remember to use Face ID'));
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockBiometricEnable).toHaveBeenCalled();
  });

  it('does NOT call biometricStore.enable() when checkbox left unticked', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Strong1Pass');
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockBiometricEnable).not.toHaveBeenCalled();
  });

  it('does NOT call biometricStore.enable() when sign-in fails', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Remember to use Face ID'));
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockBiometricEnable).not.toHaveBeenCalled();
  });
});
