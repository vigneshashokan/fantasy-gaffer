import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';

interface GwNavBarProps {
  gw: number;
  state?: 'live' | 'upcoming' | 'past';
  onPrev?: () => void;
  onNext?: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
  tk: ApexTokens;
}

export function GwNavBar({
  gw,
  state = 'live',
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  tk,
}: GwNavBarProps) {
  const pillColors = (() => {
    if (state === 'live')
      return { bg: tk.greenSoft, fg: tk.green, dotBg: tk.green };
    if (state === 'upcoming')
      return { bg: tk.yellowSoft, fg: tk.yellow, dotBg: tk.yellow };
    const pastBg = tk.dark ? '#1E2434' : '#E7E9F2';
    return { bg: pastBg, fg: tk.faint, dotBg: null as string | null };
  })();

  return (
    <View style={styles.container}>
      <NavBtn dir="l" disabled={!!disablePrev} onPress={onPrev} tk={tk} />
      <View
        style={[
          styles.pill,
          { backgroundColor: pillColors.bg },
        ]}
      >
        {pillColors.dotBg && (
          <View style={[styles.dot, { backgroundColor: pillColors.dotBg }]} />
        )}
        <Text style={[styles.pillText, { color: pillColors.fg }]}>
          Gameweek {gw}
        </Text>
      </View>
      <NavBtn dir="r" disabled={!!disableNext} onPress={onNext} tk={tk} />
    </View>
  );
}

function NavBtn({
  dir,
  onPress,
  disabled,
  tk,
}: {
  dir: 'l' | 'r';
  onPress?: () => void;
  disabled: boolean;
  tk: ApexTokens;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        {
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
