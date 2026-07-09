jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { AccessibilityInfo } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { TabCoachmark } from '@/components/onboarding/TabCoachmark';
import { useOnboardingStore } from '@/store/onboardingStore';

describe('<TabCoachmark />', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    useOnboardingStore.setState({ seen: { 'top-picks': false, team: false, transfer: false } });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the tip and testID for an unseen tab', () => {
    const r = render(<TabCoachmark tab="team" />);
    expect(r.getByTestId('coachmark-team')).toBeTruthy();
    expect(r.getByText('Use the chevrons to plan the upcoming gameweek')).toBeTruthy();
  });

  it('shows the Top Picks copy', () => {
    const r = render(<TabCoachmark tab="top-picks" />);
    expect(r.getByText("Swipe between positions, or tap a player to see why we're suggesting them")).toBeTruthy();
  });

  it('shows the Transfer copy, folding in chip-timing guidance', () => {
    const r = render(<TabCoachmark tab="transfer" />);
    expect(
      r.getByText('Tap any player to see who you should bring in — check the chip strip above for Wildcard/Bench Boost timing'),
    ).toBeTruthy();
  });

  it('renders nothing once the tab is marked seen', () => {
    useOnboardingStore.setState({ seen: { 'top-picks': false, team: true, transfer: false } });
    const r = render(<TabCoachmark tab="team" />);
    expect(r.queryByTestId('coachmark-team')).toBeNull();
  });

  it('pressing "Got it" marks the tab seen in the store', async () => {
    const r = render(<TabCoachmark tab="transfer" />);
    fireEvent.press(r.getByText('Got it'));
    await act(async () => {});
    expect(useOnboardingStore.getState().seen.transfer).toBe(true);
  });

  it('consults the reduce-motion setting on mount', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    render(<TabCoachmark tab="top-picks" />);
    expect(spy).toHaveBeenCalled();
  });

  it('still renders when reduce-motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const r = render(<TabCoachmark tab="top-picks" />);
    await act(async () => {});
    expect(r.getByTestId('coachmark-top-picks')).toBeTruthy();
  });
});
