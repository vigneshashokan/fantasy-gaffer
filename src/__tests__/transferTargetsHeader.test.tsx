import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TransferTargetsHeader } from '@/components/transfer/TransferTargetsHeader';

jest.mock('expo-linear-gradient', () => ({ __esModule: true, LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/Icon', () => ({ __esModule: true, Icon: () => null }));

describe('TransferTargetsHeader', () => {
  it('renders the position title and gameweek subtitle', () => {
    const { getByText } = render(
      <TransferTargetsHeader pos="FWD" nextGw={24} gradFrom="#7C3AED" gradTo="#5B0F63" onBack={jest.fn()} />,
    );
    getByText('Transfer Forwards');
    getByText('Top targets for GW24');
  });

  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <TransferTargetsHeader pos="GKP" nextGw={24} gradFrom="#7C3AED" gradTo="#5B0F63" onBack={onBack} />,
    );
    fireEvent.press(getByTestId('tt-header-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
