import { Stack } from 'expo-router';
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
  useEmailAuthDeepLinks();

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
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

  useEffect(() => {
    if (fontsLoaded && themeHydrated && authHydrated) SplashScreen.hideAsync();
  }, [fontsLoaded, themeHydrated, authHydrated]);

  if (!fontsLoaded || !themeHydrated || !authHydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthErrorBoundary />
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
