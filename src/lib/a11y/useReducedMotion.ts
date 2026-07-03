import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True when the OS "Reduce Motion" setting is on. Defaults to false (motion) so
// tests and first paint animate normally until the async system value resolves.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
