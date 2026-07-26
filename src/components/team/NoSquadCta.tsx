// src/components/team/NoSquadCta.tsx
//
// Empty state for a LINKED team that has no picks for the gameweek being shown.
// FPL 404s /entry/{id}/event/{gw}/picks/ in two legitimate cases:
//
//   * pre-season, before the first deadline has passed (the whole window
//     between seasons — including right now, ahead of 2026/27 GW1); and
//   * any gameweek earlier than the one the manager joined on.
//
// Neither is a failure, so this must not look like one: an error card with a
// Retry would offer a button that cannot succeed until the deadline passes.
// Distinct from LinkTeamCta, which is for a user with no team linked at all.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

const FPL_MY_TEAM = 'https://fantasy.premierleague.com/my-team';

interface NoSquadCtaProps {
  tk: ApexTokens;
  /** Gameweek being shown, when the caller knows it. Omitted keeps the copy generic. */
  gw?: number;
}

export function NoSquadCta({ tk, gw }: NoSquadCtaProps) {
  return (
    <View
      testID="no-squad-cta"
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}
    >
      <Text style={[styles.title, { color: tk.text }]}>
        {gw ? `No squad for GW${gw} yet` : 'No squad to show yet'}
      </Text>
      <Text style={[styles.body, { color: tk.faint }]}>
        Your team is linked, but FPL has no picks for this gameweek. Pick your squad
        in the official FPL app before the deadline and it will appear here.
      </Text>
      <Pressable
        testID="open-fpl-cta"
        accessibilityRole="button"
        onPress={() => { void Linking.openURL(FPL_MY_TEAM); }}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: tk.activeFill, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.btnText}>Open FPL</Text>
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
  body:    { fontFamily: 'Archivo_500Medium',    fontSize: 14, lineHeight: 20 },
  btn:     { paddingVertical: 12, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  btnText: { fontFamily: 'Archivo_700Bold',      fontSize: 14, color: '#fff' },
});
