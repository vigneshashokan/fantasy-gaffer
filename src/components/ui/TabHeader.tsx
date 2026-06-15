// src/components/ui/TabHeader.tsx
//
// The big title shown at the top of each main tab (Top Picks / My Team /
// Transfer). Single source of truth for the tab title style so the three
// tabs stay consistent. `trailing` sits to the right of the title (e.g. the
// Top Picks status pill); `subtitle` renders a muted line beneath it.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';

interface TabHeaderProps {
  title: string;
  tk: ApexTokens;
  trailing?: React.ReactNode;
  subtitle?: string;
}

export function TabHeader({ title, tk, trailing, subtitle }: TabHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: tk.text }]} numberOfLines={1}>
          {title}
        </Text>
        {trailing}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: tk.variant }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 5,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 36,
    letterSpacing: -0.72,
    lineHeight: 48,
  },
  subtitle: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
  },
});
