import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Bridge NetInfo connectivity into React Query's onlineManager. RN has no
// browser online/offline events, so NetInfo is the source of truth. When
// onlineManager goes back online it auto-triggers refetchOnReconnect. Registered
// once via a side-effect import at the app root (see _layout.tsx), same pattern
// as `@/lib/reactQueryFocus`.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});
