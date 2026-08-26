import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from './utils/renderWithProviders';

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

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: { user: { email: string | null } } | null }) => unknown) =>
    selector({ session: { user: { email: 'test@example.com' } } }),
}));

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  requestDeletion: jest.fn(),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock('@/api/manager', () => ({
  __esModule: true,
  useManager: () => ({ data: { name: 'Apex Pitch FC' } }),
}));

const mockBaseProfile = {
  firstName: 'Apex',
  lastName: 'Gaffer',
  dob: '14 Aug 1990',
  email: 'apex.gaffer@example.com',
  faceId: true,
  fplTeamId: null,
};
jest.mock('@/api/profile', () => ({
  useProfile: jest.fn().mockReturnValue({ data: mockBaseProfile, isPending: false }),
}));

// ChangePassword (rendered by Profile) imports @/lib/auth/email, which pulls
// in the real Supabase client (AsyncStorage native module) at import time.
// Mock it so mounting Profile in jsdom doesn't load the native module.
jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  changePassword: jest.fn().mockResolvedValue({ ok: true }),
}));

import Profile from '@/app/(home)/profile';
import { useProfile } from '@/api/profile';
import type { Profile as ProfileData } from '@/types/fpl';

const BASE_PROFILE: ProfileData = mockBaseProfile;

describe('Profile screen — Face ID row moved to Settings', () => {
  beforeEach(() => {
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockIsSupported.mockReset();
    mockBiometricEnabled = false;
  });

  it('does not render the Face ID row even when biometrics are supported', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    const { queryByText } = render(<Profile />);
    // Flush any pending biometric-capability promise so the assertion
    // would catch the old behavior (Face ID rendered after isSupported resolves).
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByText('Face ID login')).toBeNull();
  });
});

// The screen is presented as a form sheet with a grabber, so it deliberately
// draws no header row of its own — the grabber, the drag-down and the scrim
// are the way out. Putting a back chevron back would leave two.
describe('Profile screen — no header row', () => {
  it('renders neither a back button nor a title', () => {
    const { queryByLabelText, queryByText } = render(<Profile />);
    expect(queryByLabelText('Back')).toBeNull();
    expect(queryByText('Profile')).toBeNull();
  });
});

// The linked team is account data, so it is changed from here. The row has to
// dismiss the sheet BEFORE pushing — a root route pushed from a native modal
// renders behind it on iOS — and flag the push as a relink so connect-team
// drops its "skip for now" first-run affordance.
describe('Profile screen — FPL team row', () => {
  afterEach(() => {
    (useProfile as jest.Mock).mockReturnValue({ data: BASE_PROFILE, isPending: false });
  });

  it('dismisses the sheet and opens connect-team in relink mode', () => {
    (useProfile as jest.Mock).mockReturnValue({
      data: { ...BASE_PROFILE, fplTeamId: 1234567 } satisfies ProfileData,
      isPending: false,
    });
    const { getByLabelText, getByText } = render(<Profile />);

    expect(getByText('Apex Pitch FC · ID 1234567')).toBeTruthy();
    fireEvent.press(getByLabelText('Change FPL team'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(onboarding)/connect-team',
      params: { relink: '1' },
    });
  });

  it('offers a plain connect when no team is linked', () => {
    const { getByLabelText } = render(<Profile />);
    fireEvent.press(getByLabelText('Connect FPL team'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(onboarding)/connect-team',
      params: {},
    });
  });
});
