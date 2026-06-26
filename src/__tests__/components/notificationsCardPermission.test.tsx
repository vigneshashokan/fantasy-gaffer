import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('@/api/notificationPrefs', () => ({
  __esModule: true,
  useNotificationPrefs: () => ({ data: { deadlines: true, prices: true, gwConfirm: true, transfer: false }, isPending: false }),
  useUpdateNotificationPrefs: () => ({ mutate: jest.fn(), isError: false }),
  DEFAULT_PREFS: { deadlines: true, prices: true, gwConfirm: true, transfer: false },
}));
jest.mock('@/lib/notifications/usePushPermission', () => ({
  __esModule: true,
  usePushPermission: () => ({ status: 'denied', canAskAgain: false, refresh: jest.fn() }),
}));

import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { apexTokens } from '@/constants/apexTokens';

describe('NotificationsCard permission CTA', () => {
  it('shows an Enable-in-Settings CTA and opens settings when denied', () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve());
    const { getByText } = render(<NotificationsCard tk={apexTokens(true, 'classic')} />);
    fireEvent.press(getByText('Enable in Settings'));
    expect(openSettingsSpy).toHaveBeenCalled();
    openSettingsSpy.mockRestore();
  });
});
