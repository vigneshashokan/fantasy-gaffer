import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, setPaletteKey: jest.fn() }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack }),
}));

import PrivacyScreen from '@/app/legal/privacy';
import TermsScreen from '@/app/legal/terms';

describe('legal screens', () => {
  it('privacy screen renders its header title and content', () => {
    const { getAllByText } = render(<PrivacyScreen />);
    expect(getAllByText('Privacy Policy').length).toBeGreaterThan(0);
  });

  it('terms screen renders its header title and content', () => {
    const { getAllByText } = render(<TermsScreen />);
    expect(getAllByText('Terms of Service').length).toBeGreaterThan(0);
  });
});
