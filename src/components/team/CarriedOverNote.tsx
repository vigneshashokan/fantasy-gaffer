// src/components/team/CarriedOverNote.tsx
//
// Disclosure for a squad that was borrowed from the live gameweek because FPL
// had not published one for the gameweek being shown.
//
// FPL serves /entry/{id}/event/{gw}/picks/ only AFTER that gameweek's deadline,
// so the upcoming gameweek — the only one the decision layer is actionable for
// — 404s every week of the season. useSquad carries the live squad forward
// (what FPL itself does until a transfer is made) so the advice stays
// reachable, and this says so. Two things it must not do: claim the squad is
// current, or imply the user did something wrong. Transfers already made for
// the upcoming gameweek are private until the deadline (they need the
// authenticated /my-team/{id}, Phase 6), so we genuinely cannot see them.
//
// Rendered by both surfaces that show a squad for the upcoming gameweek:
// GameweekScreen's upcoming carousel page and the Transfer tab.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

export function CarriedOverNote({ from, tk }: { from: number | null; tk: ApexTokens }) {
  if (from === null) return null;
  return (
    <Text testID="carried-over-note" style={[styles.note, { color: tk.faint }]}>
      {`Carried over from GW${from}. FPL keeps the upcoming squad private until the deadline, so any transfers you have already made are not shown here.`}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: 'Archivo_500Medium', fontSize: 12, lineHeight: 17,
    marginTop: 8, paddingHorizontal: 4,
  },
});
