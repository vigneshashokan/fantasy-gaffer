import { render } from '@testing-library/react-native';
import { PickRow } from '@/components/picks/PickRow';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const tk = apexTokens(true, 'classic');
const base = { zebra: false, last: true, tk, dark: true, fixtures: {}, squadNames: new Set<string>() };

function pick(over: Partial<TopPickPlayer>): TopPickPlayer {
  return { id: '1', name: 'Salah', club: 'LIV', p: 12.5, f: 7.0, tp: 200, own: 40, gw: 5.2, ...over };
}

describe('PickRow xPts cell', () => {
  it('shows the projection p50 (one decimal) when present', () => {
    const { getByText } = render(<PickRow p={pick({ xp: 6.4 })} {...base} />);
    expect(getByText('6.4')).toBeTruthy();
  });

  it('falls back to ep_next (gw) when no projection', () => {
    const { getByText } = render(<PickRow p={pick({ xp: undefined, gw: 5.2 })} {...base} />);
    expect(getByText('5.2')).toBeTruthy();
  });
});
