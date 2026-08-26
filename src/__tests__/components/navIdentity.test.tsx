// src/__tests__/components/navIdentity.test.tsx
//
// The account identity (initials, name, FPL team name) must come from the
// signed-in user — never the old "AG" / "A. Gaffer" / "Apex Pitch FC"
// placeholders. The avatar now lives in the bottom tab bar as an "Account"
// item that opens the account menu popup.

import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders as render } from '../utils/renderWithProviders';
import { AccountMenu } from '@/components/nav/AccountMenu';
import TabsLayout from '@/app/(home)/(tabs)/_layout';
import type { Profile, TeamInfo } from '@/types/fpl';

const mockSignOut = jest.fn();

let mockScheme = 'dark';
const mockSetScheme = jest.fn();
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({
    paletteKey: 'classic', dark: true, scheme: mockScheme, setScheme: mockSetScheme,
  }),
}));

jest.mock('@/store/authStore', () => {
  const useAuthStore = (selector?: (s: unknown) => unknown) => {
    const state = { signOut: mockSignOut, session: null };
    return selector ? selector(state) : state;
  };
  useAuthStore.getState = () => ({ signOut: mockSignOut });
  return { __esModule: true, useAuthStore };
});

// Render the custom tabBar without a real navigation container: the mock Tabs
// just invokes the tabBar render prop with a fake nav state (My Team focused).
jest.mock('expo-router', () => {
  function Tabs({ tabBar }: { tabBar: (p: unknown) => unknown }) {
    const state = {
      index: 1,
      routes: [{ name: 'top-picks' }, { name: 'team' }, { name: 'transfer' }],
    };
    const navigation = { navigate: jest.fn() };
    return tabBar({ state, navigation });
  }
  Tabs.Screen = function TabsScreen() {
    return null;
  };
  return {
    __esModule: true,
    Tabs,
    useRouter: () => ({ push: jest.fn() }),
    useSegments: () => ['(home)', '(tabs)', 'team'],
  };
});

jest.mock('@/components/onboarding/TabCoachmark', () => ({
  __esModule: true,
  TabCoachmark: () => null,
}));

