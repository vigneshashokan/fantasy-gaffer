// src/components/ui/Skeleton.tsx
//
// Loading placeholder. Use in place of empty card content while a hook
// is pending. Height matches the rendered content height to avoid layout
// shift when data arrives.

import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemeStore } from '@/store/themeStore';
import { apexTokens } from '@/constants/apexTokens';

interface SkeletonProps {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
  testID?: string;
}

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
  testID,
}: SkeletonProps) {
  const { paletteKey, dark } = useThemeStore();
  const tk = apexTokens(dark, paletteKey);

  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.base,
        { height, width, borderRadius: radius, backgroundColor: tk.cardBorder },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
