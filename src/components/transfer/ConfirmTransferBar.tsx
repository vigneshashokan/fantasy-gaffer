import { ApexTokens } from '@/constants/apexTokens';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ConfirmTransferBarProps {
  outName: string;
  inName: string;
  onConfirm: () => void;
  tk: ApexTokens;
}

export function ConfirmTransferBar({ outName, inName, onConfirm, tk }: ConfirmTransferBarProps) {
  return (
    <View style={[styles.bar, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
      <View style={styles.swapRow}>
        <Text style={[styles.out, { color: tk.pink }]} numberOfLines={1}>{outName}</Text>
        <Text style={[styles.arrow, { color: tk.faint }]}> → </Text>
        <Text style={[styles.in, { color: tk.green }]} numberOfLines={1}>{inName}</Text>
      </View>
      <Pressable onPress={onConfirm} style={[styles.btn, { backgroundColor: tk.activeFill }]}>
        <Text style={styles.btnText}>Confirm transfer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  out: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  arrow: { fontFamily: 'Archivo_700Bold', fontSize: 15 },
  in: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  btn: {
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
