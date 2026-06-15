import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: mockPush }) }));

import { PicksCard } from '@/components/picks/PicksCard';

const ROWS: TopPickPlayer[] = [
  { id: '401', name: 'Haaland', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1 },
  { id: '500', name: 'Wood', club: 'NEW', p: 7.5, f: 6.7, tp: 120, own: 21.0, gw: 7.0 },
];
const tk = apexTokens(true, 'classic');

describe('PicksCard selectable', () => {
  beforeEach(() => mockPush.mockReset());

  it('selects a non-owned row and exposes a jersey stats button only for non-owned rows', () => {
    const onSelect = jest.fn();
    const { getByText, getByTestId, queryByTestId } = render(
      <PicksCard
        pos="FWD" rows={ROWS} tk={tk} dark fixtures={{}}
        squadNames={new Set(['Haaland'])}
        selectable selectedId={null} onSelect={onSelect}
      />,
    );
    expect(queryByTestId('stats-401')).toBeNull(); // owned → no jersey stats button
    expect(getByTestId('stats-500')).toBeTruthy(); // non-owned → jersey stats button
    fireEvent.press(getByText('Wood'));            // row body selects
    expect(onSelect).toHaveBeenCalledWith('500');
  });

  it('renders no jersey stats buttons by default (Top Picks usage)', () => {
    const { queryByTestId } = render(
      <PicksCard pos="FWD" rows={ROWS} tk={tk} dark fixtures={{}} squadNames={new Set()} />,
    );
    expect(queryByTestId('stats-500')).toBeNull();
  });
});
