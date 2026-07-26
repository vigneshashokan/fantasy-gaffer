// src/__tests__/app/tabsLayout.test.tsx
//
// Layout-level regressions from #179: the tab background + coachmark used to
// track a state variable that only the tab bar's own `onPress` wrote, so any
// navigation the user didn't tap (a notification deep link, a back) left it
// stale; the bar hardcoded its bottom padding, ignoring the home-indicator
// inset; and the offline strip's top inset was doubled by this layout's own.

import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import TabsLayout from '@/app/(home)/(tabs)/_layout';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import type { Profile } from '@/types/fpl';

let mockSegments: string[] = ['(home)', '(tabs)', 'team'];

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: false, setDark: jest.fn() }),
}));

jest.mock('@/store/authStore', () => {
  const useAuthStore = (selector?: (s: unknown) => unknown) => {
    const state = { signOut: jest.fn(), session: null };
    return selector ? selector(state) : state;
  };
  useAuthStore.getState = () => ({ signOut: jest.fn() });
  return { __esModule: true, useAuthStore };
});

// The mock Tabs invokes the tabBar render prop with a nav state derived from
// the same `mockSegments` the router hook reports, so the two can't disagree.
jest.mock('expo-router', () => {
  function Tabs({ tabBar }: { tabBar: (p: unknown) => unknown }) {
    const names = ['top-picks', 'team', 'transfer'];
    const leaf = mockSegments[mockSegments.length - 1];
    const state = {
      index: Math.max(names.indexOf(leaf), 0),
      routes: names.map((name) => ({ name })),
    };
    return tabBar({ state, navigation: { navigate: jest.fn() } });
  }
  Tabs.Screen = function TabsScreen() {
    return null;
  };
  return {
    __esModule: true,
    Tabs,
    useRouter: () => ({ push: jest.fn() }),
    useSegments: () => mockSegments,
  };
});

jest.mock('@/components/onboarding/TabCoachmark', () => ({
  __esModule: true,
  // Surfaces the tab the coachmark was told about so the test can assert it.
  TabCoachmark: ({ tab }: { tab: string }) => {
    const { Text } = require('react-native');
    return <Text testID="coachmark-tab">{tab}</Text>;
  },
}));

jest.mock('@/api/profile', () => ({
  __esModule: true,
  useProfile: () => ({ data: { firstName: 'Vignesh', lastName: 'Ashokan' } satisfies Partial<Profile> }),
}));
jest.mock('@/api/manager', () => ({ __esModule: true, useManager: () => ({ data: undefined }) }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderLayout() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TabsLayout />
    </SafeAreaProvider>,
  );
}

// RN styles arrive as nested arrays; collapse to one object.
function flat(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(4).filter(Boolean));
}

beforeEach(() => {
  mockSegments = ['(home)', '(tabs)', 'team'];
  (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true });
});

describe('tabs layout — active tab derives from the router', () => {
  const t = getTheme('classic', false);
  const tk = apexTokens(false, 'classic');

  it('paints the team background and coachmark on the team route', () => {
    const { getByTestId } = renderLayout();
    expect(getByTestId('coachmark-tab').props.children).toBe('team');
    expect(flat(getByTestId('tabs-top-inset').props.style).backgroundColor).toBe(t.bg);
  });

  it('follows a deep link straight into top-picks, with no tab press', () => {
    mockSegments = ['(home)', '(tabs)', 'top-picks'];
    const { getByTestId } = renderLayout();
    expect(getByTestId('coachmark-tab').props.children).toBe('top-picks');
    // Non-team tabs paint the apex background, not the theme one.
    expect(flat(getByTestId('tabs-top-inset').props.style).backgroundColor).toBe(tk.bg);
  });

  it('follows a deep link into transfer', () => {
    mockSegments = ['(home)', '(tabs)', 'transfer'];
    expect(renderLayout().getByTestId('coachmark-tab').props.children).toBe('transfer');
  });

  it('keeps the last tab while a non-tab modal route is open', () => {
    mockSegments = ['(home)', '(tabs)', 'transfer'];
    const { getByTestId, rerender } = renderLayout();
    expect(getByTestId('coachmark-tab').props.children).toBe('transfer');

    mockSegments = ['(home)', 'settings'];
    rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TabsLayout />
      </SafeAreaProvider>,
    );
    expect(getByTestId('coachmark-tab').props.children).toBe('transfer');
  });
});

describe('tabs layout — safe areas', () => {
  it('clears the home-indicator inset instead of a hardcoded 22', () => {
    expect(flat(renderLayout().getByTestId('tab-bar').props.style).paddingBottom).toBe(34);
  });

  it('keeps a minimum bottom padding on devices with no inset', () => {
    const r = render(
      <SafeAreaProvider initialMetrics={{ ...METRICS, insets: { ...METRICS.insets, bottom: 0 } }}>
        <TabsLayout />
      </SafeAreaProvider>,
    );
    expect(flat(r.getByTestId('tab-bar').props.style).paddingBottom).toBe(12);
  });

  it('drops its own top inset while the offline strip is showing', () => {
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false });
    expect(flat(renderLayout().getByTestId('tabs-top-inset').props.style).height).toBe(0);
  });

  it('paints the top inset when online', () => {
    expect(flat(renderLayout().getByTestId('tabs-top-inset').props.style).height).toBe(47);
  });
});

describe('tabs layout — a11y', () => {
  it('groups the tabs in a tablist', () => {
    expect(renderLayout().getByTestId('tab-bar').props.accessibilityRole).toBe('tablist');
  });

  it('marks the routed tab selected without a press', () => {
    mockSegments = ['(home)', '(tabs)', 'transfer'];
    const { getByTestId } = renderLayout();
    expect(getByTestId('tab-transfer').props.accessibilityState?.selected).toBe(true);
    expect(getByTestId('tab-team').props.accessibilityState?.selected).toBe(false);
  });
});
