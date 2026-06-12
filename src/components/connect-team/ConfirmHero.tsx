// src/components/connect-team/ConfirmHero.tsx
//
// Identity card shown above the pitch preview on the confirm view.
// Purely presentational — takes a Preview, renders a gradient card with
// team name + manager + rank / total pts / captain.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Preview } from '@/api/teamPreview';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';

interface ConfirmHeroProps {
  preview: Preview;
}

export function ConfirmHero({ preview }: ConfirmHeroProps) {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const from = t.primary;
  const to = dark ? '#0C1018' : '#5B0F63';

  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Text style={styles.teamName}>{preview.teamName}</Text>
      <Text style={styles.manager}>{preview.managerName || '—'}</Text>
      <View style={styles.stats}>
        <Stat label="Rank"      value={preview.rank.toLocaleString('en-US')} />
        <Stat label="Total pts" value={preview.totalPoints.toLocaleString('en-US')} />
        <Stat label="Captain"   value={preview.captainName || '—'} />
      </View>
    </LinearGradient>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  teamName: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    color: '#fff',
    letterSpacing: -0.3,
  },
  manager: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
  },
  stats: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 8,
  },
  statCell: { flexDirection: 'column' },
  statLabel: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  statValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
    color: '#fff',
  },
});
