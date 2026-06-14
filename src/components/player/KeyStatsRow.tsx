import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ApexTokens } from '@/constants/apexTokens';

interface KeyStatsRowProps {
  form: number;
  total: number;
  ep: number;
  ict: number;
  bps: number;
  tk: ApexTokens;
}

export function KeyStatsRow({ form, total, ep, ict, bps, tk }: KeyStatsRowProps) {
  const stats = [
    { label: 'Form', value: form.toFixed(1) },
    { label: 'Total', value: String(total) },
    { label: 'ePts', value: ep.toFixed(1) },
    { label: 'ICT', value: ict.toFixed(1) },
    { label: 'BPS', value: String(bps) },
  ];
  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.tile, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
          <Text style={[styles.label, { color: tk.faint }]}>{s.label}</Text>
          <Text style={[styles.value, { color: tk.text }]}>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  tile: { flexGrow: 1, flexBasis: '30%', borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  label: { fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', marginBottom: 4 },
  value: { fontFamily: 'Archivo_800ExtraBold', fontSize: 18 },
});
