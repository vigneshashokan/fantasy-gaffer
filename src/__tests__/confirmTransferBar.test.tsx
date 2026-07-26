import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import { ConfirmTransferBar } from '@/components/transfer/ConfirmTransferBar';

const tk = apexTokens(true, 'classic');

describe('ConfirmTransferBar', () => {
  it('shows out and in names and the confirm button', () => {
    const { getByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onDone={jest.fn()} tk={tk} />,
    );
    getByText('Haaland');
    getByText('Wood');
    getByText('Confirm transfer');
  });

  it('replaces the swap row with the saved-plan state when confirmed', () => {
    const { getByText, queryByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onDone={jest.fn()} tk={tk} />,
    );
    fireEvent.press(getByText('Confirm transfer'));
    expect(queryByText('Haaland')).toBeNull();
    getByText('Open FPL');
  });
});
