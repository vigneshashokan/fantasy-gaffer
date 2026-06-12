// src/components/team/LinkTeamCta.tsx
//
// Empty state shown when a user has no fpl_team_id set. CTA is non-functional
// in #21; #22 will wire it to the squad-import flow.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

interface LinkTeamCtaProps {
  tk: ApexTokens;
  variant: 'team' | 'transfer';
}

export function LinkTeamCta({ tk, variant }: LinkTeamCtaProps) {
  const title = variant === 'team'
    ? 'Link your FPL team'
    : 'Link your FPL team to plan transfers';
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <Text style={[styles.title, { color: tk.text }]}>{title}</Text>
      <Text style={[styles.body, { color: tk.faint }]}>
        Paste your FPL team ID and we'll pull in your squad. Available in the next update.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled
        style={[styles.btn, { backgroundColor: tk.cardBorder, opacity: 0.6 }]}
      >
        <Text style={styles.btnText}>Coming in #22</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 24,
    padding: 20, borderRadius: 20, borderWidth: 1,
    gap: 10,
  },
  title:   { fontFamily: 'Archivo_800ExtraBold', fontSize: 20 },
  body:    { fontFamily: 'Archivo_500Medium',    fontSize: 14 },
  btn:     { paddingVertical: 12, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  btnText: { fontFamily: 'Archivo_700Bold',      fontSize: 14, color: '#fff' },
});
