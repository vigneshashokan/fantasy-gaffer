// src/components/connect-team/ConfirmHero.tsx
//
// Identity card shown above the pitch preview on the confirm view.
// Purely presentational — takes a Preview, renders a gradient card with
// team name and manager name.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
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
    </LinearGradient>
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
});
