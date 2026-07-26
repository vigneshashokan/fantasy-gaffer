// #181 — the return key was inert on every auth form (Field exposed no
// returnKeyType/onSubmitEditing), and signup/reset-password asked for
// autoComplete="password" on brand-new password fields, so managers offered
// the OLD credential instead of generating one.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signInWithEmail: jest.fn().mockResolvedValue({ ok: true }),
  signUpWithEmail: jest.fn().mockResolvedValue({ ok: true }),
  resetPassword: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('@/lib/auth/google', () => ({ __esModule: true, signInWithGoogle: jest.fn() }));
// Same reason as google: the real module imports @/lib/supabase → AsyncStorage.
jest.mock('@/lib/auth/apple', () => ({ __esModule: true, signInWithApple: jest.fn() }));
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown }) => unknown) =>
    selector({ session: { user: { id: 'u1' } } }),
}));

import { TextInput } from 'react-native';
import SignIn from '@/app/(onboarding)/signin';
import SignUp from '@/app/(onboarding)/signup';
import ResetPassword from '@/app/(onboarding)/reset-password';
import { signInWithEmail } from '@/lib/auth/email';

describe('auth forms — keyboard submit flow', () => {
  it('sign-in submits from the password field return key', async () => {
    const { getByTestId } = render(<SignIn />);
    fireEvent.changeText(getByTestId('signin-email'), 'a@b.com');
    fireEvent.changeText(getByTestId('signin-password'), 'hunter2222');
    expect(getByTestId('signin-password').props.returnKeyType).toBe('go');

    await act(async () => {
      fireEvent(getByTestId('signin-password'), 'submitEditing');
    });
    expect(signInWithEmail).toHaveBeenCalled();
  });

  it("sign-in's email field advances rather than submitting", () => {
    const { getByTestId } = render(<SignIn />);
    expect(getByTestId('signin-email').props.returnKeyType).toBe('next');
  });

  it('every auth text input declares a return key', () => {
    for (const screen of [<SignIn key="a" />, <SignUp key="b" />, <ResetPassword key="c" />]) {
      const { UNSAFE_getAllByType } = render(screen);
      for (const input of UNSAFE_getAllByType(TextInput)) {
        expect(input.props.returnKeyType).toBeDefined();
      }
    }
  });
});

describe('auth forms — password-manager autofill hints', () => {
  const newPasswordInputs = (ui: React.ReactElement) =>
    render(ui)
      .UNSAFE_getAllByType(TextInput)
      .filter((n) => n.props.secureTextEntry !== undefined && n.props.autoComplete != null);

  it('signup asks for a GENERATED password, not the existing one', () => {
    const secure = newPasswordInputs(<SignUp />);
    expect(secure.length).toBe(2);
    for (const input of secure) {
      expect(input.props.autoComplete).toBe('new-password');
      expect(input.props.textContentType).toBe('newPassword');
    }
  });

  it('reset-password asks for a GENERATED password, not the existing one', () => {
    const secure = newPasswordInputs(<ResetPassword />);
    expect(secure.length).toBe(2);
    for (const input of secure) {
      expect(input.props.autoComplete).toBe('new-password');
      expect(input.props.textContentType).toBe('newPassword');
    }
  });

  it('sign-in still fills the EXISTING password', () => {
    const { getByTestId } = render(<SignIn />);
    expect(getByTestId('signin-password').props.autoComplete).toBe('password');
    expect(getByTestId('signin-password').props.textContentType).toBe('password');
  });
});
