import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';
import { Icon } from '@/components/ui/Icon';

interface SeasonCompleteBannerProps {
  seasonLabel: string;
  tk: ApexTokens;
}

// Mirrors the Top Picks season-complete indicator (green "… Season completed"
// with a check), shaped like DeadlineBanner so it reads as a sibling banner
// above the gameweek card on the Transfer tab.
export function SeasonCompleteBanner({ seasonLabel, tk }: SeasonCompleteBannerProps) {
  return (
    <View style={[styles.container, { backgroundColor: tk.greenSoft }]}>
      <Icon name="check" color={tk.green} size={16} />
      <Text style={[styles.text, { color: tk.green }]}>{seasonLabel} Season completed</Text>
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
