import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';
import { useReducedMotion, useA11yAnnounce, MAX_FONT_SCALE } from '@/lib/a11y';
import { useOnboardingStore, type TabKey } from '@/store/onboardingStore';

const TIPS: Record<TabKey, string> = {
  'top-picks': "Swipe between positions, or tap a player to see why we're suggesting them",
  team: 'Use the chevrons to plan the upcoming gameweek',
  transfer:
    'Tap any player to see who you should bring in — check the chip strip above for Wildcard/Bench Boost timing',
};

export function TabCoachmark({ tab }: { tab: TabKey }) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);
  const seen = useOnboardingStore((s) => s.seen[tab]);
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const reduced = useReducedMotion();
  const message = TIPS[tab];

  useA11yAnnounce(seen ? null : message);

  // Entrance only, same reduced-motion idiom as Skeleton.tsx's pulse gate:
  // skip the animation setup entirely rather than animate-then-snap.
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(1, { duration: 200 });
  }, [reduced, tab, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (seen) return null;

  return (
    <Animated.View
      testID={`coachmark-${tab}`}
      accessibilityLiveRegion="polite"
      style={[styles.bar, animatedStyle, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}
    >
      <Text style={[styles.text, { color: tk.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {message}
      </Text>
      <Pressable onPress={() => markSeen(tab)} accessibilityRole="button" hitSlop={8}>
        <Text style={[styles.dismiss, { color: tk.purple }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Got it
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 13,
  },
});
