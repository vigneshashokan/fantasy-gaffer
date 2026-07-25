import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockIsSupported = jest.fn();
const mockPromptBiometric = jest.fn();
const mockUnlock = jest.fn();
const mockDisable = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
  promptBiometric: (reason: string) => mockPromptBiometric(reason),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('@/store/biometricStore', () => {
  const stableUnlock = () => mockUnlock();
  const stableDisable = () => mockDisable();
  return {
    __esModule: true,
    useBiometricStore: (
      selector: (s: { unlock: () => void; disable: () => Promise<void> }) => unknown,
    ) => selector({ unlock: stableUnlock, disable: stableDisable }),
  };
});

jest.mock('@/store/authStore', () => {
  const stableSignOut = () => mockSignOut();
  return {
    __esModule: true,
    useAuthStore: (selector: (s: { signOut: () => Promise<void> }) => unknown) =>
      selector({ signOut: stableSignOut }),
  };
});

import { LockScreen } from '@/components/auth/LockScreen';

describe('LockScreen', () => {
  beforeEach(() => {
    mockIsSupported.mockReset().mockResolvedValue(true);
    mockPromptBiometric.mockReset().mockResolvedValue({ ok: true });
    mockUnlock.mockReset();
    mockDisable.mockReset();
    mockSignOut.mockReset();
  });

  it('prompts exactly once on mount', async () => {
    render(<LockScreen />);
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(1));
  });

  it('calls unlock() when the prompt succeeds', async () => {
    render(<LockScreen />);
    await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
  });

  it('stays locked and offers retry + sign out when the prompt is cancelled', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    expect(mockUnlock).not.toHaveBeenCalled();
    expect(getByText('Unlock with Face ID')).toBeTruthy();
    expect(getByText('Sign out')).toBeTruthy();
  });

  it('names the lockout when the OS locks biometrics out', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'lockout' });
    const { findByText } = render(<LockScreen />);
    await findByText(/Too many attempts/i);
  });

  it('re-prompts when retry is pressed', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    await act(async () => {
      fireEvent.press(getByText('Unlock with Face ID'));
    });
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(2));
  });

  it('does not stack prompts when retry is pressed while one is in flight', async () => {
    // Never-resolving prompt: the mount attempt stays in flight.
    mockPromptBiometric.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<LockScreen />);
    await waitFor(() => expect(mockPromptBiometric).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.press(getByText('Unlock with Face ID'));
      fireEvent.press(getByText('Unlock with Face ID'));
    });
    expect(mockPromptBiometric).toHaveBeenCalledTimes(1);
  });

  it('disables and unlocks when biometrics are no longer available', async () => {
    mockIsSupported.mockResolvedValue(false);
    render(<LockScreen />);
    await waitFor(() => expect(mockDisable).toHaveBeenCalled());
    await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('signs out when the escape is pressed', async () => {
    mockPromptBiometric.mockResolvedValue({ ok: false, error: 'cancel' });
    const { findByText, getByText } = render(<LockScreen />);
    await findByText(/Face ID cancelled/i);
    await act(async () => {
      fireEvent.press(getByText('Sign out'));
    });
    expect(mockSignOut).toHaveBeenCalled();
  });
});
