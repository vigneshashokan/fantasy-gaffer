// src/__tests__/components/tabHeader.test.tsx
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { TabHeader } from '@/components/ui/TabHeader';
import { apexTokens } from '@/constants/apexTokens';

const tk = apexTokens(true, 'classic');

describe('TabHeader', () => {
  it('renders the title', () => {
    const { getByText } = render(<TabHeader title="Transfer" tk={tk} />);
    expect(getByText('Transfer')).toBeTruthy();
  });

  it('renders the subtitle when provided', () => {
    const { getByText } = render(
      <TabHeader title="Top Picks" tk={tk} subtitle="Refreshes after the gameweek" />,
    );
    expect(getByText('Refreshes after the gameweek')).toBeTruthy();
  });

  it('omits the subtitle when not provided', () => {
    const { queryByText } = render(<TabHeader title="Transfer" tk={tk} />);
    expect(queryByText('Refreshes after the gameweek')).toBeNull();
  });

  it('renders a trailing node alongside the title', () => {
    const { getByText } = render(
      <TabHeader title="Top Picks" tk={tk} trailing={<Text>GW24 LIVE</Text>} />,
    );
    expect(getByText('Top Picks')).toBeTruthy();
    expect(getByText('GW24 LIVE')).toBeTruthy();
  });
});
