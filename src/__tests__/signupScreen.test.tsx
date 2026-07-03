import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignUp = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signUpWithEmail: (...args: unknown[]) => mockSignUp(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    replace: (p: string) => mockReplace(p),
    back: () => mockBack(),
    push: (p: string) => mockPush(p),
  },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import SignUp from '@/app/(onboarding)/signup';

describe('SignUp screen', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockPush.mockReset();
  });

  function fill(getByPlaceholderText: ReturnType<typeof render>['getByPlaceholderText'], overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }> = {}) {
    fireEvent.changeText(getByPlaceholderText('First name'), overrides.firstName ?? 'Ada');
    fireEvent.changeText(getByPlaceholderText('Last name'), overrides.lastName ?? 'Lovelace');
    fireEvent.changeText(getByPlaceholderText('Email address'), overrides.email ?? 'ada@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), overrides.password ?? 'Strong1Pass');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), overrides.confirmPassword ?? 'Strong1Pass');
  }

  it('shows inline error for short password', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignUp />);
    fill(getByPlaceholderText, { password: 'Aa1', confirmPassword: 'Aa1' });
    fireEvent.press(getByText('Create account'));
    expect(queryByText('At least 8 characters')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows inline error when passwords mismatch', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignUp />);
    fill(getByPlaceholderText, { confirmPassword: 'Different1' });
    fireEvent.press(getByText('Create account'));
    expect(queryByText('Passwords do not match')).toBeTruthy();
  });

  it('calls signUpWithEmail and replaces to verify-pending on success', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'Strong1Pass',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      '/(onboarding)/verify-pending?email=ada%40example.com',
    );
  });

  it('replaces to verify-pending on user_already_exists (no enumeration)', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: false, error: 'user_already_exists' });
    const { getByPlaceholderText, getByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        '/(onboarding)/verify-pending?email=ada%40example.com',
      ),
    );
  });

  it('shows weak_password inline on the password field', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: false, error: 'weak_password' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await findByText('Please choose a stronger password');
  });

  it('back link calls router.back', () => {
    const { getByText } = render(<SignUp />);
    fireEvent.press(getByText('Sign in'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('auto-capitalizes words on first and last name fields', () => {
    const { getByPlaceholderText } = render(<SignUp />);
    expect(getByPlaceholderText('First name').props.autoCapitalize).toBe('words');
    expect(getByPlaceholderText('Last name').props.autoCapitalize).toBe('words');
  });

  it('does not auto-capitalize email or password fields', () => {
    const { getByPlaceholderText } = render(<SignUp />);
    expect(getByPlaceholderText('Email address').props.autoCapitalize).toBe('none');
    expect(getByPlaceholderText('Password').props.autoCapitalize).toBe('none');
    expect(getByPlaceholderText('Confirm password').props.autoCapitalize).toBe('none');
  });

  it('clears the form fields when navigating back to sign-in', () => {
    const { getByPlaceholderText, getByText } = render(<SignUp />);
    fireEvent.changeText(getByPlaceholderText('First name'), 'Ada');
    fireEvent.changeText(getByPlaceholderText('Last name'), 'Lovelace');
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Strong1Pass');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'Strong1Pass');
    fireEvent.press(getByText('Sign in'));
    expect(mockBack).toHaveBeenCalled();
    expect(getByPlaceholderText('First name').props.value).toBe('');
    expect(getByPlaceholderText('Last name').props.value).toBe('');
    expect(getByPlaceholderText('Email address').props.value).toBe('');
    expect(getByPlaceholderText('Password').props.value).toBe('');
    expect(getByPlaceholderText('Confirm password').props.value).toBe('');
  });

  it('navigates to legal screens from the disclosure links', () => {
    const { getByText } = render(<SignUp />);
    fireEvent.press(getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
    fireEvent.press(getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
  });
});
