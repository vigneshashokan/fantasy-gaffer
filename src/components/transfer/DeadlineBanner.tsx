import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ApexTokens } from '@/constants/apexTokens';

interface DeadlineBannerProps {
  nextGw: number;
  deadline: string;
  tk: ApexTokens;
}

export function DeadlineBanner({ nextGw, deadline, tk }: DeadlineBannerProps) {
  return (
    <View accessibilityLiveRegion="polite" style={[styles.container, { backgroundColor: tk.deadlineBg }]}>
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={tk.deadlineFg} strokeWidth={2.2} />
        <Path
          d="M12 7.5V12l3 2"
          stroke={tk.deadlineFg}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.text, { color: tk.deadlineFg }]}>
        Deadline for Gameweek {nextGw}: {deadline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
    letterSpacing: -0.13,
  },
});
