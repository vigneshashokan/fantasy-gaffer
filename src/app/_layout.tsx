import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useEffect, useMemo, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useBiometricStore } from '@/store/biometricStore';
import { LockScreen } from '@/components/auth/LockScreen';
import { useEmailAuthDeepLinks } from '@/lib/auth/deepLink';
import { AuthErrorBoundary } from '@/lib/auth/authErrorBoundary';
import { AuthCacheClear } from '@/lib/auth/authCacheClear';
import { QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AnalyticsProvider, useScreenTracking } from '@/lib/analytics/provider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { CACHE_MAX_AGE, persistOptions } from '@/lib/query/persister';
import '@/lib/notifications/handler';
import '@/lib/reactQueryFocus';
import '@/lib/query/onlineManager';
import { useNotificationDeepLinks } from '@/lib/notifications/useNotificationDeepLinks';
import { wrap, navigationIntegration } from '@/lib/monitoring/sentry';

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());
  const authHydrated = useAuthStore((s) => s.hydrated);
  const navRef = useNavigationContainerRef();
  useEffect(() => {
    if (navRef) navigationIntegration.registerNavigationContainer(navRef);
  }, [navRef]);
  useScreenTracking();

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            gcTime: CACHE_MAX_AGE,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
    [],
  );

  useEffect(() => {
    if (themeHydrated) return;
    return useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true));
  }, [themeHydrated]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AppGate
        fontsLoaded={fontsLoaded}
        themeHydrated={themeHydrated}
        authHydrated={authHydrated}
      />
    </PersistQueryClientProvider>
  );
}

// Side-effect components (render null) for the two navigation-imperative deep
// link hooks. Both call `router.push`/`router.replace`, which throw if the
// root <Stack> isn't mounted yet — so they must only mount once AppGate has
// resolved to the unlocked branch, beside <Stack>, not in RootLayout (which
// renders before the lock verdict is in).
//
// They are deliberately preceding siblings of <Stack> (not descendants) so
// they mount in the same commit <Stack> mounts. That's only safe because
// neither navigates during that first effect flush: deepLink.ts's
// Linking.useLinkingURL() does return its value synchronously on first
// render (it's a lazy useState initializer reading the native registry),
// but the effect that reads it only ever navigates from inside an async
// `exchangeCodeForSession(...).then()/.catch()` callback — never
// synchronously in the effect body — so any router call lands on a later
// tick, after <Stack> has finished mounting. useLastNotificationResponse()
// gets the same property a different way: it seeds in a layout effect, so
// its value is still undefined on this first pass. A future hook that both
// has a value on first render AND navigates synchronously from the effect
// body (no async gate) would reintroduce the pre-AppGate crash this
// structure was built to avoid.
//
// Replay semantics: useLinkingURL() (not the deprecated useURL()) reads the
// native ExpoLinkingRegistry, which is refreshed on every
// `application(_:open:)` call — cold launch AND a link tapped while the app
// is already running — so a link tapped while locked (this component not
// yet mounted) is still picked up once it mounts here on unlock. See the
// comment in deepLink.ts for the verified source citations.
function EmailAuthDeepLinks() {
  useEmailAuthDeepLinks();
  return null;
}

function NotificationDeepLinks() {
  useNotificationDeepLinks();
  return null;
}

export function AppGate({
  fontsLoaded,
  themeHydrated,
  authHydrated,
}: {
  fontsLoaded: boolean;
  themeHydrated: boolean;
  authHydrated: boolean;
}) {
  // Hold the splash until the persisted cache has rehydrated, so the first paint
  // already has data — no spinner flash when the cache is fresh.
  const isRestoring = useIsRestoring();
  const biometricHydrated = useBiometricStore((s) => s.hydrated);
  const locked = useBiometricStore((s) => s.locked);
  const resolveLock = useBiometricStore((s) => s.resolveLock);
  const session = useAuthStore((s) => s.session);
  const ready =
    fontsLoaded && themeHydrated && authHydrated && biometricHydrated && !isRestoring;

  // Resolve the lock exactly once per launch. resolveLock itself is idempotent,
  // so re-runs from a later session change are no-ops.
  useEffect(() => {
    if (ready) resolveLock(!!session);
  }, [ready, session, resolveLock]);

  // Keep the splash up until the verdict is in, so no frame shows app content
  // behind an unresolved lock.
  useEffect(() => {
    if (ready && locked !== null) SplashScreen.hideAsync();
  }, [ready, locked]);

  if (!ready || locked === null) return null;

  return (
    <AnalyticsProvider>
      <AuthErrorBoundary />
      <AuthCacheClear />
      <SafeAreaProvider>
        <StatusBar style="light" />
        {locked ? (
          <LockScreen />
        ) : (
          <>
            <OfflineBanner />
            <EmailAuthDeepLinks />
            <NotificationDeepLinks />
            <Stack screenOptions={{ headerShown: false }}>
              {/* Legal screens are reached from the Settings modal ((home) stack)
                  and the signup screen. As root-level cards they render BEHIND the
                  Settings native modal on iOS; present them as modals so they
                  appear above it. Other routes auto-register with defaults. */}
              <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
              <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
            </Stack>
          </>
        )}
      </SafeAreaProvider>
    </AnalyticsProvider>
  );
}

export default wrap(RootLayout);
