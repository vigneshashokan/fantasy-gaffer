import React from 'react';
import { render } from '@testing-library/react-native';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import type { PitchPlayer } from '@/types/fpl';

const mk = (over: Partial<PitchPlayer>): PitchPlayer => ({
  id: '1',
  name: 'Player',
  pts: 5,
  club: 'MCI',
  ...over,
});

describe('ApexPitch captain / vice badges', () => {
  it('renders a C badge for the captain and a V badge for the vice', () => {
    const rows: PitchPlayer[][] = [
      [
        mk({ id: '1', name: 'Capn', capt: true }),
        mk({ id: '2', name: 'Vicey', vice: true }),
        mk({ id: '3', name: 'Plain' }),
      ],
    ];
    const { getByText } = render(<ApexPitch rows={rows} />);
    expect(getByText('C')).toBeTruthy();
    expect(getByText('V')).toBeTruthy();
  });

  it('shows neither badge for a player who is not captain or vice', () => {
    const rows: PitchPlayer[][] = [[mk({ id: '9', name: 'Plain' })]];
    const { queryByText } = render(<ApexPitch rows={rows} />);
    expect(queryByText('C')).toBeNull();
    expect(queryByText('V')).toBeNull();
  });
});
