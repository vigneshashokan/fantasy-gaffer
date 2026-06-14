import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { FormGameweek } from '@/api/playerSummary';

const MAX_H = 48;

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
  const max = Math.max(1, ...gameweeks.flatMap((g) => g.fixtures));
  return (
    <View style={styles.wrap}>
      {gameweeks.map((g) => (
        <View key={g.round} style={styles.col}>
          <View style={styles.bars}>
            {g.fixtures.map((pts, i) => {
              const h = Math.max(3, (Math.max(0, pts) / max) * MAX_H);
              return (
                <View key={`${g.round}-${i}`} style={styles.barCol}>
                  <Text style={[styles.val, { color: tk.text }]}>{pts}</Text>
                  <View style={[styles.bar, { height: h, backgroundColor: tk.green }]} />
                </View>
              );
            })}
          </View>
          <Text style={[styles.round, { color: tk.faint }]}>GW{g.round}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, height: MAX_H + 44 },
  col: { alignItems: 'center', gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barCol: { alignItems: 'center', gap: 4 },
  val: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11 },
  bar: { width: 16, borderRadius: 5 },
  round: { fontFamily: 'Archivo_500Medium', fontSize: 11 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 12 },
});
