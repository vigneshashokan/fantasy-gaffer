import React from 'react';

// ScreenHeader reads the safe-area inset (#180); this suite renders screens
// directly, with no SafeAreaProvider above them.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
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

const mockResetAll = jest.fn();
jest.mock('@/store/onboardingStore', () => ({
  __esModule: true,
  useOnboardingStore: (selector: (s: { resetAll: () => void }) => unknown) =>
    selector({ resetAll: mockResetAll }),
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
    data: { deadlines: true, prices: true, gwConfirm: true, transfer: false } satisfies NotificationPrefs,
    isPending: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
}));

// A version that is deliberately NOT the app's real one, so the assertion
// below can only pass if the string is read from config (#181).
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9' } },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: (p: string) => mockPush(p) }),
}));

import Settings from '@/app/(home)/settings';
import { shareApp, sendFeedback } from '@/lib/external';
import type { NotificationPrefs } from '@/api/notificationPrefs';

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
    await findByText('Face ID required to open the app');
  });

  it('reflects biometricStore.enabled = false in the toggle subtitle', async () => {
    mockBiometricEnabled = false;
    mockIsSupported.mockResolvedValueOnce(true);
    const { findByText } = render(<Settings />);
    await findByText('App opens without Face ID');
  });
});

describe('Settings screen — More actions', () => {
  beforeEach(() => {
    (shareApp as jest.Mock).mockClear();
    (sendFeedback as jest.Mock).mockClear();
    mockPush.mockClear();
    mockResetAll.mockClear();
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

  it('resets onboarding tips when Replay tutorial is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Replay tutorial'));
    expect(mockResetAll).toHaveBeenCalled();
  });

  // #181: was hardcoded 'v1.0.0', so a version bump would silently leave the
  // string (and every bug report quoting it) wrong.
  it('reads the version string from the build config, not a literal', () => {
    const { getByText, queryByText } = render(<Settings />);
    getByText('Fantasy Gaffer · v9.9.9');
    expect(queryByText('Fantasy Gaffer · v1.0.0')).toBeNull();
  });

  // #174: five social rows whose onPress was `() => {}`.
  it('no longer offers the dead Follow Us rows', () => {
    const { queryByText } = render(<Settings />);
    expect(queryByText('Follow Us')).toBeNull();
  });
});
