// #181 — the onboarding carousel was tap-only (horizontal swipe, the gesture
// everyone tries first, did nothing), and Top Picks claimed its picks would
// "refresh once the game week is done" even between gameweeks, when they were
// already fresh.
//
// The version-string and restore-account-skeleton wins from the same issue are
// covered in settingsScreen.test.tsx / restoreAccountScreen.test.tsx, which
// already carry those screens' mock walls.
import React from 'react';
import { Dimensions } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('expo-linear-gradient', () => ({ __esModule: true, LinearGradient: 'LinearGradient' }));
jest.mock('@/components/onboarding/SlideVisual', () => ({
  __esModule: true,
  SlideVisual: () => null,
}));
jest.mock('@/components/picks/PicksCard', () => ({ __esModule: true, PicksCard: () => null }));

let mockSeason: { data: { kind: string; gw?: number } | undefined } = { data: undefined };
const mockFixturesByGw = jest.fn((_gw: number) => ({ data: {} }));
jest.mock('@/api/fixtures', () => ({
  __esModule: true,
  useSeasonState: () => mockSeason,
  useCurrentGameweek: () => ({ data: { gw: 23 } }),
  useFixturesByGw: (gw: number) => mockFixturesByGw(gw),
  currentSeasonLabel: () => '2025/26',
  // Stubbed, not the real one: requireActual on this module drags in
  // supabase (AsyncStorage) and kills the suite. What matters here is that
  // the screen routes the timestamp through the shared formatter.
  formatDeadline: (iso: string) => `fmt(${iso})`,
}));
let mockUpdatedAt: string | undefined;
jest.mock('@/api/players', () => ({
  __esModule: true,
  useTopPicks: () => ({
    data: { GKP: [], DEF: [], MID: [], FWD: [] } satisfies Record<Position, TopPickPlayer[]>,
    gw: 24,
    updatedAt: mockUpdatedAt,
    isPending: false, isError: false, isRefetching: false, refetch: jest.fn(),
  }),
}));
jest.mock('@/api/squad', () => ({ __esModule: true, useSquad: () => ({ data: undefined }) }));

import Landing from '@/app/(onboarding)/index';
import TopPicksTab from '@/app/(home)/(tabs)/top-picks';
import type { Position, TopPickPlayer } from '@/types/fpl';

const STALE_NOTICE = 'Top Picks will refresh once the current game week is done.';

describe('onboarding carousel is swipeable (#181)', () => {
  it('mounts every slide in a paged horizontal scroller', () => {
    const { getByTestId, getByText } = render(<Landing />);
    const pager = getByTestId('onboarding-pager');
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.pagingEnabled).toBe(true);
    // All three are on screen at once — a swipe reveals them with no tap.
    getByText('Top Picks');
    getByText('My Team');
    getByText('Strategy');
  });

  it('tracks the landed page from the scroll, flipping the CTA on the last slide', () => {
    const { width, height } = Dimensions.get('window');
    const { getByTestId, getByText, queryByText } = render(<Landing />);
    expect(queryByText('Sign in')).toBeNull();
    fireEvent.scroll(getByTestId('onboarding-pager'), {
      nativeEvent: {
        contentOffset: { x: width * 2, y: 0 },
        contentSize: { width: width * 3, height },
        layoutMeasurement: { width, height },
      },
    });
    getByText('Sign in');
  });
});

describe('Top Picks staleness notice (#181)', () => {
  it('shows the refresh notice while a gameweek is live', () => {
    mockSeason = { data: { kind: 'live', gw: 23 } };
    render(<TopPicksTab />).getByText(STALE_NOTICE);
  });

  it('hides it between gameweeks, when the picks are actually fresh', () => {
    mockSeason = { data: { kind: 'next', gw: 24 } };
    const { queryByText, getByText } = render(<TopPicksTab />);
    expect(queryByText(STALE_NOTICE)).toBeNull();
    // The pill carries the same claim the missing subtitle implies.
    getByText('GW24 picks updated');
    // And the opponent strip under each name reads that same gameweek, not the
    // finished one `is_current` still points at.
    expect(mockFixturesByGw).toHaveBeenLastCalledWith(24);
  });

  it('hides it once the season is complete', () => {
    mockSeason = { data: { kind: 'complete' } };
    expect(render(<TopPicksTab />).queryByText(STALE_NOTICE)).toBeNull();
  });
});

// The header names how fresh the numbers under it are. It reads the model's own
// write time (`projections.computed_at`, carried by useTopPicks), never the
// fetch time — a pull-to-refresh that re-reads the same nightly batch must not
// look like new xPts.
describe('Top Picks xPts freshness line', () => {
  afterEach(() => { mockUpdatedAt = undefined; });

  it('states when the projections were last computed', () => {
    mockSeason = { data: { kind: 'next', gw: 24 } };
    mockUpdatedAt = '2026-08-26T04:30:00Z';
    render(<TopPicksTab />).getByText('xPts last updated at fmt(2026-08-26T04:30:00Z)');
  });

  it('says nothing when no projection row exists yet (off-season, cold start)', () => {
    mockSeason = { data: { kind: 'live', gw: 23 } };
    const { queryByText, getByText } = render(<TopPicksTab />);
    expect(queryByText(/xPts last updated/)).toBeNull();
    // The other subtitle line is untouched — both show together when both apply.
    getByText(STALE_NOTICE);
  });
});
