import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';
import type { PostHogEventProperties } from '@posthog/core';
import type { EventMap, EventName } from './events';

const KEY = Constants.expoConfig?.extra?.posthogKey as string | undefined;
const HOST =
  (Constants.expoConfig?.extra?.posthogHost as string | undefined) ??
  'https://us.i.posthog.com';

// Singleton. With no key the SDK is fully disabled (no network, no capture) but
// is still a valid client, so the provider + flag hooks mount safely and the
// typed flag defaults take over.
export const posthog = new PostHog(KEY ?? 'phc_disabled', {
  host: HOST,
  disabled: !KEY,
  disableGeoip: true, // don't resolve/store client IP geolocation
  captureAppLifecycleEvents: true,
});

export function track<E extends EventName>(event: E, props: EventMap[E]): void {
  posthog.capture(event, props as unknown as PostHogEventProperties);
}

export function identify(distinctId: string): void {
  posthog.identify(distinctId);
}

export function reset(): void {
  posthog.reset();
}

export function optIn(): void {
  posthog.optIn();
}

export function optOut(): void {
  posthog.optOut();
}

export function isOptedOut(): boolean {
  return posthog.optedOut;
}

export function setAnalyticsConsent(enabled: boolean): void {
  if (enabled) optIn();
  else optOut();
}

export type { EventName } from './events';
