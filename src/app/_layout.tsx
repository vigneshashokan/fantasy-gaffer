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
  useEmailAuthDeepLinks();
  useScreenTracking();
  useNotificationDeepLinks();

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

function AppGate({
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
  const ready = fontsLoaded && themeHydrated && authHydrated && !isRestoring;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <AnalyticsProvider>
      <AuthErrorBoundary />
      <AuthCacheClear />
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </AnalyticsProvider>
  );
}

export default wrap(RootLayout);
