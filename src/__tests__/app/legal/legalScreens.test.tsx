import React from 'react';

// ScreenHeader reads the safe-area inset (#180); this suite renders screens
// directly, with no SafeAreaProvider above them.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
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