const mockUseProfile = jest.fn();
const mockUseManager = jest.fn();
jest.mock('@/api/profile', () => ({
  __esModule: true,
  useProfile: () => mockUseProfile(),
}));
jest.mock('@/api/manager', () => ({
  __esModule: true,
  useManager: () => mockUseManager(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = 'dark';
  mockSignOut.mockResolvedValue({ error: null });
  mockUseProfile.mockReturnValue({
    data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: 12345 } satisfies Partial<Profile>,
  });
  mockUseManager.mockReturnValue({ data: { name: 'Doyle Dynamos' } satisfies Partial<TeamInfo> });
});

describe('AccountMenu identity', () => {
  it('shows the real name, team name and initials', () => {
    const { getByText, queryByText } = render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(getByText('Vignesh Ashokan')).toBeTruthy();
    expect(getByText('Doyle Dynamos')).toBeTruthy();
    expect(getByText('VA')).toBeTruthy();

    expect(queryByText('A. Gaffer')).toBeNull();
    expect(queryByText('Apex Pitch FC')).toBeNull();
    expect(queryByText('AG')).toBeNull();
  });

  it('omits the team line when no FPL team is connected', () => {
    mockUseProfile.mockReturnValue({
      data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: null } satisfies Partial<Profile>,
    });
    mockUseManager.mockReturnValue({ data: undefined });

    const { getByText, queryByText } = render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(getByText('Vignesh Ashokan')).toBeTruthy();
    expect(queryByText('Apex Pitch FC')).toBeNull();
  });

  // The menu is a plain overlay rather than a <Modal>, so nothing hides it for
  // us: closed HAS to render nothing, or a full-screen transparent view sits
  // over the app swallowing every tap.
  it('renders nothing while closed', () => {
    const { queryByLabelText, queryByText } = render(
      <AccountMenu
        visible={false}
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(queryByLabelText('Close menu')).toBeNull();
    expect(queryByText('Profile')).toBeNull();
  });
});

describe('Account tab (bottom nav)', () => {
  it('shows an Account item with the real user initials, not AG', () => {
    const { getByText, queryByText } = render(<TabsLayout />);
    expect(getByText('Account')).toBeTruthy();
    expect(getByText('VA')).toBeTruthy();
    expect(queryByText('AG')).toBeNull();
  });

  it('opens the account menu when the Account item is pressed', () => {
    const { getByText } = render(<TabsLayout />);
    // menu starts closed
    expect(getByText('My Team')).toBeTruthy();
    fireEvent.press(getByText('Account'));
    // menu now shows the real name
    expect(getByText('Vignesh Ashokan')).toBeTruthy();
  });
});

describe('signing out', () => {
  it('calls only the onSignOut prop — AccountMenu does not sign out itself', () => {
    const onSignOut = jest.fn();
    const { getByTestId } = render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={onSignOut}
      />,
    );
    fireEvent.press(getByTestId('account-menu-signout'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('runs supabase signOut exactly once per tap', async () => {
    const { getByText, getByTestId } = render(<TabsLayout />);
    fireEvent.press(getByText('Account'));
    // act(async) flushes the whole handler chain, so this counts the settled
    // total — a waitFor would pass on the first of two calls.
    await act(async () => {
      fireEvent.press(getByTestId('account-menu-signout'));
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed sign-out instead of closing the menu on a no-op', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // supabase.auth.signOut() resolves { error } and keeps the local session
    // when its remote call fails — the tap otherwise looks like it worked.
    mockSignOut.mockResolvedValue({ error: { message: 'Network request failed' } });

    const { getByText, getByTestId } = render(<TabsLayout />);
    fireEvent.press(getByText('Account'));
    fireEvent.press(getByTestId('account-menu-signout'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't sign out", expect.any(String)));
    alertSpy.mockRestore();
  });

  it('surfaces a sign-out that rejects outright', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignOut.mockRejectedValue(new Error('lock acquisition timeout'));

    const { getByText, getByTestId } = render(<TabsLayout />);
    fireEvent.press(getByText('Account'));
    fireEvent.press(getByTestId('account-menu-signout'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't sign out", expect.any(String)));
    alertSpy.mockRestore();
  });
});

// The theme segments follow the user's CHOICE, not the theme in force: on
// System neither Light nor Dark may claim `selected`, or there is nothing on
// screen saying the app is tracking the device.
describe('AccountMenu theme segments', () => {
  const open = () =>
    render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

  it('offers System before Light and Dark', () => {
    const { getAllByRole } = open();
    const labels = getAllByRole('button')
      .map((n) => n.props.accessibilityLabel)
      .filter((l: string | undefined) => l?.endsWith('theme'));
    expect(labels).toEqual(['System theme', 'Light theme', 'Dark theme']);
  });

  it('selects only the chosen scheme, not the resolved one', () => {
    mockScheme = 'system';
    const { getByLabelText } = open();
    expect(getByLabelText('System theme').props.accessibilityState?.selected).toBe(true);
    // `dark` is true in this mock, so a resolved-theme highlight would light
    // Dark up here.
    expect(getByLabelText('Dark theme').props.accessibilityState?.selected).toBe(false);
  });

  it('records the pick', () => {
    fireEvent.press(open().getByLabelText('Light theme'));
    expect(mockSetScheme).toHaveBeenCalledWith('light');
  });

  // The highlight is one pill that slides between the three. jest can see
  // neither the travel nor its suppression, so what is pinned is that the
  // component ASKS — the pill has to jump, not glide, under reduced motion.
  it('consults reduced motion before sliding the highlight', async () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    open();
    await act(async () => {});
    expect(spy).toHaveBeenCalled();
  });
});
