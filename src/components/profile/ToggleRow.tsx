import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Toggle } from '@/components/ui/Toggle';
import { ApexTokens } from '@/constants/apexTokens';

interface ToggleRowProps {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  tk: ApexTokens;
  icon?: React.ReactNode;
  showDivider?: boolean;
}

export function ToggleRow({
  label,
  sub,
  value,
  onChange,
  tk,
  icon,
  showDivider,
}: ToggleRowProps) {
  return (
    <View
      style={[
        styles.row,
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
      {icon && <View style={styles.icon}>{icon}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: tk.text }]}>{label}</Text>
        {sub && (
          <Text style={[styles.sub, { color: tk.faint }]}>{sub}</Text>
        )}
      </View>
      <Toggle
        value={value}
        onChange={onChange}
        onColor={tk.green}
        offColor={tk.track}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
});
