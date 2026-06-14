import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { ClubCode } from '@/types/fpl';
import type { NextFixture } from '@/api/playerSummary';
import { fdrColor } from '@/constants/fdr';

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
        const c = fdrColor(f.difficulty, dark);
        const opp = codeByTeamId[f.opponentTeamId] ?? '—';
        return (
          <View key={`${f.opponentTeamId}-${f.isHome ? 'H' : 'A'}-${f.event ?? 'tbd'}`} style={[styles.chip, { backgroundColor: c.bg }]}>
            <Text style={[styles.opp, { color: c.text }]}>{opp}</Text>
            <Text style={[styles.ha, { color: c.text }]}>{f.isHome ? 'H' : 'A'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  opp: { fontFamily: 'Archivo_800ExtraBold', fontSize: 13, letterSpacing: 0.3 },
  ha: { fontFamily: 'Archivo_600SemiBold', fontSize: 10, opacity: 0.85 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 12 },
});
