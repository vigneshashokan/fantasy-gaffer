// src/components/team/NoSquadCta.tsx
//
// Empty state for a LINKED team that has no picks for the gameweek being shown.
// FPL 404s /entry/{id}/event/{gw}/picks/ in two legitimate cases:
//
//   * pre-season, before the first deadline has passed (the whole window
//     between seasons — including right now, ahead of 2026/27 GW1); and
//   * any gameweek earlier than the one the manager joined on.
//
// A third 404 case — the UPCOMING gameweek, which 404s every week of the season
// — does NOT reach here: useSquad carries the live squad forward for it, so the
// decision layer stays reachable. See CarriedOverNote.
//
// Neither is a failure, so this must not look like one: an error card with a
// Retry would offer a button that cannot succeed until the deadline passes.
// Distinct from LinkTeamCta, which is for a user with no team linked at all.
//
// The copy states the MECHANISM and promises nothing. An earlier version told
// the user to "pick your squad in the official FPL app and it will appear here"
// — false in both cases above, and it produced a real bug report: a user who
// had already picked read the empty state as the app being broken. Pre-deadline
// squads are only readable via the authenticated /my-team/{id}/ endpoint
// (Phase 6, #23-#27), so there is no action the user can take to fill this
// screen. Verified 2026-07-28: /entry/{id}/event/1/picks/ 404s for EVERY entry
// (1, 100, 12345, ...), not just new ones.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';
import { GUTTER } from '@/constants/theme';

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
        Your team is linked. FPL keeps squads private until the gameweek deadline
        has passed — so a squad you have already picked will not show here until
        then.
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
    marginHorizontal: GUTTER, marginTop: 24,
    padding: 20, borderRadius: 20, borderWidth: 1,
    gap: 10,
  },
  title:   { fontFamily: 'Archivo_800ExtraBold', fontSize: 20 },
  body:    { fontFamily: 'Archivo_500Medium',    fontSize: 14, lineHeight: 20 },
  btn:     { paddingVertical: 12, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  btnText: { fontFamily: 'Archivo_700Bold',      fontSize: 14, color: '#fff' },
});
