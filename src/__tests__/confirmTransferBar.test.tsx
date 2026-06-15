import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import { ConfirmTransferBar } from '@/components/transfer/ConfirmTransferBar';

const tk = apexTokens(true, 'classic');

describe('ConfirmTransferBar', () => {
  it('shows out and in names and the confirm button', () => {
    const { getByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onConfirm={jest.fn()} tk={tk} />,
    );
    getByText('Haaland');
    getByText('Wood');
    getByText('Confirm transfer');
  });

  it('fires onConfirm when the button is pressed', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onConfirm={onConfirm} tk={tk} />,
    );
    fireEvent.press(getByText('Confirm transfer'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
