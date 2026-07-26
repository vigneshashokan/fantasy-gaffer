import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockLoadPendingDeletion = jest.fn();
const mockCancelDeletion = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

let mockProfile: { first_name?: string } | null = { first_name: 'Ada' };
const mockProfilesMaybeSingle = jest.fn(() =>
  Promise.resolve({ data: mockProfile, error: null }),
);
const mockProfilesEq = jest.fn(() => ({ maybeSingle: mockProfilesMaybeSingle }));
const mockProfilesSelect = jest.fn(() => ({ eq: mockProfilesEq }));

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  loadPendingDeletion: () => mockLoadPendingDeletion(),
  cancelDeletion: () => mockCancelDeletion(),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown; signOut: () => Promise<void> }) => unknown) =>
    selector({
      session: { user: { id: 'u1' } },
      signOut: () => mockSignOut(),
    }),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') return { select: mockProfilesSelect };
      throw new Error('unexpected table: ' + table);
    },
  },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

import RestoreAccount from '@/app/(onboarding)/restore-account';

describe('RestoreAccount screen', () => {
  beforeEach(() => {
    mockLoadPendingDeletion.mockReset();
    mockCancelDeletion.mockReset();
    mockSignOut.mockReset();
    mockReplace.mockReset();
    mockProfile = { first_name: 'Ada' };
    mockProfilesMaybeSingle.mockClear();
    mockProfilesEq.mockClear();
    mockProfilesSelect.mockClear();
  });

  // #181: this screen used to render a bare logo on an otherwise blank page
  // while the deletion row resolved — on the app's most anxious screen.
  it('shows a skeleton while the pending-deletion row is still loading', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { getByTestId, queryByTestId, findByText } = render(<RestoreAccount />);
    expect(getByTestId('restore-loading')).toBeTruthy();
    await findByText('Welcome back, Ada');
    expect(queryByTestId('restore-loading')).toBeNull();
  });

  it('renders Welcome back, <firstName> when profile is loaded', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
  });

  it('falls back to Welcome back without a name when profile is missing', async () => {
    mockProfile = null;
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText('Welcome back');
  });

  it('renders the daysRemaining count from loadPendingDeletion', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText(/within 12 days/);
  });

  it('Restore tap calls cancelDeletion and on ok routes to home', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockCancelDeletion.mockResolvedValueOnce({ ok: true, value: undefined });
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Restore my account'));
    await waitFor(() => expect(mockCancelDeletion).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('Restore on cancelDeletion error shows inline error and does not route', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockCancelDeletion.mockResolvedValueOnce({ ok: false, error: 'network' });
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Restore my account'));
    await findByText(/Couldn't restore your account/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Cancel tap signs out and replaces to /(onboarding)/signin', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockSignOut.mockResolvedValueOnce(undefined);
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Cancel'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('routes home when loadPendingDeletion returns null (cron already swept)', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce(null);
    render(<RestoreAccount />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team'));
  });
});
