import React from 'react';
import { render } from '@testing-library/react-native';

// Same mock header as signupScreen.test.tsx
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

import Signup from '@/app/(onboarding)/signup';

describe('signup legal links a11y', () => {
  it('exposes Terms and Privacy as links', () => {
    const { getByText } = render(<Signup />);
    expect(getByText('Terms of Service').props.accessibilityRole).toBe('link');
    expect(getByText('Privacy Policy').props.accessibilityRole).toBe('link');
  });
});
