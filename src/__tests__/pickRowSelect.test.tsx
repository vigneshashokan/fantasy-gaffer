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
const tk = apexTokens(true, 'classic');
const base = { p: PLAYER, zebra: false, last: true, tk, dark: true, fixtures: {} };

describe('PickRow select-for-transfer', () => {
  beforeEach(() => mockPush.mockReset());

  it('selects (does not navigate) when a non-owned selectable row body is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <PickRow {...base} squadNames={new Set()} selectable selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Haaland'));
    expect(onSelect).toHaveBeenCalledWith('401');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens stats (does not select) when the jersey "i" is pressed', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <PickRow {...base} squadNames={new Set()} selectable selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('stats-401'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '401' } });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('owned (in team) rows are not selectable and have no jersey stats button — the row opens stats', () => {
    const onSelect = jest.fn();
    const { getByText, queryByTestId } = render(
      <PickRow {...base} squadNames={new Set(['Haaland'])} selectable selectedId={null} onSelect={onSelect} />,
    );
    expect(queryByTestId('stats-401')).toBeNull();
    fireEvent.press(getByText('Haaland'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '401' } });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('navigates to stats on row press when not selectable (Top Picks default), with no jersey button', () => {
    const { getByText, queryByTestId } = render(<PickRow {...base} squadNames={new Set()} />);
    expect(queryByTestId('stats-401')).toBeNull();
    fireEvent.press(getByText('Haaland'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '401' } });
  });
});
