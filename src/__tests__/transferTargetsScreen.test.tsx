import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string } = { id: '401' };

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('expo-linear-gradient', () => ({ __esModule: true, LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));

const HAALAND = { id: '401', name: 'Haaland', pos: 'FWD', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1, capt: true };
const WOOD = { id: '500', name: 'Wood', pos: 'FWD', club: 'NEW', p: 7.5, f: 6.7, tp: 120, own: 21.0, gw: 7.0 };

jest.mock('@/api/squad', () => ({
  __esModule: true,
  useSquad: () => ({ data: { starters: [HAALAND], bench: [] }, isPending: false }),
}));
jest.mock('@/api/players', () => ({
  __esModule: true,
  useTopPicks: () => ({ data: { GKP: [], DEF: [], MID: [], FWD: [HAALAND, WOOD] }, isPending: false }),
}));
jest.mock('@/api/clubs', () => ({
  __esModule: true,
  useClubs: () => ({ data: { MCI: { name: 'Man City' }, NEW: { name: 'Newcastle' } } }),
}));
jest.mock('@/api/fixtures', () => ({
  __esModule: true,
  useCurrentGameweek: () => ({ data: { gw: 23 } }),
  useFixturesByGw: () => ({ data: {} }),
}));

import TransferTargetsScreen from '@/app/(home)/transfer-targets/[id]';

describe('TransferTargetsScreen', () => {
  beforeEach(() => { mockBack.mockReset(); mockPush.mockReset(); mockParams = { id: '401' }; });

  it('shows the OUT player and the position targets list', () => {
    const { getByText, getAllByText } = render(<TransferTargetsScreen />);
    getByText('Transfer Forwards');
    getByText('Top targets for GW24');
    getByText('OUT');
    getByText('Wood');
    expect(getAllByText('Haaland').length).toBeGreaterThan(0);
  });

  it('does not show the Confirm bar until a target row is selected', () => {
    const { queryByText, getByText } = render(<TransferTargetsScreen />);
    expect(queryByText('Confirm transfer')).toBeNull();
    fireEvent.press(getByText('Wood')); // tap the row body to select
    getByText('Confirm transfer');
  });

  it('opens player stats when a non-owned target jersey is pressed', () => {
    const { getByTestId } = render(<TransferTargetsScreen />);
    fireEvent.press(getByTestId('stats-500'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '500' } });
  });

  it('owned players are not selectable — pressing the row opens stats, not the Confirm bar', () => {
    const { getByText, queryByText, queryByTestId } = render(<TransferTargetsScreen />);
    expect(queryByTestId('stats-401')).toBeNull(); // owned row has no jersey stats button
    fireEvent.press(getByText('In team'));         // owned row body
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '401' } });
    expect(queryByText('Confirm transfer')).toBeNull();
  });

  it('renders a not-found fallback for an unknown id', () => {
    mockParams = { id: '999' };
    const { getByText } = render(<TransferTargetsScreen />);
    getByText('Player not found');
  });
});
