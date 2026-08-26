// src/__tests__/playerDetailA11y.test.tsx
//
// The player detail used to be a full-screen modal with its own labelled back
// chevron, and this file guarded that label. Porting the screen to the v2
// mock's bottom sheet removed the header entirely — so the dismiss affordance
// is now the native sheet's grabber/drag/scrim, and the escape gesture a
// screen reader gets from them. That is a layout option, so this guards the
// option: drop it back to a plain card presentation and the sheet chrome goes
// with it, leaving a screen with no way out.

import React from 'react';
import { render } from '@testing-library/react-native';

const mockScreens: { name: string; options?: Record<string, unknown> }[] = [];

jest.mock('expo-router', () => {
  const RN = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    RN.createElement(RN.Fragment, null, children);
  Stack.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    mockScreens.push({ name, options });
    return null;
  };
  return { __esModule: true, Stack, Redirect: () => null };
});

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ session: { user: { id: 'u1' } } }),
}));
jest.mock('@/lib/useProfileGate', () => ({
  __esModule: true,
  useProfileGate: () => ({ status: 'complete' }),
}));
jest.mock('@/components/notifications/PushOrchestrator', () => ({
  __esModule: true,
  PushOrchestrator: () => null,
}));

import HomeStackLayout from '@/app/(home)/_layout';

describe('player detail a11y', () => {
  it('presents the detail as a dismissible native sheet', () => {
    mockScreens.length = 0;
    render(<HomeStackLayout />);
    const player = mockScreens.find((s) => s.name === 'player/[id]');
    expect(player?.options).toMatchObject({
      presentation: 'formSheet',
      sheetGrabberVisible: true,
    });
  });
});
