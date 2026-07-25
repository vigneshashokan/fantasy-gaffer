import React from 'react';
import { render } from '@testing-library/react-native';

let mockLocked: boolean | null = null;
let mockBiometricHydrated = true;
const mockResolveLock = jest.fn();
let mockSession: object | null = { user: { id: 'u1' } };
let mockIsRestoring = false;

jest.mock('@tanstack/react-query', () => ({
  __esModule: true,
  useIsRestoring: () => mockIsRestoring,
}));

// _layout.tsx statically imports the font packages; Jest requires every static
// import at module-load time regardless of whether AppGate (the export under
// test) ever calls useFonts. The real chain (@expo-google-fonts/* → expo-font
// → expo-asset) doesn't resolve under Jest's/Node's module resolution in this
// repo (expo-asset only hoists nested under expo/node_modules, not to the
// top-level node_modules expo-font requires it from) — unrelated to this
// feature, so it's stubbed out here rather than fixed at the dependency level.
jest.mock('@expo-google-fonts/archivo', () => ({
  __esModule: true,
  useFonts: () => [true],
  Archivo_400Regular: 'Archivo_400Regular',
  Archivo_500Medium: 'Archivo_500Medium',
  Archivo_600SemiBold: 'Archivo_600SemiBold',
  Archivo_700Bold: 'Archivo_700Bold',
  Archivo_800ExtraBold: 'Archivo_800ExtraBold',
  Archivo_900Black: 'Archivo_900Black',
}));

jest.mock('@expo-google-fonts/jetbrains-mono', () => ({
  __esModule: true,
  JetBrainsMono_500Medium: 'JetBrainsMono_500Medium',
  JetBrainsMono_600SemiBold: 'JetBrainsMono_600SemiBold',
  JetBrainsMono_700Bold: 'JetBrainsMono_700Bold',
}));

jest.mock('expo-splash-screen', () => ({
  __esModule: true,
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    { Screen: () => null },
  ),
  useNavigationContainerRef: () => ({}),
}));

jest.mock('expo-status-bar', () => ({ __esModule: true, StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/analytics/provider', () => ({
  __esModule: true,
  AnalyticsProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useScreenTracking: () => {},
}));

jest.mock('@/components/auth/LockScreen', () => {
  // Required locally (not closed over the module-scope import) because
  // babel-plugin-jest-hoist forbids a hoisted mock factory referencing an
  // out-of-scope variable.
  const { Text } = require('react-native');
  return { __esModule: true, LockScreen: () => <Text>LOCK_SCREEN</Text> };
});

jest.mock('@/components/OfflineBanner', () => {
  const { Text } = require('react-native');
  return { __esModule: true, OfflineBanner: () => <Text>OFFLINE_BANNER</Text> };
});

jest.mock('@/lib/auth/authErrorBoundary', () => ({
  __esModule: true,
  AuthErrorBoundary: () => null,
}));

jest.mock('@/lib/auth/authCacheClear', () => ({
  __esModule: true,
  AuthCacheClear: () => null,
}));

const mockUseEmailAuthDeepLinks = jest.fn();
const mockUseNotificationDeepLinks = jest.fn();

jest.mock('@/lib/auth/deepLink', () => ({
  __esModule: true,
  useEmailAuthDeepLinks: () => mockUseEmailAuthDeepLinks(),
}));

jest.mock('@/lib/notifications/useNotificationDeepLinks', () => ({
  __esModule: true,
  useNotificationDeepLinks: () => mockUseNotificationDeepLinks(),
}));

jest.mock('@/lib/monitoring/sentry', () => ({
  __esModule: true,
  wrap: (c: unknown) => c,
  navigationIntegration: { registerNavigationContainer: jest.fn() },
}));

jest.mock('@/lib/notifications/handler', () => ({ __esModule: true }));
jest.mock('@/lib/reactQueryFocus', () => ({ __esModule: true }));
jest.mock('@/lib/query/onlineManager', () => ({ __esModule: true }));

// _layout.tsx statically imports both of these; the real modules import
// @react-native-async-storage/async-storage, which throws "NativeModule:
// AsyncStorage is null" at require-time under Jest (the documented
// @/lib/supabase-chain gotcha in CLAUDE.md — same class, different entry
// points). AppGate itself never touches either, but the import still runs.
jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('@/lib/query/persister', () => ({
  __esModule: true,
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000,
  persistOptions: {},
}));

jest.mock('@/store/biometricStore', () => {
  const stableResolveLock = (hasSession: boolean) => mockResolveLock(hasSession);
  return {
    __esModule: true,
    useBiometricStore: (
      selector: (s: {
        hydrated: boolean;
        locked: boolean | null;
        resolveLock: (hasSession: boolean) => void;
      }) => unknown,
    ) =>
      selector({
        hydrated: mockBiometricHydrated,
        locked: mockLocked,
        resolveLock: stableResolveLock,
      }),
  };
});

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: object | null }) => unknown) =>
    selector({ session: mockSession }),
}));

