import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

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
  useThemeStore: () => ({
    paletteKey: 'classic',
    dark: true,
    setPaletteKey: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('@/lib/external', () => ({
  __esModule: true,
  shareApp: jest.fn().mockResolvedValue(undefined),
  sendFeedback: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({
    data: { deadlines: true, prices: true, gwConfirm: true, transfer: false },
    isPending: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: (p: string) => mockPush(p) }),
}));

import Settings from '@/app/(home)/settings';
import { shareApp, sendFeedback } from '@/lib/external';

describe('Settings screen — Face ID row', () => {
  beforeEach(() => {
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockIsSupported.mockReset();
    mockBiometricEnabled = false;
  });

  it('hides the Face ID row when device is unsupported', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const { queryByText } = render(<Settings />);
    await waitFor(() => expect(queryByText('Face ID login')).toBeNull());
  });

  it('shows the Face ID row when device is supported', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Settings />);
    await findByText('Face ID login');
  });

  it('reflects biometricStore.enabled = true in the toggle subtitle', async () => {
    mockBiometricEnabled = true;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Settings />);
    await findByText('Biometric sign-in is on');
  });

  it('reflects biometricStore.enabled = false in the toggle subtitle', async () => {
    mockBiometricEnabled = false;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Settings />);
    await findByText('Use password to sign in');
  });
});

describe('Settings screen — More actions', () => {
  beforeEach(() => {
    (shareApp as jest.Mock).mockClear();
    (sendFeedback as jest.Mock).mockClear();
    mockPush.mockClear();
    mockIsSupported.mockResolvedValue(false);
  });

  it('invokes shareApp when the Share row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Share Fantasy Gaffer'));
    expect(shareApp).toHaveBeenCalled();
  });

  it('invokes sendFeedback when the Feedback row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Send Feedback'));
    expect(sendFeedback).toHaveBeenCalled();
  });

  it('navigates to the in-app Terms screen when the Terms row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
  });

  it('navigates to the in-app Privacy screen when the Privacy row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
  });
});
