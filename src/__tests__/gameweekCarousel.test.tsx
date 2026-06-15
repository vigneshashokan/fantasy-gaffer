import React from 'react';
import { renderWithProviders } from './utils/renderWithProviders';

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, pitchStyle: 'classic' }),
}));
// Stand in for the page so we assert shell wiring, not page internals.
jest.mock('@/components/team/GameweekScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { __esModule: true, GameweekScreen: ({ gw }: { gw: number }) => <Text>Page {gw}</Text> };
});
jest.mock('@/components/team/LinkTeamCta', () => {
  const { Text } = jest.requireActual('react-native');
  return { __esModule: true, LinkTeamCta: () => <Text>Link your team</Text> };
});

let mockTeam: {
  data: unknown; isPending: boolean; isError: boolean; error: unknown; noTeam: boolean;
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

const liveTeam = (liveGw: number) => ({
  data: { liveGw, liveGwFinished: false, captainApplied: '', teamName: 'Apex Pitch FC' },
  isPending: false, isError: false, error: null, noTeam: false,
});

describe('TeamTab carousel shell', () => {
  beforeEach(() => {
    mockSeason = { data: undefined };
  });

  it('shows the link-team CTA when there is no team', () => {
    mockTeam = { data: null, isPending: false, isError: false, error: null, noTeam: true };
    const { getByText, queryByTestId } = renderWithProviders(<TeamTab />);
    expect(getByText('Link your team')).toBeTruthy();
    expect(queryByTestId('gw-carousel')).toBeNull();
  });

  it('renders the carousel with at least the live gameweek page', () => {
    mockTeam = liveTeam(30);
    const { getByTestId, getAllByText } = renderWithProviders(<TeamTab />);
    expect(getByTestId('gw-carousel')).toBeTruthy();
    expect(getAllByText(/^Page \d+$/).length).toBeGreaterThan(0);
  });

  it('shows the team name as the header', () => {
    mockTeam = liveTeam(30);
    const { getByText } = renderWithProviders(<TeamTab />);
    expect(getByText('Apex Pitch FC')).toBeTruthy();
  });

  it('renders both fixed paging arrows, enabled mid-season', () => {
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
    mockTeam = { data: undefined, isPending: true, isError: false, error: null, noTeam: false };
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
});
