// Thin strip shown at the top of the app while there is no connectivity (#39).
// The app is read-only, so nothing needs disabling — this only signals that the
// data on screen is the last-known cache. Renders nothing while online, and also
// while connectivity is still unknown (null) at startup, to avoid a flash.
import { StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { useA11yAnnounce } from '@/lib/a11y';

/**
 * Whether the offline strip is on screen. It is docked above everything and
 * already paints the top safe-area inset, so anything below it must not add
 * its own — the tabs layout used to, producing a doubled gap while offline.
 *
 * Only true when explicitly offline: `null` (unknown) counts as online so the
 * banner never flashes on a cold start before NetInfo resolves.
 */
export function useOfflineStripVisible(): boolean {
  return useNetInfo().isConnected === false;
}

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const offline = useOfflineStripVisible();
  const message = "You're offline — showing your last saved data";
  useA11yAnnounce(offline ? message : null);
  if (!offline) return null;

  return (
    <View
      testID="offline-banner"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: tk.yellowSoft }]}
    >
      <Text style={[styles.text, { color: tk.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' },
  text: { fontSize: 13, fontWeight: '600' },
});