import { AppGate } from '@/app/_layout';
// Imported (not re-declared) so assertions read the same jest.fn() instance
// the mocked module above already hands to _layout.tsx — no new mock-prefixed
// outer variable needed.
import * as SplashScreen from 'expo-splash-screen';

const READY = { fontsLoaded: true, themeHydrated: true, authHydrated: true };

describe('AppGate — biometric lock', () => {
  beforeEach(() => {
    mockResolveLock.mockReset();
    (SplashScreen.hideAsync as jest.Mock).mockClear();
    mockUseEmailAuthDeepLinks.mockReset();
    mockUseNotificationDeepLinks.mockReset();
    mockLocked = null;
    mockBiometricHydrated = true;
    mockSession = { user: { id: 'u1' } };
    mockIsRestoring = false;
  });

  it('renders nothing while the lock verdict is undecided', () => {
    mockLocked = null;
    const { queryByText } = render(<AppGate {...READY} />);
    expect(queryByText('LOCK_SCREEN')).toBeNull();
    expect(queryByText('OFFLINE_BANNER')).toBeNull();
  });

  it('resolves the lock once ready, passing whether a session exists', () => {
    render(<AppGate {...READY} />);
    expect(mockResolveLock).toHaveBeenCalledWith(true);
  });

  it('does not resolve the lock before the biometric store has hydrated', () => {
    mockBiometricHydrated = false;
    render(<AppGate {...READY} />);
    expect(mockResolveLock).not.toHaveBeenCalled();
  });

  it('renders the LockScreen when locked', () => {
    mockLocked = true;
    const { getByText, queryByText } = render(<AppGate {...READY} />);
    expect(getByText('LOCK_SCREEN')).toBeTruthy();
    // Nothing behind the lock mounts.
    expect(queryByText('OFFLINE_BANNER')).toBeNull();
  });

  it('renders the app tree when unlocked', () => {
    mockLocked = false;
    const { getByText, queryByText } = render(<AppGate {...READY} />);
    expect(getByText('OFFLINE_BANNER')).toBeTruthy();
    expect(queryByText('LOCK_SCREEN')).toBeNull();
  });

  it('does not hide the splash while the lock verdict is undecided', () => {
    mockLocked = null;
    render(<AppGate {...READY} />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('hides the splash once the lock verdict resolves unlocked', () => {
    mockLocked = false;
    render(<AppGate {...READY} />);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash once the lock verdict resolves locked', () => {
    mockLocked = true;
    render(<AppGate {...READY} />);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  // Regression coverage for the deep-link/notification crash: both hooks call
  // router.push/replace, which throw if the root <Stack> isn't mounted. They
  // must not run until AppGate has actually resolved to the unlocked branch.
  it('does not run deep-link/notification navigation effects while the lock verdict is undecided', () => {
    mockLocked = null;
    render(<AppGate {...READY} />);
    expect(mockUseEmailAuthDeepLinks).not.toHaveBeenCalled();
    expect(mockUseNotificationDeepLinks).not.toHaveBeenCalled();
  });

  it('does not run deep-link/notification navigation effects while locked', () => {
    mockLocked = true;
    render(<AppGate {...READY} />);
    expect(mockUseEmailAuthDeepLinks).not.toHaveBeenCalled();
    expect(mockUseNotificationDeepLinks).not.toHaveBeenCalled();
  });

  it('runs deep-link/notification navigation effects once unlocked', () => {
    mockLocked = false;
    render(<AppGate {...READY} />);
    expect(mockUseEmailAuthDeepLinks).toHaveBeenCalled();
    expect(mockUseNotificationDeepLinks).toHaveBeenCalled();
  });

  it('starts the navigation effects only after the verdict transitions from undecided to unlocked', () => {
    mockLocked = null;
    const { rerender } = render(<AppGate {...READY} />);
    expect(mockUseEmailAuthDeepLinks).not.toHaveBeenCalled();
    expect(mockUseNotificationDeepLinks).not.toHaveBeenCalled();

    mockLocked = false;
    rerender(<AppGate {...READY} />);
    expect(mockUseEmailAuthDeepLinks).toHaveBeenCalled();
    expect(mockUseNotificationDeepLinks).toHaveBeenCalled();
  });

  it('resolves the lock with hasSession=false and unlocks when there is no session', () => {
    mockSession = null;
    // Simulates what the real biometricStore.resolveLock(false) always
    // produces (`enabled && hasSession` with hasSession=false is always
    // false) — biometricStore itself is mocked here, so we assert both
    // halves: the boolean AppGate passes in, and the render given that verdict.
    mockLocked = false;
    const { getByText, queryByText } = render(<AppGate {...READY} />);
    expect(mockResolveLock).toHaveBeenCalledWith(false);
    expect(queryByText('LOCK_SCREEN')).toBeNull();
    expect(getByText('OFFLINE_BANNER')).toBeTruthy();
  });
});
