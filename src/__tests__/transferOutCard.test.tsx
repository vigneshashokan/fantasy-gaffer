import React from 'react';
import { render } from '@testing-library/react-native';
import { TransferOutCard } from '@/components/transfer/TransferOutCard';

const base = { name: 'Haaland', clubName: 'Man City', club: 'MCI' as const, price: 14.2, points: 175 };

describe('TransferOutCard', () => {
  it('shows name, meta line and OUT pill', () => {
    const { getByText } = render(<TransferOutCard {...base} captain={false} />);
    getByText('Haaland');
    getByText('Man City · £14.2m · 175 pts');
    getByText('OUT');
  });

  it('shows a captain badge when captain', () => {
    const { getByText } = render(<TransferOutCard {...base} captain />);
    getByText('C');
  });

  it('hides the captain badge when not captain', () => {
    const { queryByText } = render(<TransferOutCard {...base} captain={false} />);
    expect(queryByText('C')).toBeNull();
  });
});
