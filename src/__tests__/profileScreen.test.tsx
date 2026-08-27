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
const mockUpdateName = jest.fn().mockResolvedValue(undefined);
jest.mock('@/api/profile', () => ({
  useProfile: jest.fn().mockReturnValue({ data: mockBaseProfile, isPending: false }),
  useUpdateName: () => ({ mutateAsync: mockUpdateName }),
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

// Names are editable in place; dob and email are not. Blur is the only commit
// path (a single-line input blurs itself on Done), so these drive onBlur.
describe('Profile screen — editable name', () => {
  beforeEach(() => mockUpdateName.mockClear());

  it('saves an edited first name', async () => {
    const { getByLabelText, getByTestId } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit first name'));
    fireEvent.changeText(getByTestId('edit-first-name'), '  Vignesh  ');
    await act(async () => {
      fireEvent(getByTestId('edit-first-name'), 'blur');
    });
    expect(mockUpdateName).toHaveBeenCalledWith({ firstName: 'Vignesh' });
  });

  it('saves an edited last name', async () => {
    const { getByLabelText, getByTestId } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit last name'));
    fireEvent.changeText(getByTestId('edit-last-name'), 'Ashokan');
    await act(async () => {
      fireEvent(getByTestId('edit-last-name'), 'blur');
    });
    expect(mockUpdateName).toHaveBeenCalledWith({ lastName: 'Ashokan' });
  });

  // An empty name would wipe the profile row; an unchanged one is a pointless
  // write. Both just leave edit mode.
  it('writes nothing for an empty or unchanged name', async () => {
    const { getByLabelText, getByTestId } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit first name'));
    fireEvent.changeText(getByTestId('edit-first-name'), '   ');
    await act(async () => {
      fireEvent(getByTestId('edit-first-name'), 'blur');
    });

    fireEvent.press(getByLabelText('Edit last name'));
    await act(async () => {
      fireEvent(getByTestId('edit-last-name'), 'blur');
    });

    expect(mockUpdateName).not.toHaveBeenCalled();
  });

  // The pencil never says "not saved yet", so an edit in flight looked
  // identical to one already written.
  it('turns the pencil into a save tick once the name changes', async () => {
    const { getByLabelText, getByTestId, queryByLabelText } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit first name'));
    expect(queryByLabelText('Save first name')).toBeNull();

    fireEvent.changeText(getByTestId('edit-first-name'), 'Vignesh');
    await act(async () => {
      fireEvent.press(getByLabelText('Save first name'));
    });
    expect(mockUpdateName).toHaveBeenCalledWith({ firstName: 'Vignesh' });
  });

  // Pressing the tick blurs the input first, so one gesture reaches commit
  // twice — it must still write once.
  it('writes once when the tick press follows its own blur', async () => {
    const { getByLabelText, getByTestId } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit first name'));
    fireEvent.changeText(getByTestId('edit-first-name'), 'Vignesh');
    const tick = getByLabelText('Save first name');
    await act(async () => {
      fireEvent(getByTestId('edit-first-name'), 'blur');
      fireEvent.press(tick);
    });
    expect(mockUpdateName).toHaveBeenCalledTimes(1);
  });

  // Typing a name back to the original greyed the pencil out as though the
  // row had broken — `disabled` is a visible state on iOS.
  it('leaves the pencil untouched when the draft is typed back to the original', () => {
    const { getByLabelText, getByTestId } = render(<Profile />);
    const resting = getByTestId('edit-first-name-button').props.accessibilityState;

    fireEvent.press(getByLabelText('Edit first name'));
    fireEvent.changeText(getByTestId('edit-first-name'), 'Vignesh');
    fireEvent.changeText(getByTestId('edit-first-name'), BASE_PROFILE.firstName);

    expect(getByLabelText('Edit first name')).toBeTruthy();
    expect(getByTestId('edit-first-name-button').props.accessibilityState)
      .toEqual(resting);
  });

  it('keeps dob and email locked', () => {
    const { queryByLabelText } = render(<Profile />);
    expect(queryByLabelText('Edit date of birth')).toBeNull();
    expect(queryByLabelText('Edit email address')).toBeNull();
  });

  it('surfaces a failed save in the row', async () => {
    mockUpdateName.mockRejectedValueOnce(new Error('Network request failed'));
    const { getByLabelText, getByTestId, getByText } = render(<Profile />);
    fireEvent.press(getByLabelText('Edit first name'));
    fireEvent.changeText(getByTestId('edit-first-name'), 'Vignesh');
    await act(async () => {
      fireEvent(getByTestId('edit-first-name'), 'blur');
    });
    expect(getByText('Network request failed')).toBeTruthy();
  });
});
