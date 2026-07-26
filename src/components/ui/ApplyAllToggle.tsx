import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ApplyCheckbox } from './ApplyCheckbox';
import { ApexTokens } from '@/constants/apexTokens';

interface ApplyAllToggleProps {
  checked: boolean;
  onToggle: () => void;
  tk: ApexTokens;
}

export function ApplyAllToggle({ checked, onToggle, tk }: ApplyAllToggleProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} hitSlop={6} accessibilityRole="button">
        <Text style={[styles.label, { color: checked ? tk.green : tk.faint }]}>
          Apply all
        </Text>
      </Pressable>
      <ApplyCheckbox
        checked={checked}
        onChange={onToggle}
        green={tk.green}
        border={tk.cardBorder}
        accessibilityLabel="Apply all"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
  },
});
