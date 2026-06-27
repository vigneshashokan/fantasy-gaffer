import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

// Bridge React Native's AppState into React Query's focusManager. RN has no
// browser-style window focus event, so foreground/background transitions are
// the signal that drives refetchOnWindowFocus. Registered once via a
// side-effect import at the app root (see _layout.tsx), same pattern as
// `@/lib/notifications/handler`.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active');
  });
  return () => sub.remove();
});
