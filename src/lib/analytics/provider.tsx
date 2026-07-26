import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { posthog, track } from '@/lib/analytics';

// Collapse concrete entity ids (player/target ids) to their route template so
// `screen` stays low-cardinality and carries no per-entity values.
export function normalizeScreen(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? '[id]' : seg))
    .join('/');
}

// Fires `screen_viewed` on every route change and refreshes feature flags when
// the app returns to the foreground (flags are cached to storage by the SDK for
// offline reads → "readable at startup + on resume").
export function useScreenTracking(): void {
  const pathname = usePathname();

  useEffect(() => {
    track('screen_viewed', { screen: normalizeScreen(pathname) });
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Voided explicitly: a rejected flag refresh (offline resume is the
      // common case) was an unhandled rejection, not a no-op (#178).
      if (state === 'active') {
        void posthog.reloadFeatureFlagsAsync().catch(() => {});
      }
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
