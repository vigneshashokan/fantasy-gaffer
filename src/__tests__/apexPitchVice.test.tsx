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

const renderOne = (p: Partial<PitchPlayer>) => render(<ApexPitch rows={[[mk(p)]]} />);

describe('ApexPitch captain / vice chips', () => {
  it('renders a C chip for the captain and a V chip for the vice', () => {
    const { getByText } = render(
      <ApexPitch rows={[[mk({ id: '1', name: 'Capn', capt: true }), mk({ id: '2', name: 'Vicey', vice: true })]]} />,
    );
    expect(getByText('C')).toBeTruthy();
    expect(getByText('V')).toBeTruthy();
  });

  it('shows no chip for a plain player', () => {
    const { queryByText } = renderOne({ name: 'Plain' });
    expect(queryByText('C')).toBeNull();
    expect(queryByText('V')).toBeNull();
  });
});

describe('ApexPitch event badges', () => {
  it('renders a goal stack', () => {
    expect(renderOne({ goals: 3 }).getByLabelText('3 goals')).toBeTruthy();
  });
  it('renders an assist stack', () => {
    expect(renderOne({ assists: 2 }).getByLabelText('2 assists')).toBeTruthy();
  });
  it('renders cards top-right', () => {
    expect(renderOne({ cards: ['yellow', 'red'] }).getByTestId('card-red')).toBeTruthy();
  });
  it('renders the subbed-off pill', () => {
    expect(renderOne({ sub: 72 }).getByText("←72'")).toBeTruthy();
  });
  it('renders the subbed-on pill', () => {
    expect(renderOne({ subIn: 65 }).getByText("65'→")).toBeTruthy();
  });
  it('renders the bonus star', () => {
    expect(renderOne({ bonus: 3 }).getByTestId('bonus-star')).toBeTruthy();
  });
});
