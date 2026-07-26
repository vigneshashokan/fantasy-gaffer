import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (
    selector: (s: { session: { user: { id: string; user_metadata: Record<string, string> } } | null }) => unknown,
  ) =>
    selector({
      session: {
        user: { id: 'user-1', user_metadata: { given_name: 'Test', family_name: 'User' } },
      },
    }),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: () => ({ insert: jest.fn().mockResolvedValue({ error: null }) }),
  },
}));

import CompleteProfile from '@/app/(onboarding)/complete-profile';

describe('CompleteProfile screen — DOB helper text', () => {
  it('shows a COPPA-friendly explanation below the date-of-birth field', () => {
    const { getByText } = render(<CompleteProfile />);
    getByText("We need this to confirm you're 13 or older to use Fantasy Gaffer.");
  });
});

// #179: the iOS spinner is inline and only fires onChange while scrolling, so
// without an explicit affordance it could never be closed once opened.
describe('CompleteProfile screen — date picker dismissal', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });
  const setOS = (os: string) =>
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

  it('offers a Done affordance for the inline iOS spinner', () => {
    setOS('ios');
    const { getByText, getByTestId, queryByTestId } = render(<CompleteProfile />);
    expect(queryByTestId('dob-picker-done')).toBeNull();

    fireEvent.press(getByText('Date of birth'));
    const done = getByTestId('dob-picker-done');
    expect(done.props.accessibilityRole).toBe('button');

    fireEvent.press(done);
    expect(queryByTestId('dob-picker-done')).toBeNull();
  });

  it('commits the visible spinner value when the user never scrolls it', () => {
    setOS('ios');
    const { getByText, getByTestId } = render(<CompleteProfile />);
    fireEvent.press(getByText('Date of birth'));
    fireEvent.press(getByTestId('dob-picker-done'));
    // The field now reads a date rather than the placeholder.
    expect(() => getByText('Date of birth')).toThrow();
  });

  it('leaves Android to its self-dismissing dialog', () => {
    setOS('android');
    const { getByText, queryByTestId } = render(<CompleteProfile />);
    fireEvent.press(getByText('Date of birth'));
    expect(queryByTestId('dob-picker-done')).toBeNull();
  });
});

// #179: the submit button was only faded by a wrapper's opacity — it stayed
// pressable and announced itself as enabled.
describe('CompleteProfile screen — submit gating', () => {
  it('disables submit until a valid date of birth is set', () => {
    const { getByRole } = render(<CompleteProfile />);
    const submit = getByRole('button', { name: 'Continue' });
    expect(submit.props.accessibilityState?.disabled).toBe(true);
  });
});
