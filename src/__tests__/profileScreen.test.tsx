import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockEnable = jest.fn();
const mockDisable = jest.fn();
let mockBiometricEnabled = false;
const mockIsSupported = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (selector: (s: {
    enabled: boolean;
    enable: () => Promise<unknown>;
    disable: () => Promise<void>;
  }) => unknown) =>
    selector({
      enabled: mockBiometricEnabled,
      enable: () => mockEnable(),
      disable: () => mockDisable(),
    }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn() }),
}));

import Profile from '@/app/(home)/profile';

describe('Profile screen — Face ID row', () => {
  beforeEach(() => {
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockIsSupported.mockReset();
    mockBiometricEnabled = false;
  });

  it('hides the Face ID row when device is unsupported', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<Profile />);
    await waitFor(() => expect(queryByText('Face ID login')).toBeNull());
  });

  it('shows the Face ID row when device is supported', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Face ID login');
  });

  it('reflects biometricStore.enabled = true in the toggle subtitle', async () => {
    mockBiometricEnabled = true;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Biometric sign-in is on');
  });

  it('reflects biometricStore.enabled = false in the toggle subtitle', async () => {
    mockBiometricEnabled = false;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Profile />);
    await findByText('Use password to sign in');
  });
});
