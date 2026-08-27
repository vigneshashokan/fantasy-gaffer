import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { renderWithProviders } from './utils/renderWithProviders';

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, pitchStyle: 'classic' }),
}));
// Stand in for the page so we assert shell wiring, not page internals. It
// prints its own `active` flag, which is what tells a page to snap its scroll
// back to the top.
jest.mock('@/components/team/GameweekScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    GameweekScreen: ({ gw, active }: { gw: number; active: boolean }) => (
      <Text>{`Page ${gw}${active ? ' active' : ''}`}</Text>
    ),
  };
});
jest.mock('@/components/team/LinkTeamCta', () => {
  const { Text } = jest.requireActual('react-native');
  return { __esModule: true, LinkTeamCta: () => <Text>Link your team</Text> };
});

// Partial<ApexTeamData>: this suite only asserts on the shell (header, paging,
// season banner), not full team content — so the fixture only fills the
// fields it actually reads. `Partial<>` still catches a rename/type change on
// any field that IS specified (see #155).
let mockTeam: {
  data: ShellTeam | null | undefined; isPending: boolean; isError: boolean; error: unknown; noTeam: boolean; noSquad: boolean;
};
jest.mock('@/api/squad', () => ({
  __esModule: true,
  useApexTeam: () => mockTeam,
}));

let mockSeason: { data: { kind: string; gw?: number } | undefined } = { data: undefined };
jest.mock('@/api/fixtures', () => ({
  __esModule: true,
  useSeasonState: () => mockSeason,
  currentSeasonLabel: () => '2025/26',
}));

import TeamTab from '@/app/(home)/(tabs)/team';
import type { ApexTeamData } from '@/api/squad';

// `Partial<>` is shallow, so `transfer` — of which the shell reads only the
// two banner fields — gets its own.
type ShellTeam = Partial<Omit<ApexTeamData, 'transfer'>> & {
  transfer?: Partial<ApexTeamData['transfer']>;
};

const liveTeam = (liveGw: number) => ({
  data: {
    liveGw, liveGwFinished: false, captainApplied: '', teamName: 'Apex Pitch FC',
    transfer: { nextGw: liveGw + 1, deadline: 'Fri 28 Aug at 10:30' },
  } satisfies ShellTeam,
  isPending: false, isError: false, error: null, noTeam: false, noSquad: false,
});

