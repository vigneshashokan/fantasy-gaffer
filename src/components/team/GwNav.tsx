import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';

interface GwPillProps {
  gw: number;
  state?: 'live' | 'upcoming' | 'past';
  tk: ApexTokens;
}

// The "Gameweek N" status pill. Lives inside each carousel page so it swipes
// with the gameweek content; the prev/next arrows are rendered separately
// (GwArrow) as fixed overlays by the carousel shell.
export function GwPill({ gw, state = 'live', tk }: GwPillProps) {
  const pillColors = (() => {
    if (state === 'live')
      return { bg: tk.greenSoft, fg: tk.green, dotBg: tk.green };
    if (state === 'upcoming')
      return { bg: tk.yellowSoft, fg: tk.yellow, dotBg: tk.yellow };
    const pastBg = tk.dark ? '#1E2434' : '#E7E9F2';
    return { bg: pastBg, fg: tk.faint, dotBg: null as string | null };
  })();

  return (
    <View style={styles.pillRow}>
      <View style={[styles.pill, { backgroundColor: pillColors.bg }]}>
        {pillColors.dotBg && (
          <View style={[styles.dot, { backgroundColor: pillColors.dotBg }]} />
        )}
        <Text style={[styles.pillText, { color: pillColors.fg }]}>
          Gameweek {gw}
        </Text>
      </View>
    </View>
  );
}

interface GwArrowProps {
  dir: 'l' | 'r';
  onPress?: () => void;
  disabled?: boolean;
  tk: ApexTokens;
}

// A single fixed gameweek-paging chevron. The carousel shell positions two of
// these as absolute overlays pinned at the screen edges so they stay put while
// the gameweek content swipes beneath them.
export function GwArrow({ dir, onPress, disabled, tk }: GwArrowProps) {
  return (
    <Pressable
      testID={dir === 'l' ? 'gw-prev' : 'gw-next'}
      disabled={!!disabled}
      onPress={onPress}
      style={[
        styles.btn,
        {
          backgroundColor: tk.card,
          borderColor: tk.dark ? 'rgba(255,255,255,0.22)' : '#C4C8D2',
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Icon name={dir === 'l' ? 'chevL' : 'chevR'} color={tk.variant} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingBottom: 16,
  },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    minWidth: 168,
    height: 46,
    justifyContent: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  pillText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 17,
    letterSpacing: 0.68,
  },
});
