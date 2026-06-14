import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: mockPush }) }));

import { PickRow } from '@/components/picks/PickRow';

const PLAYER: TopPickPlayer = {
  id: '401', name: 'Haaland', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
};

describe('PickRow navigation', () => {
  beforeEach(() => mockPush.mockReset());
  it('navigates to the player detail route by id on press', () => {
    const { getByText } = render(
      <PickRow
        p={PLAYER}
        zebra={false}
        last
        tk={apexTokens(true, 'classic')}
        dark
        fixtures={{}}
        squadNames={new Set()}
      />,
    );
    fireEvent.press(getByText('Haaland'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(home)/player/[id]',
      params: { id: '401' },
    });
  });
});
