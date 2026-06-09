import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReset = jest.fn();
const mockReplace = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  resetPassword: (...args: unknown[]) => mockReset(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown }) => unknown) =>
    selector({ session: mockSession }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import ResetPassword from '@/app/(onboarding)/reset-password';

describe('ResetPassword screen', () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockReplace.mockReset();
    mockSession = { user: { id: 'u1' } };
  });

  it('shows expired-link message when there is no session', () => {
    mockSession = null;
    const { getByText } = render(<ResetPassword />);
    expect(getByText(/open the link from your email/i)).toBeTruthy();
    fireEvent.press(getByText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('rejects weak password inline', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'short');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'short');
    fireEvent.press(getByText('Update password'));
    expect(queryByText('At least 8 characters')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('calls resetPassword on valid submit and navigates home', async () => {
    mockReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewStrong1');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'NewStrong1');
    fireEvent.press(getByText('Update password'));
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('NewStrong1'));
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('shows expired_link error from reset call', async () => {
    mockReset.mockResolvedValueOnce({ ok: false, error: 'expired_link' });
    const { getByPlaceholderText, getByText, findByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewStrong1');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'NewStrong1');
    fireEvent.press(getByText('Update password'));
    await findByText(/link has expired/i);
  });
});
