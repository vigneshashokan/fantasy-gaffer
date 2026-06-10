import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockSignInGoogle = jest.fn(() => Promise.resolve({ ok: false, error: 'cancel' }));
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

const mockAttemptUnlock = jest.fn();

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
  signInWithGoogle: () => mockSignInGoogle(),
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

jest.mock('@/lib/auth/biometric/enrollment', () => ({
  __esModule: true,
  attemptUnlock: () => mockAttemptUnlock(),
}));

jest.mock('@/store/biometricStore', () => {
  // Stable function references — created once in the factory closure so the
  // useEffect dep array doesn't see a new reference on every render.
  const stableEnable = (...args: unknown[]) => mockBiometricEnable(...args);
  const stableConsumeJustSignedOut = () => mockConsumeJustSignedOut();
  return {
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
        enable: stableEnable,
        consumeJustSignedOut: stableConsumeJustSignedOut,
      }),
  };
});

import SignIn from '@/app/(onboarding)/signin';

describe('SignIn screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
    mockSearchParams = {};
    mockBiometricEnable.mockReset();
    mockBiometricSupported.mockReset().mockResolvedValue(false);
    mockConsumeJustSignedOut.mockReset();
    mockAttemptUnlock.mockReset().mockResolvedValue({ ok: true, value: undefined });
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
    mockAttemptUnlock.mockReset().mockResolvedValue({ ok: true, value: undefined });
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

  it('calls biometricStore.enable() when checkbox ticked and Google sign-in succeeds', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignInGoogle.mockResolvedValueOnce({ ok: true });
    mockBiometricEnable.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    fireEvent.press(getByText('Remember to use Face ID'));
    await act(async () => {
      fireEvent.press(getByText('Continue with Google'));
    });
    await waitFor(() => expect(mockBiometricEnable).toHaveBeenCalled());
  });

  it('does NOT call biometricStore.enable() on Google sign-in when checkbox unticked', async () => {
    mockBiometricSupported.mockResolvedValueOnce(true);
    mockSignInGoogle.mockResolvedValueOnce({ ok: true });
    const { getByText, findByText } = render(<SignIn />);
    await findByText('Remember to use Face ID');
    await act(async () => {
      fireEvent.press(getByText('Continue with Google'));
    });
    // Give the promise chain (incl. the deferred biometric enroll) time to settle.
    await new Promise((r) => setTimeout(r, 400));
    expect(mockBiometricEnable).not.toHaveBeenCalled();
  });
});

describe('SignIn screen — biometric auto-unlock', () => {
  beforeEach(() => {
    mockAttemptUnlock.mockReset();
    mockBiometricEnable.mockReset();
    mockBiometricSupported.mockReset().mockResolvedValue(false);
    mockConsumeJustSignedOut.mockReset();
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = false;
  });

  it('auto-fires attemptUnlock when enabled and hydrated', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: true, value: undefined });
    render(<SignIn />);
    await waitFor(() => expect(mockAttemptUnlock).toHaveBeenCalled());
  });

  it('does NOT auto-fire attemptUnlock when biometric is disabled', async () => {
    mockBiometricEnabled = false;
    mockBiometricHydrated = true;
    render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('does NOT auto-fire attemptUnlock before biometric store is hydrated', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = false;
    render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('does NOT auto-fire when justSignedOut is true, and consumes the flag', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockBiometricJustSignedOut = true;
    render(<SignIn />);
    await waitFor(() => expect(mockConsumeJustSignedOut).toHaveBeenCalled());
    expect(mockAttemptUnlock).not.toHaveBeenCalled();
  });

  it('shows the expired_link banner when attemptUnlock resolves expired_link', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'expired_link' });
    const { findByText } = render(<SignIn />);
    await findByText(/Face ID session expired/i);
  });

  it('shows the lockout banner when attemptUnlock resolves lockout', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'lockout' });
    const { findByText } = render(<SignIn />);
    await findByText(/Too many attempts/i);
  });

  it('shows no banner when attemptUnlock resolves cancel', async () => {
    mockBiometricEnabled = true;
    mockBiometricHydrated = true;
    mockAttemptUnlock.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const { queryByText } = render(<SignIn />);
    await new Promise((r) => setTimeout(r, 50));
    expect(queryByText(/Face ID session expired/i)).toBeNull();
    expect(queryByText(/Too many attempts/i)).toBeNull();
  });
});
