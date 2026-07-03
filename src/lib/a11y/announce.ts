import { AccessibilityInfo } from 'react-native';

// Single egress for screen-reader announcements (iOS has no live region, so
// status/error changes must be announced imperatively). Priority (polite vs
// assertive) is expressed via the element's `accessibilityLiveRegion` on Android.
export function announce(message: string): void {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}
