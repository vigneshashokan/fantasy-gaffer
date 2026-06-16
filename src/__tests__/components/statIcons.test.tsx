import React from 'react';
import { render } from '@testing-library/react-native';
import { BallIcon, BootIcon } from '@/components/ui/statIcons';

describe('statIcons', () => {
  it('renders the ball icon', () => {
    expect(render(<BallIcon />).toJSON()).toBeTruthy();
  });
  it('renders the boot icon at a custom size/color', () => {
    expect(render(<BootIcon size={20} color="#000" />).toJSON()).toBeTruthy();
  });
});
