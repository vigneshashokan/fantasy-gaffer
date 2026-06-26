import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PushPrimingSheet } from '@/components/notifications/PushPrimingSheet';
import { apexTokens } from '@/constants/apexTokens';

const tk = apexTokens(true, 'classic');

describe('PushPrimingSheet', () => {
  it('fires onEnable / onLater from the buttons when visible', () => {
    const onEnable = jest.fn();
    const onLater = jest.fn();
    const { getByText } = render(
      <PushPrimingSheet visible onEnable={onEnable} onLater={onLater} tk={tk} />,
    );
    fireEvent.press(getByText('Enable notifications'));
    expect(onEnable).toHaveBeenCalled();
    fireEvent.press(getByText('Maybe later'));
    expect(onLater).toHaveBeenCalled();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <PushPrimingSheet visible={false} onEnable={jest.fn()} onLater={jest.fn()} tk={tk} />,
    );
    expect(queryByText('Enable notifications')).toBeNull();
  });
});
