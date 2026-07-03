// src/__tests__/playerDetailA11y.test.tsx
//
// A11y-focused test for the player detail screen.
// Verifies that the icon-only back chevron is labelled so screen readers
// can announce it — this is the invariant from Task 7 of the a11y audit.

import React from 'react';
import { renderWithProviders } from './utils/renderWithProviders';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '401' }),
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('@/components/ui/Kit', () => ({ __esModule: true, Kit: () => null }));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));

const PLAYER = {
  id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI',
  p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
  status: 'a', news: '', chanceNext: null, ict: 312.4, bps: 640,
};

jest.mock('@/api/players', () => ({
  __esModule: true,
  usePlayers: () => ({ data: [PLAYER], isPending: false }),
}));
jest.mock('@/api/clubs', () => ({
  __esModule: true,
  useClubs: () => ({ data: { MCI: { name: 'Man City', kit: '#fff', kit2: '#fff', ink: '#000' } } }),
  useClubCodeByTeamId: () => ({ data: { 1: 'ARS', 13: 'MCI' } }),
}));
jest.mock('@/api/playerSummary', () => {
  const actual = jest.requireActual('@/api/playerSummary');
  return {
    __esModule: true,
    ...actual,
    useElementSummary: () => ({
      isPending: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        history: [{ round: 4, total_points: 8 }],
        fixtures: [{ event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 }],
      },
    }),
  };
});

import PlayerDetail from '@/app/(home)/player/[id]';

describe('player detail a11y', () => {
  it('labels the back control', () => {
    const { getByLabelText } = renderWithProviders(<PlayerDetail />);
    expect(getByLabelText('Back')).toBeTruthy();
  });
});
