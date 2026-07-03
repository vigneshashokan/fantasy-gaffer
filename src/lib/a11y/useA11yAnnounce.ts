import { useEffect, useRef } from 'react';
import { announce } from './announce';

// Announces `message` to assistive tech whenever it changes to a new non-empty
// value. Pair with `accessibilityLiveRegion` on the visible element (Android).
export function useA11yAnnounce(message: string | null | undefined): void {
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (message && message !== prev.current) announce(message);
    prev.current = message;
  }, [message]);
}
