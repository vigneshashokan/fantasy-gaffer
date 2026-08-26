import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { FormGameweek } from '@/api/playerSummary';
import { GUTTER } from '@/constants/theme';

// Mock geometry: bars run 8pt (a blank) to 60pt (the best return in view).
const MIN_H = 8;
const RANGE = 52;
// Floor for the scale, so a run of 1-pointers doesn't draw one full-height bar.
const MIN_SCALE = 6;

interface FormSparklineProps {
  gameweeks: FormGameweek[];
  tk: ApexTokens;
}

export function FormSparkline({ gameweeks, tk }: FormSparklineProps) {
  if (gameweeks.length === 0) {
    return <Text style={[styles.empty, { color: tk.faint }]}>No appearances yet</Text>;
  }
  // Scale every bar against the best single-fixture score so heights are
  // comparable; a double gameweek renders two bars side by side under one GW.
  const max = Math.max(MIN_SCALE, ...gameweeks.flatMap((g) => g.fixtures));
  return (
    <View style={[styles.card, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      {gameweeks.map((g) => (
        <View key={g.round} style={styles.col}>
          <View style={styles.bars}>
            {g.fixtures.map((pts, i) => (
              <View key={`${g.round}-${i}`} style={styles.barCol}>
                <Text style={[styles.val, { color: tk.variant }]}>{pts}</Text>
                <View
                  style={[
                    styles.bar,
                    {
                      height: MIN_H + (Math.max(0, pts) / max) * RANGE,
                      // Haul / decent / blank, as the mock bands them.
                      backgroundColor: pts >= 8 ? tk.green : pts >= 4 ? tk.purple : tk.track,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
          <Text style={[styles.round, { color: tk.faint }]}>GW{g.round}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    marginHorizontal: GUTTER,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, alignSelf: 'stretch' },
  barCol: { flex: 1, maxWidth: 26, alignItems: 'stretch', gap: 6 },
  val: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11.5, textAlign: 'center' },
  bar: { borderRadius: 5 },
  round: { fontFamily: 'Archivo_600SemiBold', fontSize: 10 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: GUTTER },
});
