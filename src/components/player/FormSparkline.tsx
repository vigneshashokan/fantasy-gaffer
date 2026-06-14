import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';
import type { FormPoint } from '@/api/playerSummary';

const MAX_H = 48;

interface FormSparklineProps {
  points: FormPoint[];
  tk: ApexTokens;
}

export function FormSparkline({ points, tk }: FormSparklineProps) {
  if (points.length === 0) {
    return <Text style={[styles.empty, { color: tk.faint }]}>No appearances yet</Text>;
  }
  const max = Math.max(1, ...points.map((p) => p.points));
  return (
    <View style={styles.wrap}>
      {points.map((p) => {
        const h = Math.max(3, (Math.max(0, p.points) / max) * MAX_H);
        return (
          <View key={p.round} style={styles.col}>
            <Text style={[styles.val, { color: tk.text }]}>{p.points}</Text>
            <View style={[styles.bar, { height: h, backgroundColor: tk.green }]} />
            <Text style={[styles.round, { color: tk.faint }]}>GW{p.round}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, height: MAX_H + 44 },
  col: { alignItems: 'center', gap: 4 },
  val: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 12 },
  bar: { width: 28, borderRadius: 6 },
  round: { fontFamily: 'Archivo_500Medium', fontSize: 11 },
  empty: { fontFamily: 'Archivo_500Medium', fontSize: 13, fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 12 },
});
