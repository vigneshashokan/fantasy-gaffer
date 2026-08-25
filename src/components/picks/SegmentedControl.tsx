import React, { useState } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { ApexTokens } from '@/constants/apexTokens';

const PAD = 4;
const GAP = 4;

interface SegmentedControlProps {
  options: string[];
  value: number;
  onChange: (i: number) => void;
  tk: ApexTokens;
  /**
   * Fractional page position (0..n-1). Given one, the highlight slides with
   * the pager 1:1 instead of snapping at the halfway point of a swipe.
   * Optional so the control still renders standalone (tests).
   */
  progress?: SharedValue<number>;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  tk,
  progress,
}: SegmentedControlProps) {
  // One sliding pill, not a background swap per tab — a swap can't animate.
  const [trackW, setTrackW] = useState(0);
  const segW = trackW
    ? (trackW - PAD * 2 - GAP * (options.length - 1)) / options.length
    : 0;
  const pos = useDerivedValue(() => progress?.value ?? value);

  const pillStyle = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: pos.value * (segW + GAP) }],
    opacity: segW ? 1 : 0, // nothing to show before onLayout measures the track
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: tk.track }]}
    >
      <Animated.View
        style={[styles.pill, { backgroundColor: tk.activeFill }, pillStyle]}
      />
      {options.map((opt, i) => (
        <Segment
          key={opt}
          label={opt}
          index={i}
          selected={i === value}
          pos={pos}
          tk={tk}
          onPress={() => onChange(i)}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  index,
  selected,
  pos,
  tk,
  onPress,
}: {
  label: string;
  index: number;
  selected: boolean;
  pos: SharedValue<number>;
  tk: ApexTokens;
  onPress: () => void;
}) {
  // Crossfade with the pill's travel, so the label is never white ink sitting
  // on the bare track mid-swipe.
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.min(Math.abs(pos.value - index), 1),
      [0, 1],
      ['#fff', tk.variant],
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      // Named by its own text, per the text-button convention in
      // docs/a11y.md — only the role and selected state were missing.
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={styles.tab}
    >
      <Animated.Text style={[styles.label, textStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: GAP,
    padding: PAD,
    borderRadius: 12,
  },
  pill: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    letterSpacing: 0.13,
  },
});
