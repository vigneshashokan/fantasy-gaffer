import React from 'react';
import { render } from '@testing-library/react-native';
import { GwArrow } from '@/components/team/GwNav';

const tk: any = { card: '#111', dark: true, variant: '#ccc' };

describe('GwArrow accessibility', () => {
  it('labels the previous/next paging arrows', () => {
    const prev = render(<GwArrow dir="l" tk={tk} onPress={() => {}} />);
    expect(prev.getByLabelText('Previous gameweek')).toBeTruthy();
    const next = render(<GwArrow dir="r" tk={tk} onPress={() => {}} />);
    expect(next.getByLabelText('Next gameweek')).toBeTruthy();
  });

  it('marks a disabled arrow in its accessibility state', () => {
    const r = render(<GwArrow dir="l" tk={tk} disabled onPress={() => {}} />);
    expect(r.getByLabelText('Previous gameweek').props.accessibilityState?.disabled).toBe(true);
  });
});
