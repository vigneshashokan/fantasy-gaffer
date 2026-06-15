// src/__tests__/components/navIdentity.test.tsx
//
// The account identity (initials, name, FPL team name) must come from the
// signed-in user — never the old "AG" / "A. Gaffer" / "Apex Pitch FC"
// placeholders. The avatar now lives in the bottom tab bar as an "Account"
// item that opens the account menu popup.

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../utils/renderWithProviders';
import { AccountMenu } from '@/components/nav/AccountMenu';
import TabsLayout from '@/app/(home)/(tabs)/_layout';

const mockSignOut = jest.fn();

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, setDark: jest.fn() }),
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
  return { __esModule: true, Tabs, useRouter: () => ({ push: jest.fn() }) };
});

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
  mockUseProfile.mockReturnValue({
    data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: 12345 },
  });
  mockUseManager.mockReturnValue({ data: { name: 'Doyle Dynamos' } });
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
      data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: null },
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
