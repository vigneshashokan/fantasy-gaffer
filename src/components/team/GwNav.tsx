import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { MAX_FONT_SCALE, useReducedMotion } from '@/lib/a11y';

export type GwState = 'live' | 'upcoming' | 'past';

interface GwSelectorProps {
  gw: number;
  state?: GwState;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  tk: ApexTokens;
}

/**
 * The v2 mock's gameweek control: one capsule holding both paging chevrons
 * around the "Gameweek N" status pill.
 *
 * It lives in the shell above the carousel, not inside a page — so it stays
 * put while the gameweek content swipes beneath it. That is what retired the
 * old arrangement (pill inside each page, arrows as fixed overlays pinned to
 * the screen edges, fading out on scroll so they didn't float over the pitch).
 */
export function GwSelector({
  gw,
  state = 'live',
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  tk,
}: GwSelectorProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.capsule, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
        <GwArrow dir="l" onPress={onPrev} disabled={prevDisabled} tk={tk} />
        <GwPill gw={gw} state={state} tk={tk} />
        <GwArrow dir="r" onPress={onNext} disabled={nextDisabled} tk={tk} />
      </View>
    </View>
  );
}

interface GwPillProps {
  gw: number;
  state?: GwState;
  tk: ApexTokens;
}

// The "Gameweek N" status pill — the capsule's centre.
export function GwPill({ gw, state = 'live', tk }: GwPillProps) {
  const pillColors = (() => {
    if (state === 'live') return { bg: tk.greenSoft, fg: tk.green, dotBg: tk.green };
    if (state === 'upcoming') return { bg: tk.yellowSoft, fg: tk.yellow, dotBg: tk.yellow };
    return { bg: tk.headStrip, fg: tk.faint, dotBg: null as string | null };
  })();

  return (
    <View style={[styles.pill, { backgroundColor: pillColors.bg }]}>
      {pillColors.dotBg && <PulseDot color={pillColors.dotBg} />}
      <Text
        style={[styles.pillText, { color: pillColors.fg }]}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        Gameweek {gw}
      </Text>
    </View>
  );
}

// A gameweek that is live or still to come is a moving target, so its dot
// breathes (the mock's `livePulse`). A finished one gets no dot at all.
function PulseDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return; // static dot — no looping pulse
    opacity.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />;
}

interface GwArrowProps {
  dir: 'l' | 'r';
  onPress?: () => void;
  disabled?: boolean;
  tk: ApexTokens;
}

// One paging chevron. Borderless — the capsule around it is the affordance.
export function GwArrow({ dir, onPress, disabled, tk }: GwArrowProps) {
  return (
    <Pressable
      testID={dir === 'l' ? 'gw-prev' : 'gw-next'}
      disabled={!!disabled}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={dir === 'l' ? 'Previous gameweek' : 'Next gameweek'}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, { opacity: disabled ? 0.3 : 1 }]}
    >
      <Icon name={dir === 'l' ? 'chevL' : 'chevR'} color={tk.variant} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 14,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    padding: 5,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minWidth: 150,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pillText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    letterSpacing: -0.14,
  },
});