describe('TeamTab carousel shell', () => {
  beforeEach(() => {
    mockSeason = { data: undefined };
  });

  it('shows the link-team CTA when there is no team', () => {
    mockTeam = { data: null, isPending: false, isError: false, error: null, noTeam: true, noSquad: false };
    const { getByText, queryByTestId } = renderWithProviders(<TeamTab />);
    expect(getByText('Link your team')).toBeTruthy();
    expect(queryByTestId('gw-carousel')).toBeNull();
  });

  // Ordering guard. On a picks 404 the hook reports data:null with isPending
  // false, so a noSquad branch placed AFTER `if (isPending || !at)` is
  // unreachable and the screen pulses a skeleton forever — the 2026/27
  // pre-season failure, and the same shape as the #167 error-branch bug.
  it('shows the no-squad CTA rather than an endless skeleton when picks 404', () => {
    mockTeam = { data: null, isPending: false, isError: false, error: null, noTeam: false, noSquad: true };
    const { getByTestId, queryByTestId } = renderWithProviders(<TeamTab />);
    expect(getByTestId('no-squad-cta')).toBeTruthy();
    expect(getByTestId('open-fpl-cta')).toBeTruthy();
    expect(queryByTestId('gw-carousel')).toBeNull();
  });

  it('renders the carousel with at least the live gameweek page', () => {
    mockTeam = liveTeam(30);
    const { getByTestId, getAllByText } = renderWithProviders(<TeamTab />);
    expect(getByTestId('gw-carousel')).toBeTruthy();
    expect(getAllByText(/^Page \d+( active)?$/).length).toBeGreaterThan(0);
  });

  // Pages keep their scroll position while they stay mounted, so each one is
  // told when it stops being the page in view and resets itself. That flag must
  // only move once a page is SQUARELY in view: the label flips at the halfway
  // point, and a page reset while still half on screen jumps visibly.
  it('marks a page active only once the scroll settles on a boundary', () => {
    mockTeam = liveTeam(30);
    const { getByTestId, getByText, queryByText } = renderWithProviders(<TeamTab />);
    const W = Dimensions.get('window').width;
    const carousel = getByTestId('gw-carousel');
    const scrollTo = (x: number) =>
      fireEvent.scroll(carousel, {
        nativeEvent: {
          contentOffset: { x, y: 0 },
          contentSize: { width: W * 31, height: 640 },
          layoutMeasurement: { width: W, height: 640 },
        },
      });

    expect(getByText('Page 30 active')).toBeTruthy();

    // Past halfway towards GW31 — the label has flipped, but nothing has
    // settled, so GW30 is still the page holding its scroll position.
    scrollTo(W * 29.5);
    expect(getByText('Gameweek 31')).toBeTruthy();
    expect(getByText('Page 30 active')).toBeTruthy();
    expect(queryByText('Page 31 active')).toBeNull();

    // Landed on GW31: GW30 is now off screen and free to reset. (Only the one
    // page mounts under jest, so GW30 losing the flag is the whole assertion.)
    scrollTo(W * 30);
    expect(getByText('Page 30')).toBeTruthy();
    expect(queryByText('Page 30 active')).toBeNull();
  });

  it('shows the team name as the header', () => {
    mockTeam = liveTeam(30);
    const { getByText } = renderWithProviders(<TeamTab />);
    expect(getByText('Apex Pitch FC')).toBeTruthy();
  });

  // The pill used to live inside each carousel page. It sits in the shell now,
  // beside the arrows that page it, so it neither scrolls away nor lags a swipe.
  it('labels the active gameweek beside the paging arrows', () => {
    mockTeam = liveTeam(30);
    const { getByText } = renderWithProviders(<TeamTab />);
    expect(getByText('Gameweek 30')).toBeTruthy();
  });

  it('renders both paging arrows, enabled mid-season', () => {
    mockTeam = liveTeam(30); // active gw defaults to 30, maxGw 31
    const { getByTestId } = renderWithProviders(<TeamTab />);
    expect(getByTestId('gw-prev').props.accessibilityState?.disabled).toBe(false);
    expect(getByTestId('gw-next').props.accessibilityState?.disabled).toBe(false);
  });

  it('disables the prev arrow on gameweek 1', () => {
    mockTeam = liveTeam(1); // active gw defaults to 1 = MIN_GW
    const { getByTestId } = renderWithProviders(<TeamTab />);
    expect(getByTestId('gw-prev').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('gw-next').props.accessibilityState?.disabled).toBe(false);
  });

  it('disables the next arrow at the final gameweek', () => {
    mockTeam = liveTeam(38); // active gw 38, maxGw = min(38, 39) = 38
    const { getByTestId } = renderWithProviders(<TeamTab />);
    expect(getByTestId('gw-next').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('gw-prev').props.accessibilityState?.disabled).toBe(false);
  });

  it('shows the loading skeleton (no carousel) while the live team loads', () => {
    mockTeam = { data: undefined, isPending: true, isError: false, error: null, noTeam: false, noSquad: false };
    const { queryByTestId } = renderWithProviders(<TeamTab />);
    expect(queryByTestId('gw-carousel')).toBeNull();
  });

  it('shows the season-complete banner when the season is over', () => {
    mockTeam = liveTeam(38);
    mockSeason = { data: { kind: 'complete' } };
    const { getByText } = renderWithProviders(<TeamTab />);
    expect(getByText('2025/26 Season completed')).toBeTruthy();
  });

  it('hides the season-complete banner mid-season', () => {
    mockTeam = liveTeam(30);
    mockSeason = { data: { kind: 'live', gw: 30 } };
    const { queryByText } = renderWithProviders(<TeamTab />);
    expect(queryByText('2025/26 Season completed')).toBeNull();
  });

  // In the shell, not inside a carousel page: it must not scroll away, and it
  // is the same next deadline whichever gameweek is being browsed.
  it('pins the deadline banner above the carousel', () => {
    mockTeam = liveTeam(30);
    mockSeason = { data: { kind: 'live', gw: 30 } };
    const { getByText, getByTestId } = renderWithProviders(<TeamTab />);
    const banner = getByText('Deadline for Gameweek 31: Fri 28 Aug at 10:30');
    const carousel = getByTestId('gw-carousel');
    let node = banner.parent;
    while (node) {
      expect(node).not.toBe(carousel);
      node = node.parent;
    }
  });
});
