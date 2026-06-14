import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import { availabilityState } from '@/utils/availability';

interface AvailabilityBannerProps {
  status: string;
  news: string;
  chanceNext: number | null;
  tk: ApexTokens;
}

export function AvailabilityBanner({ status, news, chanceNext, tk }: AvailabilityBannerProps) {
  const state = availabilityState(status, chanceNext);
  if (!state) return null;
  const bg = state.severity === 'out' ? tk.pinkSoft : tk.yellowSoft;
  const fg = state.severity === 'out' ? tk.pink : tk.yellow;
  const headline =
    chanceNext != null ? `${chanceNext}% to play` : state.severity === 'out' ? 'Unavailable' : 'Doubtful';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={[styles.headline, { color: fg }]}>{headline}</Text>
      {!!news && <Text style={[styles.news, { color: tk.text }]}>{news}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  headline: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13, letterSpacing: 0.3 },
  news: { fontFamily: 'Archivo_500Medium', fontSize: 13 },
});
