import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { NextFixture } from '@/api/playerSummary';
import { fdrSoft } from '@/constants/fdr';
import { GUTTER } from '@/constants/theme';

interface FixtureStripProps {
  fixtures: NextFixture[];
  codeByTeamId: Record<number, ClubCode>;
  dark: boolean;
  tk: ApexTokens;
}

export function FixtureStrip({ fixtures, codeByTeamId, dark, tk }: FixtureStripProps) {
  if (fixtures.length === 0) {
    return <Text style={[styles.empty, { color: tk.faint }]}>No upcoming fixtures</Text>;
  }
  return (
    <View style={styles.wrap}>
      {fixtures.map((f) => {
        const c = fdrSoft(f.difficulty, dark);
        const opp = codeByTeamId[f.opponentTeamId] ?? '—';
        return (
          <View
            key={`${f.opponentTeamId}-${f.isHome ? 'H' : 'A'}-${f.event ?? 'tbd'}`}
            style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}
          >
            <Text style={[styles.gw, { color: tk.faint }]}>{f.event ? `GW${f.event}` : 'TBD'}</Text>
            <Text style={[styles.opp, { color: tk.text }]} numberOfLines={1}>
              {opp}
            </Text>
            <Text style={[styles.venue, { color: tk.faint }]}>{f.isHome ? 'Home' : 'Away'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6, paddingHorizontal: GUTTER },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingTop: 11,
    paddingBottom: 12,
    alignItems: 'center',
  },
  gw: { fontFamily: 'Archivo_600SemiBold', fontSize: 9.5, letterSpacing: 0.4 },
  opp: { fontFamily: 'Archivo_800ExtraBold', fontSize: 12.5, marginTop: 4 },
  venue: { fontFamily: 'Archivo_600SemiBold', fontSize: 9, letterSpacing: 0.45, textTransform: 'uppercase', marginTop: 2 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: GUTTER },
});
