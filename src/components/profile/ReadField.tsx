import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';

interface ReadFieldProps {
  label: string;
  value: string;
  tk: ApexTokens;
  showDivider?: boolean;
}

export function ReadField({ label, value, tk, showDivider }: ReadFieldProps) {
  return (
    <View
      style={[
        styles.row,
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: tk.faint }]}>{label}</Text>
        <Text style={[styles.value, { color: tk.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <View style={{ opacity: 0.6 }}>
        <Icon name="lock" color={tk.faint} size={15} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.74,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15.5,
    marginTop: 3,
  },
});
