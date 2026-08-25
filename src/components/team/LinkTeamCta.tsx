// src/components/team/LinkTeamCta.tsx
//
// Empty state shown when a user has no fpl_team_id set. Routes to the
// connect-team flow.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ApexTokens } from '@/constants/apexTokens';
import { getTheme, GUTTER } from '@/constants/theme';
import { useThemeStore } from '@/store/themeStore';
import { PillBtn } from '@/components/ui/PillBtn';

interface LinkTeamCtaProps {
  tk: ApexTokens;
  variant: 'team' | 'transfer';
}

export function LinkTeamCta({ tk, variant }: LinkTeamCtaProps) {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const title = variant === 'team'
    ? 'Link your FPL team'
    : 'Link your FPL team to plan transfers';
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Text style={[styles.title, { color: tk.text }]}>{title}</Text>
      <Text style={[styles.body, { color: tk.faint }]}>
        Paste your FPL team ID and we'll pull in your squad.
      </Text>
      <PillBtn
        testID="connect-team-cta"
        variant="accent"
        accentFill={t.accent}
        accentInk={t.accentInk}
        onPress={() => router.push('/(onboarding)/connect-team')}
        style={styles.btn}
      >
        Connect FPL team
      </PillBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER, marginTop: 24,
    padding: 20, borderRadius: 20, borderWidth: 1,
    gap: 10,
  },
  title:   { fontFamily: 'Archivo_800ExtraBold', fontSize: 20 },
  body:    { fontFamily: 'Archivo_500Medium',    fontSize: 14 },
  btn:     { marginTop: 8 },
});
