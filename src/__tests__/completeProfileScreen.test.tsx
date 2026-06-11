import React from 'react';
import { render } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (
    selector: (s: { session: { user: { id: string; user_metadata: Record<string, string> } } | null }) => unknown,
  ) =>
    selector({
      session: {
        user: { id: 'user-1', user_metadata: { given_name: 'Test', family_name: 'User' } },
      },
    }),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: () => ({ insert: jest.fn().mockResolvedValue({ error: null }) }),
  },
}));

import CompleteProfile from '@/app/(onboarding)/complete-profile';

describe('CompleteProfile screen — DOB helper text', () => {
  it('shows a COPPA-friendly explanation below the date-of-birth field', () => {
    const { getByText } = render(<CompleteProfile />);
    getByText("We need this to confirm you're 13 or older to use FPL Gaffer.");
  });
});
