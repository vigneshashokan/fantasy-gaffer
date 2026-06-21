import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { posthog, track } from '@/lib/analytics';

// Fires `screen_viewed` on every route change and refreshes feature flags when
// the app returns to the foreground (flags are cached to storage by the SDK for
// offline reads → "readable at startup + on resume").
export function useScreenTracking(): void {
  const pathname = usePathname();

  useEffect(() => {
    track('screen_viewed', { screen: pathname });
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') posthog.reloadFeatureFlagsAsync();
    });
    return () => sub.remove();
  }, []);
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog} autocapture={false}>
      {children}
    </PostHogProvider>
  );
}
