import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';

interface CheckboxProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  text: string;
  textMuted: string;
}

export function Checkbox({
  label,
  value,
  onChange,
  accent,
  text,
  textMuted,
}: CheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: value ? accent : textMuted,
            backgroundColor: value ? accent : 'transparent',
          },
        ]}
      >
        {value && <Icon name="check" color="#fff" size={14} />}
      </View>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
});
